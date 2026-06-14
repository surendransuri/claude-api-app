from fastapi import APIRouter, HTTPException, Depends
from typing import List
from models.schemas import ConversationCreate, ConversationUpdate, ConversationResponse
from services.auth_service import get_current_user
import services.cosmos_service as db

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationResponse)
async def create_conversation(body: ConversationCreate, user: dict = Depends(get_current_user)):
    item = await db.create_conversation(
        user_id=user["user_id"],
        agent_type=body.agent_type,
        settings=body.settings.model_dump(),
    )
    return _to_response(item)


@router.get("", response_model=List[ConversationResponse])
async def list_conversations(user: dict = Depends(get_current_user)):
    items = await db.get_conversations(user["user_id"])
    return [_to_response(i) for i in items]


@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    item = await db.get_conversation(conversation_id)
    if not item or item.get("userId") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _to_response(item)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    user: dict = Depends(get_current_user),
):
    item = await db.get_conversation(conversation_id)
    if not item or item.get("userId") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.settings is not None:
        updates["settings"] = body.settings.model_dump()

    updated = await db.update_conversation(conversation_id, updates)
    return _to_response(updated)


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    item = await db.get_conversation(conversation_id)
    if not item or item.get("userId") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete_conversation(conversation_id)
    return {"ok": True}


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str, user: dict = Depends(get_current_user)):
    item = await db.get_conversation(conversation_id)
    if not item or item.get("userId") != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = await db.get_messages(conversation_id)
    return messages


def _to_response(item: dict) -> ConversationResponse:
    return ConversationResponse(
        id=item["id"],
        user_id=item["userId"],
        title=item.get("title", "New conversation"),
        agent_type=item.get("agentType", "claude"),
        settings=item.get("settings", {}),
        created_at=item.get("createdAt", ""),
        updated_at=item.get("updatedAt", ""),
    )
