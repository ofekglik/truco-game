import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey);
};

// Only create a real client if credentials exist; otherwise provide a dummy
export const supabase: SupabaseClient = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (new Proxy({} as any, {
      get: (_target: any, prop: string) => {
        if (prop === 'auth') {
          return new Proxy({} as any, {
            get: () => (..._args: any[]) => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
          });
        }
        return () => ({ data: null, error: { message: 'Supabase not configured' } });
      },
    }) as unknown as SupabaseClient);
