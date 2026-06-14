'use client'

import { useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, LogOut, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { clearAuth, getUser } from '@/lib/auth'

export default function UserMenu() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const user = getUser()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleLogout() {
    clearAuth()
    router.replace('/login')
  }

  const initial = user?.username?.[0]?.toUpperCase() ?? 'U'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white transition-opacity hover:opacity-80"
        style={{ background: 'var(--accent)' }}
        title={user?.username ?? 'User'}
      >
        {initial}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-2xl border shadow-lg overflow-hidden min-w-[200px] fade-in"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {/* User info */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {user?.username ?? 'User'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Signed in</p>
          </div>

          {/* Theme options */}
          <div className="p-1">
            {mounted && (
              <>
                <button
                  onClick={() => { setTheme('light'); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-[var(--bg-primary)]"
                  style={{ color: theme === 'light' ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  <Sun size={15} />
                  <span>Light mode</span>
                  {theme === 'light' && <span className="ml-auto text-xs" style={{ color: 'var(--accent)' }}>✓</span>}
                </button>
                <button
                  onClick={() => { setTheme('dark'); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors hover:bg-[var(--bg-primary)]"
                  style={{ color: theme === 'dark' ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  <Moon size={15} />
                  <span>Dark mode</span>
                  {theme === 'dark' && <span className="ml-auto text-xs" style={{ color: 'var(--accent)' }}>✓</span>}
                </button>
              </>
            )}
          </div>

          <div className="p-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
