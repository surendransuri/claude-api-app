from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
import uuid


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str


class AgentSettings(BaseModel):
    web_search: bool = False
    web_fetch: bool = False
    code_execution: bool = False
    thinking: bool = False


class ConversationCreate(BaseModel):
    agent_type: str = "claude"  # "claude" or "resume_assistant"
    settings: AgentSettings = Field(default_factory=AgentSettings)


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    settings: Optional[AgentSettings] = None


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    agent_type: str
    settings: dict
    created_at: str
    updated_at: str


class Attachment(BaseModel):
    name: str
    content_type: str
    data: str  # base64 encoded


class ChatMessageCreate(BaseModel):
    conversation_id: str
    content: str
    attachments: Optional[List[Attachment]] = None


class ChatMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: str
    attachments: Optional[List[dict]] = None
    model: Optional[str] = None
    tokens: Optional[dict] = None
    latency_ms: Optional[int] = None
    tools_used: Optional[List[str]] = None
    container_id: Optional[str] = None


class StreamChatRequest(BaseModel):
    conversation_id: str
    content: str
    attachments: Optional[List[Attachment]] = None
    output_format: Optional[str] = "text"  # "text", "docx", "pdf" for resume assistant
    model: Optional[str] = None  # overrides server default when provided


class TitleGenerateRequest(BaseModel):
    first_message: str
