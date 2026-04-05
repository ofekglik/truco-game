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
            get: (_t: any, authProp: string) => {
              if (authProp === 'onAuthStateChange') {
                return () => ({ data: { subscription: { unsubscribe: () => {} } } });
              }
              if (authProp === 'getSession') {
                return async () => ({ data: { session: null }, error: null });
              }
              if (authProp === 'getUser') {
                return async () => ({ data: { user: null }, error: null });
              }
              // Default: return async no-op
              return async (..._args: any[]) => ({ data: null, error: null });
            },
          });
        }
        return () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
      },
    }) as unknown as SupabaseClient);
