import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseServiceKey);
};

// Only create a real client if credentials exist; otherwise provide a dummy
export const supabase: SupabaseClient = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseServiceKey)
  : (new Proxy({} as any, {
      get: () => () => ({ data: null, error: { message: 'Supabase not configured' } }),
    }) as unknown as SupabaseClient);
