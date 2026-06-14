'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, FileText, ChevronDown, Check } from 'lucide-react'
import type { AgentType } from '@/lib/types'
import { AGENT_LABELS, AGENT_DESCRIPTIONS } from '@/lib/types'

const AGENT_ICONS: Record<AgentType, React.ReactNode> = {
  claude: <Bot size={16} />,
  resume_assistant: <FileText size={16} />,
}

interface Props {
  value: AgentType
  onChange: (agent: AgentType) => void
  disabled?: boolean
  dropdownAlign?: 'left' | 'right'
  compact?: boolean
}

export default function AgentSelector({ value, onChange, disabled, dropdownAlign = 'left', compact }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const agents: AgentType[] = ['claude', 'resume_assistant']

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={
          compact
            ? 'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-[var(--bg-primary)]'
            : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border'
        }
        style={
          compact
            ? { color: 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer' }
            : {
                background: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.7 : 1,
              }
        }
        title={disabled ? 'Agent is locked for this conversation' : 'Change agent'}
      >
        <span style={{ color: 'var(--accent)' }}>{AGENT_ICONS[value]}</span>
        <span>{AGENT_LABELS[value]}</span>
        {!disabled && <ChevronDown size={compact ? 11 : 13} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && !disabled && (
        <div
          className={`absolute ${dropdownAlign === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-50 rounded-2xl border shadow-lg overflow-hidden min-w-[280px]`}
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {agents.map((agent) => (
            <button
              key={agent}
              onClick={() => { onChange(agent); setOpen(false) }}
              className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-primary)]"
            >
              <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>
                {AGENT_ICONS[agent]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {AGENT_LABELS[agent]}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {AGENT_DESCRIPTIONS[agent]}
                </p>
              </div>
              {value === agent && (
                <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
