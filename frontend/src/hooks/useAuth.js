import { useEffect, useState } from 'react'
import { isDemoMode, supabase } from '../lib/supabase'

// Returns { session, loading, signOut }.
// In demo mode there is no real session; we return a fake one so the app treats you as logged in.
export function useAuth() {
  const [session, setSession] = useState(isDemoMode ? { demo: true } : null)
  const [loading, setLoading] = useState(!isDemoMode)

  useEffect(() => {
    if (isDemoMode) return undefined

    // 1) read the stored session once on startup
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    // 2) then keep in sync with sign-in / sign-out / token refresh
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signOut = () => (supabase ? supabase.auth.signOut() : Promise.resolve())
  return { session, loading, signOut }
}
