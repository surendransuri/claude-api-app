'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getUser } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import UserMenu from '@/components/UserMenu'
import AgentSelector from '@/components/AgentSelector'
import {
  Send, Loader2, PanelLeft,
  Plus, X, Paperclip,
  Search, Globe, Check, Code2, Wrench, ChevronRight,
  FileText as FileTextIcon, Image as ImageIcon,
} from 'lucide-react'
import type { AgentType, AgentSettings, Attachment } from '@/lib/types'
import { createConversation } from '@/lib/api'
import ModelSelector, { DEFAULT_MODEL, type ModelId } from '@/components/ModelSelector'

export default function HomePage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarRefresh, setSidebarRefresh] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('claude')
  const [settings, setSettings] = useState<AgentSettings>({ web_search: false, web_fetch: false, code_execution: false })
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showPlus, setShowPlus] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusRef = useRef<HTMLDivElement>(null)
  const user = getUser()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login')
    } else {
      setChecked(true)
    }
  }, [router])

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [input])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setShowPlus(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleStart() {
    const content = input.trim()
    if (!content || creating) return
    setCreating(true)
    try {
      const conv = await createConversation(selectedAgent, settings)
      if (attachments.length > 0) {
        sessionStorage.setItem(`nxc_att_${conv.id}`, JSON.stringify(attachments))
      }
      sessionStorage.setItem(`nxc_mdl_${conv.id}`, selectedModel)
      router.push(`/chat/${conv.id}?q=${encodeURIComponent(content)}`)
    } catch {
      setCreating(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleStart()
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const loaded: Attachment[] = await Promise.all(
      files.map(
        (file) =>
          new Promise<Attachment>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
              const b64 = (reader.result as string).split(',')[1] ?? ''
              resolve({ name: file.name, content_type: file.type, data: b64 })
            }
            reader.readAsDataURL(file)
          })
      )
    )
    setAttachments((prev) => [...prev, ...loaded])
    e.target.value = ''
    setShowPlus(false)
  }

  function toggleSetting(key: keyof AgentSettings) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!checked) return null

  const greeting = `Good ${getTimeOfDay()}, ${user?.username ?? 'there'}`
  const hasInput = input.trim().length > 0 || attachments.length > 0

  const activeTools = selectedAgent === 'claude'
    ? [
        settings.web_search && 'Web search',
        settings.web_fetch && 'Web fetch',
        settings.code_execution && 'Code execution',
      ].filter(Boolean) as string[]
    : []

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        onNewChat={() => setSidebarRefresh((k) => k + 1)}
        refreshKey={sidebarRefresh}
      />

      <main
        className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-y-auto"
        style={{ background: 'var(--bg-primary)' }}
      >
        {/* Sidebar open button */}
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

        {/* Top-right: agent selector + user menu */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <AgentSelector value={selectedAgent} onChange={setSelectedAgent} dropdownAlign="right" />
          <UserMenu />
        </div>

        {/* Greeting */}
        <div className="flex items-center gap-3 mb-3">
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

        <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
          How can I help you today?
        </p>

        {/* Input card */}
        <div className="w-full max-w-2xl">
          <div
            className="rounded-2xl border shadow-sm"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {att.content_type.startsWith('image/') ? <ImageIcon size={11} /> : <FileTextIcon size={11} />}
                    <span className="max-w-[120px] truncate">{att.name}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-0.5"
                    >
                      <X size={10} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Active tool badges */}
            {activeTools.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-2">
                {activeTools.map((label) => (
                  <span
                    key={label}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                  >
                    <Check size={10} />
                    {label}
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NexChat…"
              rows={3}
              className="w-full px-4 pt-4 pb-2 bg-transparent text-sm outline-none resize-none leading-relaxed"
              style={{ color: 'var(--text-primary)', minHeight: '80px', maxHeight: '200px' }}
              autoFocus
              disabled={creating}
            />

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-3 pb-3">
              {/* Plus button + dropdown */}
              <div ref={plusRef} className="relative">
                <button
                  onClick={() => setShowPlus((v) => !v)}
                  disabled={creating}
                  className="flex items-center justify-center w-8 h-8 rounded-xl border transition-colors"
                  style={{
                    background: showPlus ? 'var(--accent-bg)' : 'transparent',
                    borderColor: showPlus ? 'var(--accent)' : 'var(--border)',
                    color: showPlus ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                  title="Add files or tools"
                >
                  <Plus size={16} />
                </button>

                {showPlus && (
                  <div
                    className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl border shadow-lg min-w-[230px] fade-in"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  >
                    {/* Attach — single button for both files and photos */}
                    <button
                      onClick={() => {
                        if (fileInputRef.current) { fileInputRef.current.accept = '*/*'; fileInputRef.current.click() }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm rounded-t-2xl transition-colors hover:bg-[var(--bg-primary)]"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <Paperclip size={15} style={{ color: 'var(--accent)' }} />
                      <span>Add files or photos</span>
                    </button>

                    {/* Tools — side flyout, only for claude */}
                    {selectedAgent === 'claude' && (
                      <>
                        <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                        <div className="relative">
                          <button
                            onClick={() => setShowTools((v) => !v)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm rounded-b-2xl transition-colors hover:bg-[var(--bg-primary)]"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Wrench size={15} style={{ color: 'var(--accent)' }} />
                            <span className="flex-1 text-left">Tools</span>
                            {activeTools.length > 0 && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                              >
                                {activeTools.length}
                              </span>
                            )}
                            <ChevronRight
                              size={13}
                              style={{
                                color: 'var(--text-muted)',
                                transform: showTools ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s',
                              }}
                            />
                          </button>

                          {showTools && (
                            <div
                              className="absolute bottom-0 left-full ml-1.5 z-[60] rounded-2xl border shadow-lg min-w-[260px] fade-in"
                              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                            >
                              <ToolToggleItem
                                icon={<Search size={15} />}
                                label="Web search"
                                description="Search the web for current info"
                                active={settings.web_search}
                                onClick={() => toggleSetting('web_search')}
                              />
                              <ToolToggleItem
                                icon={<Globe size={15} />}
                                label="Web fetch"
                                description="Read content from a URL"
                                active={settings.web_fetch}
                                onClick={() => toggleSetting('web_fetch')}
                              />
                              <ToolToggleItem
                                icon={<Code2 size={15} />}
                                label="Code execution"
                                description="Run Python code and return output"
                                active={settings.code_execution}
                                onClick={() => toggleSetting('code_execution')}
                              />
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Model selector + Send */}
              <div className="flex items-center gap-2">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={creating} />
                <button
                  onClick={handleStart}
                  disabled={!hasInput || creating}
                  className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
                  style={{
                    background: hasInput && !creating ? 'var(--accent)' : 'var(--border)',
                    color: hasInput && !creating ? 'white' : 'var(--text-muted)',
                    cursor: hasInput && !creating ? 'pointer' : 'default',
                  }}
                  title="Send"
                >
                  {creating ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

function ToolToggleItem({
  icon, label, description, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-primary)]"
    >
      <span style={{ color: 'var(--accent)' }}>{icon}</span>
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <div
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          borderColor: active ? 'var(--accent)' : 'var(--border)',
          background: active ? 'var(--accent)' : 'transparent',
        }}
      >
        {active && <Check size={11} className="text-white" />}
      </div>
    </button>
  )
}

function getTimeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
