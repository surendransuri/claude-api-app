'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Bot, User, Search, Globe, Layers, Download, AlertCircle, Loader2, Brain, ChevronDown } from 'lucide-react'
import type { Message, Conversation, Attachment, AgentSettings } from '@/lib/types'
import { getMessages, updateConversation, streamChat, downloadFile, downloadGeneratedFile } from '@/lib/api'
import { DEFAULT_MODEL } from './ModelSelector'
import { getUser } from '@/lib/auth'
import MessageInput from './MessageInput'
import AgentSelector from './AgentSelector'

interface ChatEvent {
  type: string
  content?: string
  name?: string
  input?: Record<string, unknown>
  preview?: string
  full_text?: string
  title?: string
  filename?: string
  file_id?: string
  format?: string
  message?: string
}

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  toolEvents?: ToolEvent[]
  isStreaming?: boolean
  downloadFilename?: string
  downloadFileId?: string
  downloadFormat?: string
  thinkingContent?: string
}

interface ToolEvent {
  type: 'tool_start' | 'tool_result'
  name: string
  preview?: string
}

interface Props {
  conversation: Conversation
  onTitleUpdate?: (title: string) => void
  firstMessage?: string
}

export default function ChatWindow({ conversation, onTitleUpdate, firstMessage }: Props) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [settings, setSettings] = useState<AgentSettings>(conversation.settings)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<(() => void) | null>(null)
  const autoSentRef = useRef(false)
  const user = getUser()

  const isFirstMessage = messages.length === 0

  useEffect(() => {
    setSettings(conversation.settings)
  }, [conversation.id])

  useEffect(() => {
    setLoading(true)
    setMessages([])
    getMessages(conversation.id)
      .then((msgs) => {
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: m.attachments as Attachment[] | undefined,
          }))
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [conversation.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!loading && firstMessage && !autoSentRef.current) {
      autoSentRef.current = true
      const attKey = `nxc_att_${conversation.id}`
      const mdlKey = `nxc_mdl_${conversation.id}`
      const firstAttachments: Attachment[] = JSON.parse(sessionStorage.getItem(attKey) ?? '[]')
      const firstModel = sessionStorage.getItem(mdlKey) ?? DEFAULT_MODEL
      sessionStorage.removeItem(attKey)
      sessionStorage.removeItem(mdlKey)
      handleSend(firstMessage, firstAttachments, '', firstModel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function handleSettingsChange(newSettings: AgentSettings) {
    setSettings(newSettings)
    try {
      await updateConversation(conversation.id, { settings: newSettings })
    } catch {}
  }

  function handleSend(content: string, attachments: Attachment[], outputFormat: string, model: string = DEFAULT_MODEL) {
    if (streaming) return

    const userMsg: UIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
    }
    const assistantMsg: UIMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolEvents: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    const abort = streamChat(
      conversation.id,
      content,
      attachments.length > 0 ? attachments : null,
      outputFormat,
      model,
      (event: Record<string, unknown>) => {
        const e = event as ChatEvent
        if (e.type === 'text_delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content + (e.content ?? '') }
                : m
            )
          )
        } else if (e.type === 'thinking_delta') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, thinkingContent: (m.thinkingContent ?? '') + (e.content ?? '') }
                : m
            )
          )
        } else if (e.type === 'tool_start' || e.type === 'tool_result') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    toolEvents: [
                      ...(m.toolEvents ?? []),
                      { type: e.type as 'tool_start' | 'tool_result', name: e.name ?? '', preview: e.preview },
                    ],
                  }
                : m
            )
          )
        } else if (e.type === 'title_update' && e.title) {
          onTitleUpdate?.(e.title)
        } else if (e.type === 'file_generated' && (e.filename || e.file_id)) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    downloadFilename: e.filename,
                    downloadFileId: e.file_id,
                    downloadFormat: e.format,
                  }
                : m
            )
          )
        } else if (e.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || `Error: ${e.message}`, isStreaming: false }
                : m
            )
          )
        }
      },
      () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m))
        )
        setStreaming(false)
      },
      (err: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${err}`, isStreaming: false }
              : m
          )
        )
        setStreaming(false)
      }
    )

    abortRef.current = abort
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  const greeting = `Good ${getTimeOfDay()}, ${user?.username ?? 'there'}`

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <AgentSelector
          value={conversation.agent_type}
          onChange={() => {}}
          disabled={true}
          compact
        />
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {messages.length > 0 && `${Math.ceil(messages.length / 2)} exchange${Math.ceil(messages.length / 2) !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/Logo.svg"
                alt="NexChat"
                className="h-9 w-9 rounded-xl flex-shrink-0"
                style={{ objectFit: 'cover' }}
              />
              <h1 className="text-3xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                {greeting}
              </h1>
            </div>
            <p className="text-base mb-10" style={{ color: 'var(--text-secondary)' }}>
              How can I help you today?
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                username={user?.username}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-6 py-4 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <MessageInput
          agentType={conversation.agent_type}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onSend={handleSend}
          disabled={streaming}
        />
        <p className="text-center text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          NexChat can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message, username }: { message: UIMessage; username?: string }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} fade-in`}>
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold mt-1"
        style={{ background: isUser ? '#6366f1' : 'var(--accent)' }}
      >
        {isUser ? (username?.[0]?.toUpperCase() ?? <User size={14} />) : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {message.attachments.map((att, i) => (
              att.content_type.startsWith('image/') ? (
                <img
                  key={i}
                  src={`data:${att.content_type};base64,${att.data}`}
                  alt={att.name}
                  className="max-h-48 rounded-xl border object-cover"
                  style={{ borderColor: 'var(--border)' }}
                />
              ) : (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Download size={12} />
                  {att.name}
                </div>
              )
            ))}
          </div>
        )}

        {/* Text bubble */}
        {isUser ? (
          <div
            className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              background: 'var(--accent)',
              color: 'white',
              borderRadius: '18px 18px 4px 18px',
            }}
          >
            {message.content}
          </div>
        ) : (
          <div className="w-full">
            {/* Thinking block */}
            {message.thinkingContent && (
              <ThinkingBlock
                content={message.thinkingContent}
                isStreaming={message.isStreaming ?? false}
              />
            )}

            {/* Tool events */}
            {message.toolEvents && message.toolEvents.length > 0 && (
              <div className="mb-3 space-y-1">
                {message.toolEvents.map((te, i) => (
                  <ToolEventChip key={i} event={te} />
                ))}
              </div>
            )}

            {/* Message text */}
            {message.content ? (
              <div className="prose text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-current ml-0.5 cursor-blink" />
                )}
              </div>
            ) : message.isStreaming ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="spin" style={{ color: 'var(--accent)' }} />
                <span>Thinking…</span>
              </div>
            ) : null}

            {/* File download */}
            {(message.downloadFileId || message.downloadFilename) && (
              <button
                onClick={() => {
                  if (message.downloadFileId) {
                    downloadGeneratedFile(message.downloadFileId, message.downloadFormat ?? 'bin').catch(console.error)
                  } else {
                    downloadFile(message.downloadFilename!).catch(console.error)
                  }
                }}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                <Download size={14} />
                Download {message.downloadFormat?.toUpperCase()} resume
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ToolEventChip({ event }: { event: ToolEvent }) {
  const icons: Record<string, React.ReactNode> = {
    web_search: <Search size={12} />,
    web_fetch: <Globe size={12} />,
  }
  const icon = icons[event.name] ?? <Layers size={12} />

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
      style={{
        background: event.type === 'tool_result' ? 'var(--accent-bg)' : 'var(--bg-card)',
        color: event.type === 'tool_result' ? 'var(--accent)' : 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      {icon}
      <span>
        {event.type === 'tool_start'
          ? `Using ${event.name.replace('_', ' ')}…`
          : `${event.name.replace('_', ' ')} done`}
      </span>
    </div>
  )
}

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [open, setOpen] = useState(true)
  const didCollapse = useRef(false)

  useEffect(() => {
    if (!isStreaming && !didCollapse.current) {
      didCollapse.current = true
      setOpen(false)
    }
  }, [isStreaming])

  return (
    <div
      className="mb-3 rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--bg-card)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <Brain size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="flex-1 text-left font-medium">
          {isStreaming ? 'Thinking…' : "Claude's thinking"}
        </span>
        {isStreaming && <Loader2 size={11} className="spin" style={{ color: 'var(--accent)' }} />}
        <ChevronDown
          size={12}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>

      {open && (
        <div
          className="px-3 pb-3 pt-2 text-xs leading-relaxed border-t overflow-y-auto max-h-64"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {content}
          {isStreaming && <span className="inline-block w-0.5 h-3 bg-current ml-0.5 cursor-blink" />}
        </div>
      )}
    </div>
  )
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
