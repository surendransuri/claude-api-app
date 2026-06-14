import { getToken } from './auth'
import type { Conversation, Message, AgentSettings, Attachment } from './types'

const BASE = '/api'

function authHeaders(): Record<string, string> {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Login failed')
  }
  return res.json()
}

export async function createConversation(agent_type: string, settings: AgentSettings): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ agent_type, settings }),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${BASE}/conversations`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load conversations')
  return res.json()
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Conversation not found')
  return res.json()
}

export async function updateConversation(id: string, updates: { title?: string; settings?: AgentSettings }): Promise<Conversation> {
  const res = await fetch(`${BASE}/conversations/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error('Failed to update conversation')
  return res.json()
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete conversation')
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load messages')
  return res.json()
}

export function streamChat(
  conversation_id: string,
  content: string,
  attachments: Attachment[] | null,
  output_format: string,
  model: string,
  onEvent: (event: Record<string, unknown>) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const controller = new AbortController()

  fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ conversation_id, content, attachments, output_format, model }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        onError(err.detail || 'Stream failed')
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') {
              onDone()
              return
            }
            try {
              const payload = JSON.parse(raw)
              onEvent(payload)
            } catch {}
          }
        }
      }
      onDone()
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(String(err))
    })

  return () => controller.abort()
}

export async function downloadFile(filename: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE}/chat/download/${encodeURIComponent(filename)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadGeneratedFile(fileId: string, format: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE}/chat/download-generated/${encodeURIComponent(fileId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `resume.${format}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
