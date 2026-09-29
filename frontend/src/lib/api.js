import { supabase } from './supabase'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')

// Builds the Authorization header from the current Supabase session.
// getSession() reads the cached session (and refreshes it if expired), so this is cheap.
export async function authHeaders() {
  if (!supabase) return {} // demo mode: backend ignores auth
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// FastAPI errors look like {"detail": "message"}, but validation errors (422)
// use {"detail": [{loc, msg, ...}]}. Turn both into one readable string.
export function errorMessage(body, status) {
  const detail = body?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
  return `Request failed (${status})`
}

// Small fetch wrapper used by every API call.
// - prefixes the base URL, adds auth
// - sends JSON bodies (or FormData for uploads, letting the browser set the boundary)
// - throws Error(detail) on non-2xx so React Query shows it as `error.message`
export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = await authHeaders()
  let payload
  if (formData) {
    payload = formData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: payload })
  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(errorMessage(data, res.status))
  return data
}
