'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import ChatWindow from '@/components/ChatWindow'
import UserMenu from '@/components/UserMenu'
import type { Conversation } from '@/lib/types'
import { getConversation } from '@/lib/api'
import { Loader2, PanelLeft } from 'lucide-react'

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string
  const firstMessage = searchParams.get('q') ?? undefined
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarRefresh, setSidebarRefresh] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login')
      return
    }
    setLoading(true)
    getConversation(id)
      .then(setConversation)
      .catch(() => router.replace('/'))
      .finally(() => setLoading(false))
  }, [id, router])

  function handleTitleUpdate(title: string) {
    setConversation((prev) => (prev ? { ...prev, title } : prev))
    setSidebarRefresh((k) => k + 1)
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar
        activeId={id}
        refreshKey={sidebarRefresh}
        onNewChat={() => setSidebarRefresh((k) => k + 1)}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      {/* Sidebar open button — only visible when sidebar is hidden */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-card)]"
          style={{ color: 'var(--text-muted)' }}
          title="Open sidebar"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <main className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : conversation ? (
          <ChatWindow conversation={conversation} onTitleUpdate={handleTitleUpdate} firstMessage={firstMessage} />
        ) : null}
      </main>

      <div className="fixed top-4 right-4 z-50">
        <UserMenu />
      </div>
    </div>
  )
}
