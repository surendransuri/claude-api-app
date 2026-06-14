'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Cpu } from 'lucide-react'

export const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'Fast' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', tier: 'Balanced' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', tier: 'Powerful' },
] as const

export type ModelId = (typeof MODELS)[number]['id']

export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4-6'

interface Props {
  value: ModelId
  onChange: (model: ModelId) => void
  disabled?: boolean
}

export default function ModelSelector({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = MODELS.find((m) => m.id === value) ?? MODELS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-primary)]"
        style={{
          color: 'var(--text-secondary)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
        title="Select model"
      >
        <Cpu size={12} style={{ color: 'var(--accent)' }} />
        <span>{current.label}</span>
        {!disabled && <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1.5 z-[70] rounded-2xl border shadow-lg min-w-[220px] fade-in"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {MODELS.map((model, i) => (
            <button
              key={model.id}
              onClick={() => { onChange(model.id); setOpen(false) }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--bg-primary)] ${i === 0 ? 'rounded-t-2xl' : ''} ${i === MODELS.length - 1 ? 'rounded-b-2xl' : ''}`}
            >
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className="font-medium text-sm"
                    style={{ color: value === model.id ? 'var(--accent)' : 'var(--text-primary)' }}
                  >
                    {model.label}
                  </p>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}
                  >
                    {model.tier}
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                  {model.id}
                </p>
              </div>
              {value === model.id && <Check size={13} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
