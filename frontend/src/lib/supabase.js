import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Demo mode = no Supabase configured. The backend (AUTH_MODE=dev) then accepts
// requests without a token, so the whole login flow can be skipped.
export const isDemoMode = !url || !anonKey

// One shared client for the whole app (it stores the session in localStorage
// and refreshes the access token automatically). null in demo mode.
export const supabase = isDemoMode ? null : createClient(url, anonKey)
