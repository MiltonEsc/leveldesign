import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Single shared client. Anon key is public by design; access is gated by RLS.
export const supabase = createClient(url, anonKey)

// True when env vars are present and look real (not the placeholder).
export const supabaseReady = Boolean(
  url && anonKey && !anonKey.startsWith('REPLACE_WITH')
)
