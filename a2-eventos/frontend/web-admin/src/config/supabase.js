import { createClient } from '@supabase/supabase-js';

// Read from runtime config (window.__APP_CONFIG__) if available,
// otherwise fallback to build-time env vars (for dev mode)
const cfg = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
const supabaseUrl = cfg.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = cfg.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key missing in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
