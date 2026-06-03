import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True when env vars are present and look real (not the placeholder).
export const supabaseReady = Boolean(
  url && anonKey && !anonKey.startsWith('REPLACE_WITH')
)

// Single shared client. Anon key is public by design; access is gated by RLS.
// Guard creation so a missing/blank .env.local doesn't throw at module load
// and white-screen the whole app — the gallery hooks handle a null client.
export const supabase = supabaseReady ? createClient(url, anonKey) : null
