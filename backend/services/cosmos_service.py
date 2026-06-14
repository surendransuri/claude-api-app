"""
Azure Cosmos DB service for NexChat.

IMPORTANT: This service assumes both 'conversation' and 'chatmessage' containers
use '/id' as the partition key (the default when creating containers in Azure portal).
If your containers use a different partition key, update the helper functions below.

Audit logs are written to the 'auditlog' container (also /id partition key).
Create it in your Cosmos DB account; if it does not exist write failures are
swallowed so they never break the main chat flow.
"""
import os
import uuid
import socket
import logging
from datetime import datetime, timezone
from typing import List, Optional
from azure.cosmos.aio import CosmosClient
from azure.cosmos.exceptions import CosmosResourceNotFoundError

logger = logging.getLogger(__name__)

COSMOS_URL = os.getenv("COSMOS_DB_URL", "")
COSMOS_KEY = os.getenv("COSMOS_DB_KEY", "")
DATABASE_NAME = os.getenv("COSMOS_DB_DATABASE", "poc-grace")
CONVERSATION_CONTAINER = "conversation"
MESSAGE_CONTAINER = "chatmessage"
AUDIT_CONTAINER = os.getenv("COSMOS_AUDIT_CONTAINER", "auditlog")

# Container/instance identity — works for Azure Container Apps, ACI, Docker, and local
CONTAINER_ID: str = (
    os.getenv("CONTAINER_APP_REPLICA_NAME")
    or os.getenv("CONTAINER_NAME")
    or os.getenv("HOSTNAME")
    or socket.gethostname()
)


def _get_client() -> CosmosClient:
    return CosmosClient(COSMOS_URL, credential=COSMOS_KEY)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _find_by_id(container, item_id: str) -> Optional[dict]:
    """Cross-partition safe single item lookup."""
    async for item in container.query_items(
        query="SELECT * FROM c WHERE c.id = @id",
        parameters=[{"name": "@id", "value": item_id}],
        enable_cross_partition_query=True,
    ):
        return item
    return None


async def create_conversation(user_id: str, agent_type: str, settings: dict) -> dict:
    item = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "title": "New conversation",
        "agentType": agent_type,
        "settings": settings,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(CONVERSATION_CONTAINER)
        await container.create_item(body=item)
    return item


async def get_conversations(user_id: str) -> List[dict]:
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(CONVERSATION_CONTAINER)
        items = []
        async for item in container.query_items(
            query="SELECT * FROM c WHERE c.userId = @uid ORDER BY c.updatedAt DESC",
            parameters=[{"name": "@uid", "value": user_id}],
            enable_cross_partition_query=True,
        ):
            items.append(item)
    return items


async def get_conversation(conversation_id: str) -> Optional[dict]:
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(CONVERSATION_CONTAINER)
        return await _find_by_id(container, conversation_id)


async def update_conversation(conversation_id: str, updates: dict) -> Optional[dict]:
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(CONVERSATION_CONTAINER)
        item = await _find_by_id(container, conversation_id)
        if not item:
            return None
        item.update(updates)
        item["updatedAt"] = _now_iso()
        await container.replace_item(item=conversation_id, body=item)
        return item


async def delete_conversation(conversation_id: str) -> bool:
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(CONVERSATION_CONTAINER)
        item = await _find_by_id(container, conversation_id)
        if not item:
            return False
        try:
            await container.delete_item(item=conversation_id, partition_key=conversation_id)
        except CosmosResourceNotFoundError:
            return False

        msg_container = db.get_container_client(MESSAGE_CONTAINER)
        msg_ids = []
        async for msg in msg_container.query_items(
            query="SELECT c.id FROM c WHERE c.conversationId = @cid",
            parameters=[{"name": "@cid", "value": conversation_id}],
            enable_cross_partition_query=True,
        ):
            msg_ids.append(msg["id"])
        for mid in msg_ids:
            try:
                await msg_container.delete_item(item=mid, partition_key=mid)
            except Exception:
                pass
        return True


async def save_message(
    conversation_id: str,
    role: str,
    content: str,
    attachments: Optional[list] = None,
    *,
    model: Optional[str] = None,
    tokens: Optional[dict] = None,
    latency_ms: Optional[int] = None,
    tools_used: Optional[list] = None,
    container_id: Optional[str] = None,
) -> dict:
    """
    Persist one chat message (user or assistant).

    Extra metadata captured on the assistant record:
      model       – model ID used for this response
      tokens      – {input, output, cache_read, cache_creation, total}
      latency_ms  – wall-clock ms from first request to message_stop
      tools_used  – list of tool names invoked during the response
      container_id – hostname / Azure replica that served the request
    """
    item: dict = {
        "id": str(uuid.uuid4()),
        "conversationId": conversation_id,
        "role": role,
        "content": content,
        "attachments": attachments or [],
        "containerId": container_id or CONTAINER_ID,
        "createdAt": _now_iso(),
    }
    if model is not None:
        item["model"] = model
    if tokens is not None:
        item["tokens"] = tokens
    if latency_ms is not None:
        item["latencyMs"] = latency_ms
    if tools_used is not None:
        item["toolsUsed"] = tools_used

    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(MESSAGE_CONTAINER)
        await container.create_item(body=item)
    return item


async def save_audit_log(entry: dict) -> None:
    """
    Write one audit record to the 'auditlog' container.
    Failures are logged but never raised — audit must not break the chat flow.
    """
    record = {
        "id": str(uuid.uuid4()),
        "type": "chat_audit",
        "containerId": CONTAINER_ID,
        "createdAt": _now_iso(),
        **entry,
    }
    try:
        async with _get_client() as client:
            db = client.get_database_client(DATABASE_NAME)
            container = db.get_container_client(AUDIT_CONTAINER)
            await container.create_item(body=record)
    except Exception as exc:
        logger.warning("Audit log write failed (non-fatal): %s", exc)


async def get_messages(conversation_id: str) -> List[dict]:
    async with _get_client() as client:
        db = client.get_database_client(DATABASE_NAME)
        container = db.get_container_client(MESSAGE_CONTAINER)
        items = []
        async for item in container.query_items(
            query="SELECT * FROM c WHERE c.conversationId = @cid ORDER BY c.createdAt ASC",
            parameters=[{"name": "@cid", "value": conversation_id}],
            enable_cross_partition_query=True,
        ):
            items.append(item)
    return items
