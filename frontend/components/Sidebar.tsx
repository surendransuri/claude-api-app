'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Search, Trash2, PenSquare, X, PanelLeftClose } from 'lucide-react'
import type { Conversation } from '@/lib/types'
import { listConversations, deleteConversation } from '@/lib/api'

interface Props {
  activeId?: string
  onNewChat?: () => void
  refreshKey?: number
  open?: boolean
  onToggle?: () => void
}

export default function Sidebar({ activeId, onNewChat, refreshKey, open = true, onToggle }: Props) {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadConversations = useCallback(async () => {
    try {
      const data = await listConversations()
      setConversations(data)
    } catch (err) {
      console.error('Failed to load conversations', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations, refreshKey])

  function handleNewChat() {
    router.push('/')
    onNewChat?.()
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    e.preventDefault()
    if (!confirm('Delete this conversation?')) return
    setDeletingId(id)
    try {
      await deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) router.push('/')
    } catch {
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  if (!open) return null

  return (
    <aside
      className="flex flex-col h-full w-64 flex-shrink-0 border-r"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0">
        <a href="/" className="flex items-center gap-2 min-w-0">
          <img
            src="/Logo.svg"
            alt="NexChat"
            className="h-7 w-7 rounded-lg flex-shrink-0"
            style={{ objectFit: 'cover' }}
          />
          <span className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            NexChat
          </span>
        </a>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch('') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-primary)]"
            style={{ color: 'var(--text-muted)' }}
            title="Search chats"
          >
            <Search size={15} />
          </button>
          <button
            onClick={handleNewChat}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-primary)]"
            style={{ color: 'var(--text-muted)' }}
            title="New chat"
          >
            <PenSquare size={15} />
          </button>
          {onToggle && (
            <button
              onClick={onToggle}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-primary)]"
              style={{ color: 'var(--text-muted)' }}
              title="Close sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible search */}
      {searchOpen && (
        <div className="px-3 pb-2 fade-in">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl border"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search chats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {search && (
              <button onClick={() => setSearch('')}>
                <X size={13} style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* New chat row */}
      <div className="px-2 pb-1 flex-shrink-0">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-[var(--bg-primary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
            style={{ background: 'var(--border)' }}
          >
            <span className="text-xs font-bold leading-none" style={{ color: 'var(--text-muted)' }}>+</span>
          </div>
          <span>New chat</span>
        </button>
      </div>

      <div className="mx-3 my-1 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }} />

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-2 py-1 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div
              className="w-4 h-4 rounded-full border-2 border-t-transparent spin"
              style={{ borderColor: 'var(--accent)' }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {search ? 'No results' : 'No chats yet'}
            </p>
          </div>
        ) : (
          <div>
            <p
              className="px-3 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)' }}
            >
              Recents
            </p>
            {filtered.map((conv) => (
              <div
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className="group relative flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors mb-0.5"
                style={{
                  background: activeId === conv.id ? 'var(--accent-bg)' : 'transparent',
                  color: activeId === conv.id ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (activeId !== conv.id) e.currentTarget.style.background = 'var(--bg-primary)'
                }}
                onMouseLeave={(e) => {
                  if (activeId !== conv.id) e.currentTarget.style.background = 'transparent'
                }}
              >
                <MessageSquare
                  size={13}
                  className="flex-shrink-0"
                  style={{ color: activeId === conv.id ? 'var(--accent)' : 'var(--text-muted)' }}
                />
                <span className="flex-1 text-sm truncate">{conv.title}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all hover:text-red-500"
                  style={{ color: 'var(--text-muted)' }}
                  disabled={deletingId === conv.id}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
