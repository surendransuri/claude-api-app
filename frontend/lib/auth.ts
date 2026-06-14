'use client'

const TOKEN_KEY = 'nexchat_token'
const USER_KEY = 'nexchat_user'
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
const DEV_USER = { user_id: 'demo-user-001', username: 'admin' }

export function saveAuth(token: string, user: { user_id: string; username: string }) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken(): string | null {
  if (DEV_MODE) return 'dev'
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): { user_id: string; username: string } | null {
  if (DEV_MODE) return DEV_USER
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  if (DEV_MODE) return true
  return !!getToken()
}
