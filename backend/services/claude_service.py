"""
Claude API service for NexChat.

Tools used in this service are Anthropic server-side tools — Anthropic's infrastructure
executes them; no custom implementation is required on our side.

  web_search_20260209     → https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
  web_fetch_20260209      → https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
  code_execution_20260120 → https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool

Dynamic filtering: web_search_20260209 and web_fetch_20260209 can filter search/fetch
results before they reach the context window when code_execution is also enabled —
improving accuracy while reducing token consumption.

Streaming follows the event-based pattern described in:
  https://platform.claude.com/docs/en/build-with-claude/streaming

Adaptive thinking follows:
  https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking

Resume assistant uses Anthropic Agent Skills (docx, pdf) with the Files API:
  Files API: https://platform.claude.com/docs/en/build-with-claude/files
  Skills:    https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart
"""

import io
import os
import json
import time
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, List, Optional

import anthropic
import services.cosmos_service as db_svc

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("AZURE_FOUNDRY_BASE_URL", "")
API_KEY = os.getenv("AZURE_FOUNDRY_API_KEY", "")
MODEL_ID = os.getenv("AZURE_FOUNDRY_MODEL", "claude-sonnet-4-6")

# ── Server-side tool definitions ─────────────────────────────────────────────
# v20260209 variants enable dynamic filtering: when code_execution is also
# present, Claude can post-process search/fetch results before they hit the
# context window, keeping only relevant content and cutting token costs.

WEB_SEARCH_TOOL = {
    "type": "web_search_20260209",
    "name": "web_search",
    "max_uses": 5,
}

WEB_FETCH_TOOL = {
    "type": "web_fetch_20260209",
    "name": "web_fetch",
    "max_uses": 5,
}

CODE_EXECUTION_TOOL = {
    "type": "code_execution_20260120",
    "name": "code_execution",
}

# Skills require code_execution_20250825 with the code-execution-2025-08-25 beta.
# Newer code execution revisions also satisfy the Skills requirement, but this
# version matches the skills quickstart examples exactly.
SKILLS_CODE_EXECUTION_TOOL = {
    "type": "code_execution_20250825",
    "name": "code_execution",
}

# ── System prompts ────────────────────────────────────────────────────────────
CLAUDE_SYSTEM = (
    "You are a helpful AI assistant called NexChat. You are knowledgeable, precise, "
    "and conversational. When using tools, briefly explain what you are doing and "
    "summarize findings clearly. When web search or web fetch results contain "
    "citations, include them in your response."
)

RESUME_SYSTEM = (
    "You are an expert resume writer and career coach called NexChat Resume Assistant. "
    "You help users craft compelling, ATS-optimized resumes tailored to specific roles. "
    "When analyzing uploaded resumes, provide specific, actionable improvements. "
    "When generating a document, use the provided skill to produce a well-formatted, "
    "professional output. Structure resumes with: Contact Info, Professional Summary, "
    "Experience, Education, Skills, and optional sections."
)


# ── Client factory ────────────────────────────────────────────────────────────
def _get_async_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(
        base_url=BASE_URL,
        api_key=API_KEY,
    )


def _get_sync_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        base_url=BASE_URL,
        api_key=API_KEY,
    )


# ── Content helpers ───────────────────────────────────────────────────────────
def _build_content_blocks(text: str, attachments: Optional[list] = None) -> list:
    """Build a Messages API content array from text + optional file attachments."""
    blocks: list = []
    if attachments:
        for att in attachments:
            mime = att.get("content_type", "application/octet-stream")
            data = att.get("data", "")
            name = att.get("name", "file")
            if mime.startswith("image/"):
                blocks.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime, "data": data},
                })
            else:
                try:
                    decoded = base64.b64decode(data).decode("utf-8", errors="replace")
                    blocks.append({
                        "type": "text",
                        "text": f"[File: {name}]\n{decoded[:10_000]}",
                    })
                except Exception:
                    blocks.append({
                        "type": "text",
                        "text": f"[File: {name}] (binary — content not displayable)",
                    })
    if text:
        blocks.append({"type": "text", "text": text})
    return blocks or [{"type": "text", "text": text}]


