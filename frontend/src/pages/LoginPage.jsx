import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Supabase's wording for a wrong email/password pair. We replace it with a friendlier sentence.
const INVALID_CREDENTIALS = /invalid login credentials/i

// Email + password auth with Supabase: one screen, a toggle between "Sign in" and "Create account".
// Only reachable when Supabase is configured (demo mode is always signed in).
export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // { text, offerSignup }
  const [notice, setNotice] = useState('')

  function switchMode(next) {
    setMode(next)
    setError(null)
    setNotice('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice('')

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err && INVALID_CREDENTIALS.test(err.message)) {
        setError({ text: "That email and password don't match an account.", offerSignup: true })
      } else if (err) {
        setError({ text: err.message })
      }
      // On success useAuth's onAuthStateChange listener picks up the session and the router moves on.
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password })
      if (err) setError({ text: err.message })
      // If email confirmation is on, Supabase returns a user but no session yet.
      else if (!data.session) setNotice(`We sent a confirmation link to ${email}. Open it, then sign in here.`)
    }
    setBusy(false)
  }

  const isSignin = mode === 'signin'

  return (
    <div className="auth-page">
      <Link to="/welcome" className="wordmark">
        StudyForge
      </Link>

      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{isSignin ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {isSignin ? 'Sign in to open your notebooks.' : 'Free, and your notes stay private to your account.'}
        </p>

        {/* Segmented toggle: two real buttons, aria-pressed tells assistive tech which one is on */}
        <div className="segmented" role="group" aria-label="Choose">
          <button type="button" aria-pressed={isSignin} onClick={() => switchMode('signin')}>
            Sign in
          </button>
          <button type="button" aria-pressed={!isSignin} onClick={() => switchMode('signup')}>
            Create account
          </button>
        </div>

        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            autoComplete={isSignin ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!isSignin && <span className="hint">At least 6 characters.</span>}
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error.text}{' '}
            {error.offerSignup && (
              <>
                New here?{' '}
                <button type="button" className="link-btn" onClick={() => switchMode('signup')}>
                  Create an account.
                </button>
              </>
            )}
          </p>
        )}
        {notice && <p className="notice-text">{notice}</p>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : isSignin ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
