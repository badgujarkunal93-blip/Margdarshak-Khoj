import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''
const supabaseUrl = rawUrl
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/+$/g, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(rawUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
)
