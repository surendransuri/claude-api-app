export interface User {
  user_id: string
  username: string
}

export interface AgentSettings {
  web_search: boolean
  web_fetch: boolean
  code_execution: boolean
  thinking: boolean
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  agent_type: 'claude' | 'resume_assistant'
  settings: AgentSettings
  created_at: string
  updated_at: string
}

export interface Attachment {
  name: string
  content_type: string
  data: string // base64
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  attachments?: Attachment[]
}

export type SSEEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_start'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; preview: string }
  | { type: 'message_stop'; full_text: string }
  | { type: 'title_update'; title: string }
  | { type: 'file_generated'; filename?: string; file_id?: string; format: string }
  | { type: 'error'; message: string }

export type AgentType = 'claude' | 'resume_assistant'

export const AGENT_LABELS: Record<AgentType, string> = {
  claude: 'Claude',
  resume_assistant: 'Resume Writing Assistant',
}

export const AGENT_DESCRIPTIONS: Record<AgentType, string> = {
  claude: 'General-purpose AI assistant with web search, fetch, and file support',
  resume_assistant: 'Expert resume writer with DOCX & PDF generation',
}
