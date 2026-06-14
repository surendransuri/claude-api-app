'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Plus, X, Search, Globe, Paperclip, Image as ImageIcon,
  Send, FileText, Download, Code2, Wrench, ChevronRight, Brain,
} from 'lucide-react'
import type { AgentSettings, Attachment, AgentType } from '@/lib/types'
import ModelSelector, { DEFAULT_MODEL, type ModelId } from './ModelSelector'

interface Props {
  agentType: AgentType
  settings: AgentSettings
  onSettingsChange: (s: AgentSettings) => void
  onSend: (content: string, attachments: Attachment[], outputFormat: string, model: string) => void
  disabled?: boolean
}

export default function MessageInput({ agentType, settings, onSettingsChange, onSend, disabled }: Props) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showPlus, setShowPlus] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [outputFormat, setOutputFormat] = useState<'text' | 'docx' | 'pdf'>('text')
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusRef = useRef<HTMLDivElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [text])

  // Close plus menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setShowPlus(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, attachments, outputFormat, model)
    setText('')
    setAttachments([])
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const loaded: Attachment[] = await Promise.all(
      files.map(
        (file) =>
          new Promise<Attachment>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              // Strip the "data:...;base64," prefix
              const b64 = dataUrl.split(',')[1] ?? ''
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
    onSettingsChange({ ...settings, [key]: !settings[key] })
    setShowPlus(false)
  }

  const hasContent = text.trim().length > 0 || attachments.length > 0

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {att.content_type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                <X size={11} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active tool badges */}
      {agentType === 'claude' && (settings.web_search || settings.web_fetch || settings.code_execution || settings.thinking) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {settings.web_search && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <Search size={10} /> Web search
            </span>
          )}
          {settings.web_fetch && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <Globe size={10} /> Web fetch
            </span>
          )}
          {settings.code_execution && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <Code2 size={10} /> Code execution
            </span>
          )}
          {settings.thinking && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
              <Brain size={10} /> Thinking
            </span>
          )}
        </div>
      )}

      {/* Main input box */}
      <div
        className="rounded-2xl border shadow-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={agentType === 'resume_assistant' ? 'Describe the role or paste your resume…' : 'Message NexChat…'}
          disabled={disabled}
          rows={1}
          className="w-full px-4 pt-3.5 pb-2 bg-transparent text-sm outline-none resize-none leading-relaxed"
          style={{ color: 'var(--text-primary)', minHeight: '52px', maxHeight: '200px' }}
        />

        <div className="flex items-center justify-between px-3 pb-3 gap-2">
          {/* Left controls */}
          <div className="flex items-center gap-1.5">
            {/* + button */}
            <div ref={plusRef} className="relative">
              <button
                onClick={() => setShowPlus(!showPlus)}
                disabled={disabled}
                className="flex items-center justify-center w-8 h-8 rounded-xl border transition-colors"
                style={{
                  background: showPlus ? 'var(--accent-bg)' : 'transparent',
                  borderColor: showPlus ? 'var(--accent)' : 'var(--border)',
                  color: showPlus ? 'var(--accent)' : 'var(--text-muted)',
                }}
                title="More options"
              >
                <Plus size={16} />
              </button>

              {/* Plus menu dropdown */}
              {showPlus && (
                <div
                  className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl border shadow-lg min-w-[230px] fade-in"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                  {/* Attach — single button for files and photos, both agents */}
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

                  {/* Tools flyout — claude only */}
                  {agentType === 'claude' && (
                    <>
                      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                      <div className="relative">
                        <button
                          onClick={() => setShowTools((v) => !v)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-primary)]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Wrench size={15} style={{ color: 'var(--accent)' }} />
                          <span className="flex-1 text-left">Tools</span>
                          {[settings.web_search, settings.web_fetch, settings.code_execution, settings.thinking].filter(Boolean).length > 0 && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                            >
                              {[settings.web_search, settings.web_fetch, settings.code_execution, settings.thinking].filter(Boolean).length}
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
                            <ToggleMenuItem
                              icon={<Search size={15} />}
                              label="Web search"
                              active={settings.web_search}
                              onClick={() => toggleSetting('web_search')}
                            />
                            <ToggleMenuItem
                              icon={<Globe size={15} />}
                              label="Web fetch"
                              active={settings.web_fetch}
                              onClick={() => toggleSetting('web_fetch')}
                            />
                            <ToggleMenuItem
                              icon={<Code2 size={15} />}
                              label="Code execution"
                              active={settings.code_execution}
                              onClick={() => toggleSetting('code_execution')}
                            />
                            <ToggleMenuItem
                              icon={<Brain size={15} />}
                              label="Extended thinking"
                              active={settings.thinking}
                              onClick={() => toggleSetting('thinking')}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Output format — resume assistant */}
                  {agentType === 'resume_assistant' && (
                    <>
                      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                      <p className="px-4 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        Output format
                      </p>
                      {(['text', 'docx', 'pdf'] as const).map((fmt, i, arr) => (
                        <button
                          key={fmt}
                          onClick={() => { setOutputFormat(fmt); setShowPlus(false) }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-primary)] ${i === arr.length - 1 ? 'rounded-b-2xl' : ''}`}
                          style={{ color: outputFormat === fmt ? 'var(--accent)' : 'var(--text-primary)' }}
                        >
                          <Download size={13} style={{ color: outputFormat === fmt ? 'var(--accent)' : 'var(--text-muted)' }} />
                          <span>{fmt === 'text' ? 'Text (in chat)' : fmt.toUpperCase()}</span>
                          {outputFormat === fmt && (
                            <span className="ml-auto" style={{ color: 'var(--accent)' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Bottom rounded cap when no sub-sections follow the attach button */}
                  {agentType !== 'claude' && agentType !== 'resume_assistant' && (
                    <div className="rounded-b-2xl" />
                  )}
                </div>
              )}
            </div>

            {/* Output format badge for resume */}
            {agentType === 'resume_assistant' && outputFormat !== 'text' && (
              <span
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border"
                style={{ background: 'var(--accent-bg)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <Download size={10} />
                {outputFormat.toUpperCase()}
              </span>
            )}
          </div>

          {/* Model selector + Send */}
          <div className="flex items-center gap-2">
            <ModelSelector value={model} onChange={setModel} disabled={disabled} />
            <button
              onClick={handleSend}
              disabled={!hasContent || disabled}
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
              style={{
                background: hasContent && !disabled ? 'var(--accent)' : 'var(--border)',
                color: hasContent && !disabled ? 'white' : 'var(--text-muted)',
                cursor: hasContent && !disabled ? 'pointer' : 'default',
              }}
              title="Send message"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

function ToggleMenuItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-primary)]"
      style={{ color: 'var(--text-primary)' }}
    >
      <span style={{ color: 'var(--accent)' }}>{icon}</span>
      <span className="flex-1">{label}</span>
      <div
        className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
        style={{ background: active ? 'var(--accent)' : 'var(--border)' }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: active ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </div>
    </button>
  )
}