def _serialize_content(content) -> list:
    """
    Serialize an assistant message's content blocks back into API-ready dicts.

    Used when re-sending accumulated messages after a pause_turn stop reason
    (server-side tools hit the iteration limit and we need to continue).
    Handles text, server_tool_use, web_search_tool_result, web_fetch_tool_result,
    bash_code_execution_tool_result, thinking, and redacted_thinking blocks.

    Thinking blocks must be passed back unchanged (including the signature field)
    so the API can verify they were generated by Claude.
    """
    result: list = []
    for block in content:
        btype = getattr(block, "type", None)

        if btype == "text":
            result.append({"type": "text", "text": block.text})

        elif btype == "server_tool_use":
            result.append({
                "type": "server_tool_use",
                "id": block.id,
                "name": block.name,
                "input": getattr(block, "input", {}),
            })

        elif btype in (
            "web_search_tool_result",
            "web_fetch_tool_result",
            "bash_code_execution_tool_result",
        ):
            # Prefer model_dump() (Pydantic v2) for a complete, correct serialisation
            if hasattr(block, "model_dump"):
                result.append(block.model_dump())
            else:
                entry: dict = {"type": btype}
                if hasattr(block, "tool_use_id"):
                    entry["tool_use_id"] = block.tool_use_id
                if hasattr(block, "content"):
                    entry["content"] = block.content
                result.append(entry)

        elif btype == "thinking":
            # signature is required for multi-turn continuity — always include it
            entry: dict = {"type": "thinking", "thinking": block.thinking}
            sig = getattr(block, "signature", None)
            if sig:
                entry["signature"] = sig
            result.append(entry)

        elif btype == "redacted_thinking":
            result.append({"type": "redacted_thinking", "data": block.data})

    return result


# ── Files API helpers ─────────────────────────────────────────────────────────
async def _upload_file(
    client: anthropic.AsyncAnthropic, data: bytes, mime: str, name: str
) -> str:
    """Upload raw bytes to the Files API and return the file_id."""
    resp = await client.beta.files.upload(
        file=(name, io.BytesIO(data), mime),
    )
    return resp.id


def _extract_skill_file_id(content: list) -> Optional[str]:
    """
    Extract the file_id of the last skill-generated file from response content.

    Skills produce their output inside bash_code_execution_tool_result or
    code_execution_tool_result blocks. The file reference lives at:
      block.content.content[*].file_id
    """
    file_id: Optional[str] = None
    for block in content:
        btype = getattr(block, "type", None)
        if btype in ("code_execution_tool_result", "bash_code_execution_tool_result"):
            expected = (
                "code_execution_result"
                if btype == "code_execution_tool_result"
                else "bash_code_execution_result"
            )
            block_content = getattr(block, "content", None)
            if block_content and getattr(block_content, "type", None) == expected:
                for item in getattr(block_content, "content", []):
                    fid = getattr(item, "file_id", None)
                    if fid:
                        file_id = fid
    return file_id


async def download_generated_file(file_id: str) -> tuple[bytes, str]:
    """
    Download a skill-generated file from the Files API.
    Returns (raw_bytes, filename).
    """
    client = _get_async_client()
    meta = await client.beta.files.retrieve_metadata(file_id)
    content = await client.beta.files.download(file_id)
    if hasattr(content, "aread"):
        data = await content.aread()
    elif hasattr(content, "read"):
        data = content.read()
    else:
        data = getattr(content, "content", b"")
    filename = getattr(meta, "filename", None) or f"{file_id}.bin"
    return data, filename


