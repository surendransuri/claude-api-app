import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, FileResponse, Response
from models.schemas import StreamChatRequest
from services.auth_service import get_current_user
import services.cosmos_service as db
import services.claude_service as claude
import services.resume_service as resume_svc

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream_chat(body: StreamChatRequest, user: dict = Depends(get_current_user)):
    conversation = await db.get_conversation(body.conversation_id)
    if not conversation or conversation.get("userId") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db_messages = await db.get_messages(body.conversation_id)
    is_first_message = len(db_messages) == 0

    attachment_dicts = [a.model_dump() for a in body.attachments] if body.attachments else None

    async def event_generator():
        full_text = ""
        usage: dict = {}
        tools_used: list = []
        effective_model: str = body.model or ""
        error_message: str | None = None
        user_message_id: str | None = None
        assistant_msg_id: str | None = None
        latency_ms: int = 0

        try:
            async for chunk in claude.stream_chat(
                db_messages=db_messages,
                conversation=conversation,
                new_message=body.content,
                attachments=attachment_dicts,
                model=body.model,
                output_format=body.output_format,
            ):
                if chunk.startswith("data: "):
                    try:
                        payload = json.loads(chunk[6:])
                        if payload.get("type") == "message_stop":
                            full_text = payload.get("full_text", "")
                            usage = payload.get("usage", {})
                            tools_used = payload.get("tools_used", [])
                            effective_model = payload.get("model", body.model or "")
                            user_message_id = payload.get("user_message_id")
                            assistant_msg_id = payload.get("assistant_message_id")
                            latency_ms = payload.get("latency_ms", 0)
                    except Exception:
                        pass
                yield chunk

        except Exception as exc:
            error_message = str(exc)
            yield f"data: {json.dumps({'type': 'error', 'message': error_message})}\n\n"

        # Generate and update title on first message
        if full_text and is_first_message:
            title = await claude.generate_title(body.content)
            await db.update_conversation(body.conversation_id, {"title": title})
            yield f"data: {json.dumps({'type': 'title_update', 'title': title})}\n\n"

        # Write audit record (fire-and-forget — never blocks or crashes the stream)
        await db.save_audit_log({
            "userId": user["user_id"],
            "username": user.get("username", ""),
            "conversationId": body.conversation_id,
            "agentType": conversation.get("agentType", "claude"),
            "userMessageId": user_message_id,
            "assistantMessageId": assistant_msg_id,
            "model": effective_model,
            "tokens": usage or None,
            "toolsUsed": tools_used or None,
            "latencyMs": latency_ms,
            "isFirstMessage": is_first_message,
            "outputFormat": body.output_format,
            "status": "error" if error_message else "success",
            "errorMessage": error_message,
        })

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/download/{filename}")
async def download_file(filename: str, user: dict = Depends(get_current_user)):
    safe_name = Path(filename).name
    filepath = resume_svc.get_file_path(safe_name)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if safe_name.endswith(".docx")
        else "application/pdf"
    )
    return FileResponse(path=str(filepath), filename=safe_name, media_type=media_type)


@router.get("/download-generated/{file_id}")
async def download_generated_file(file_id: str, user: dict = Depends(get_current_user)):
    """Proxy-download a skill-generated file from the Anthropic Files API."""
    try:
        data, filename = await claude.download_generated_file(file_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}")

    if filename.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif filename.endswith(".pdf"):
        media_type = "application/pdf"
    else:
        media_type = "application/octet-stream"

    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
