import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Email + password auth with Supabase. Only shown when Supabase is configured.
export default function LoginPage() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
      // On success useAuth's onAuthStateChange listener picks up the session - nothing else to do.
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) setError(err.message)
      // If email confirmation is on, Supabase returns a user but no session yet.
      else if (!data.session) setNotice('Check your email to confirm your account, then sign in.')
    }
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <form className="glass-card login-card" onSubmit={handleSubmit}>
        <div className="brand">
          <span className="brand-logo">◆</span>
          <span className="brand-name">StudyForge</span>
        </div>
        <h2>{mode === 'signin' ? 'Welcome back' : 'Create an account'}</h2>

        <label className="field">
          <span>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {notice && <p className="notice-text">{notice}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError('')
            setNotice('')
          }}
        >
          {mode === 'signin' ? "No account? Sign up" : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