# ── Main streaming function ───────────────────────────────────────────────────
async def stream_chat(
    db_messages: List[dict],
    conversation: dict,
    new_message: str,
    attachments: Optional[list] = None,
    model: Optional[str] = None,
    output_format: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream a chat response as SSE events.

    Resume assistant (docx/pdf):
      1. Each attachment is uploaded to the Files API → file_id
      2. The user turn includes container_upload blocks so the skill container
         can read the uploaded files
      3. The matching skill (docx or pdf) is added to the container
      4. After streaming, the skill-generated file_id is extracted and emitted
         as a file_generated SSE event

    Claude agent:
      Tools are built dynamically from conversation settings on every call.
      Dynamic filtering in web_search/web_fetch requires code_execution to be enabled.
      Adaptive thinking: thinking: {type: "adaptive"} when thinking is on.

    The loop re-enters only on pause_turn (server-side tools / skills hit an
    iteration limit). All other stop reasons break immediately.

    SSE events emitted:
      text_delta      – streaming text token
      thinking_delta  – streaming thinking token (adaptive thinking only)
      tool_start      – a server-side tool was invoked
      tool_result     – server returned a tool result block
      file_generated  – skill produced a file: {file_id, format}
      message_stop    – final: full_text, usage, tools_used, model
    """
    client = _get_async_client()
    conversation_id: str = conversation["id"]
    agent_type = conversation.get("agentType", "claude")
    settings = conversation.get("settings", {})
    system_prompt = RESUME_SYSTEM if agent_type == "resume_assistant" else CLAUDE_SYSTEM
    effective_model = model if model else MODEL_ID

    use_skills = agent_type == "resume_assistant" and output_format in ("docx", "pdf")

    # ── Container reuse for skills ────────────────────────────────────────────
    # Containers expire after 30 days. Reuse the stored ID when still valid;
    # a new one will be created (and its ID saved) if absent or expired.
    existing_container_id: Optional[str] = None
    if use_skills:
        stored_id = conversation.get("skillContainerId")
        stored_at = conversation.get("skillContainerCreatedAt")
        if stored_id and stored_at:
            try:
                created = datetime.fromisoformat(stored_at)
                if (datetime.now(timezone.utc) - created) < timedelta(days=30):
                    existing_container_id = stored_id
            except Exception:
                pass  # malformed timestamp — will create a fresh container

    # ── Persist user message (item 1 of 2) ───────────────────────────────────
    start_ts = time.monotonic()
    user_msg = await db_svc.save_message(
        conversation_id=conversation_id,
        role="user",
        content=new_message,
        attachments=attachments,
        model=model,
    )

    # Rebuild message history from stored records
    api_messages: list = [
        {"role": m["role"], "content": m["content"]}
        for m in db_messages
    ]

    if use_skills:
        # Upload each attachment to the Files API so the skill container can access it
        file_ids: list[str] = []
        if attachments:
            for att in attachments:
                mime = att.get("content_type", "application/octet-stream")
                name = att.get("name", "file")
                raw = base64.b64decode(att.get("data", ""))
                try:
                    fid = await _upload_file(client, raw, mime, name)
                    file_ids.append(fid)
                except Exception as exc:
                    logger.warning("Files API upload failed for %s: %s", name, exc)

        # container_upload blocks make the uploaded files available inside
        # the code execution container where the skill runs
        user_content: list = [
            {"type": "container_upload", "file_id": fid} for fid in file_ids
        ]
        if new_message:
            user_content.append({"type": "text", "text": new_message})
        if not user_content:
            user_content = [{"type": "text", "text": "Generate a professional resume."}]
        api_messages.append({"role": "user", "content": user_content})
    else:
        # Append the new user turn (with optional attachments embedded inline)
        api_messages.append({
            "role": "user",
            "content": _build_content_blocks(new_message, attachments),
        })

    # ── Build tools array dynamically from per-request settings ──────────────
    # Only claude agent supports tools; resume_assistant uses skills instead.
    tools: list = []
    use_thinking = False
    if agent_type == "claude":
        if settings.get("web_search"):
            tools.append(WEB_SEARCH_TOOL)
        if settings.get("web_fetch"):
            tools.append(WEB_FETCH_TOOL)
        if settings.get("code_execution"):
            tools.append(CODE_EXECUTION_TOOL)
        use_thinking = bool(settings.get("thinking"))

    full_response_text = ""
    tools_used: list[str] = []
    total_usage = {
        "input": 0,
        "output": 0,
        "cache_read": 0,
        "cache_creation": 0,
        "thinking": 0,
    }
    generated_file_id: Optional[str] = None

    # ── Streaming loop ────────────────────────────────────────────────────────
    # Re-enters only on pause_turn (server-side tools / skills hit iteration cap).
    while True:
        if use_skills:
            # Skills path: beta headers enable Files API + Agent Skills
            stream_kwargs: dict = {
                "model": effective_model,
                "max_tokens": 8096,
                "system": RESUME_SYSTEM,
                "messages": api_messages,
                "tools": [SKILLS_CODE_EXECUTION_TOOL],
                "extra_headers": {
                    "anthropic-beta": (
                        "files-api-2025-04-14,"
                        "code-execution-2025-08-25,"
                        "skills-2025-10-02"
                    ),
                },
                "extra_body": {
                    "container": (
                        {"id": existing_container_id}
                        if existing_container_id
                        else {
                            "skills": [
                                {
                                    "type": "anthropic",
                                    "skill_id": output_format,  # "docx" or "pdf"
                                    "version": "latest",
                                }
                            ],
                        }
                    ),
                },
            }
        else:
            stream_kwargs: dict = {
                "model": effective_model,
                # Adaptive thinking needs headroom; bump max_tokens when enabled.
                "max_tokens": 16000 if use_thinking else 8096,
                "system": system_prompt,
                "messages": api_messages,
            }
            if tools:
                stream_kwargs["tools"] = tools
            if use_thinking:
                stream_kwargs["thinking"] = {"type": "adaptive"}

        stream_context = client.messages.stream(**stream_kwargs)

        async with stream_context as stream:
            async for event in stream:
                etype = getattr(event, "type", None)

                if etype == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if block is None:
                        continue
                    btype = getattr(block, "type", None)

                    if btype == "server_tool_use":
                        # Anthropic's servers are about to execute a tool
                        tools_used.append(block.name)
                        yield f"data: {json.dumps({'type': 'tool_start', 'name': block.name})}\n\n"

                    elif btype in ("web_search_tool_result", "web_fetch_tool_result"):
                        yield f"data: {json.dumps({'type': 'tool_result', 'name': btype})}\n\n"

                    elif btype == "bash_code_execution_tool_result":
                        yield f"data: {json.dumps({'type': 'tool_result', 'name': 'code_execution'})}\n\n"

                elif etype == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta is None:
                        continue
                    dtype = getattr(delta, "type", None)

                    if dtype == "text_delta":
                        full_response_text += delta.text
                        yield f"data: {json.dumps({'type': 'text_delta', 'content': delta.text})}\n\n"

                    elif dtype == "thinking_delta":
                        yield f"data: {json.dumps({'type': 'thinking_delta', 'content': delta.thinking})}\n\n"

            final = await stream.get_final_message()

        # Accumulate token usage across all iterations (pause_turn may produce > 1)
        u = final.usage
        total_usage["input"] += u.input_tokens
        total_usage["output"] += u.output_tokens
        total_usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
        total_usage["cache_creation"] += getattr(u, "cache_creation_input_tokens", 0) or 0
        details = getattr(u, "output_tokens_details", None)
        if details:
            total_usage["thinking"] += getattr(details, "thinking_tokens", 0) or 0

        # Extract skill-generated file id on first discovery
        if use_skills and generated_file_id is None:
            generated_file_id = _extract_skill_file_id(final.content)

        # Persist container ID from first reply so subsequent turns reuse it
        if use_skills and existing_container_id is None:
            raw = getattr(final, "container", None)
            if raw is None:
                raw = (final.model_extra or {}).get("container")
            if raw is not None:
                cid = (
                    raw.get("id") if isinstance(raw, dict) else getattr(raw, "id", None)
                )
                if cid:
                    await db_svc.update_conversation(
                        conversation_id,
                        {
                            "skillContainerId": cid,
                            "skillContainerCreatedAt": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    existing_container_id = cid  # skip on pause_turn re-entries

        stop_reason = final.stop_reason

        if stop_reason == "pause_turn":
            # Skills / server-side tools hit iteration limit — re-enter with full history
            api_messages.append({
                "role": "assistant",
                "content": _serialize_content(final.content),
            })
            continue

        # end_turn, max_tokens, stop_sequence, or refusal → done
        break

    total_usage["total"] = total_usage["input"] + total_usage["output"]
    latency_ms = int((time.monotonic() - start_ts) * 1000)

    # ── Persist AI reply (item 2 of 2) ───────────────────────────────────────
    asst_msg = None
    if full_response_text:
        asst_msg = await db_svc.save_message(
            conversation_id=conversation_id,
            role="assistant",
            content=full_response_text,
            model=effective_model,
            tokens=total_usage,
            latency_ms=latency_ms,
            tools_used=list(dict.fromkeys(tools_used)) or None,
        )

    # Emit file_generated before message_stop so the client can attach the
    # download button to the correct message before the stream closes
    if generated_file_id:
        yield f"data: {json.dumps({'type': 'file_generated', 'file_id': generated_file_id, 'format': output_format})}\n\n"

    yield f"data: {json.dumps({'type': 'message_stop', 'full_text': full_response_text, 'usage': total_usage, 'tools_used': list(dict.fromkeys(tools_used)), 'model': effective_model, 'user_message_id': user_msg['id'], 'assistant_message_id': asst_msg['id'] if asst_msg else None, 'latency_ms': latency_ms})}\n\n"


# ── Title generation ──────────────────────────────────────────────────────────
async def generate_title(first_message: str) -> str:
    """Generate a short chat title from the first user message."""
    client = _get_async_client()
    try:
        resp = await client.messages.create(
            model=MODEL_ID,
            max_tokens=30,
            system=(
                "Generate a concise chat title (3–6 words) for the following message. "
                "Reply with only the title — no quotes, punctuation, or explanation."
            ),
            messages=[{"role": "user", "content": first_message[:500]}],
        )
        return resp.content[0].text.strip()
    except Exception:
        words = first_message.split()[:6]
        return " ".join(words) + ("…" if len(first_message.split()) > 6 else "")
