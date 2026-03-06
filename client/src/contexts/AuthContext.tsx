import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface UserProfile {
  id: string;
  nickname: string;
  avatar: string;
  elo_rating: number;
  xp: number;
  level: number;
  created_at: string;
  last_seen: string;
  is_online: boolean;
}

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  needsNickname: boolean;
  isGuest: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateNickname: (nickname: string, avatar: string) => Promise<void>;
  signInAsGuest: (nickname: string, avatar: string) => Promise<void>;
  isSupabaseEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const isSupabaseEnabled = isSupabaseConfigured();

  // Helper to fetch user profile
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('Profile fetch error:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.error('Profile fetch exception:', err);
      return null;
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    if (!isSupabaseEnabled) {
      setLoading(false);
      return;
    }

    // Safety timeout - never stay on loading screen forever
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          if (profileData) {
            setProfile(profileData);
            setNeedsNickname(false);
          } else {
            setNeedsNickname(true);
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    };

    checkSession();

    return () => clearTimeout(timeout);
  }, [isSupabaseEnabled]);

  // Listen for auth state changes
  useEffect(() => {
    if (!isSupabaseEnabled) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          setUser(session.user);
          const profileData = await fetchProfile(session.user.id);
          if (profileData) {
            setProfile(profileData);
            setNeedsNickname(false);
          } else {
            setNeedsNickname(true);
          }
        } else {
          setUser(null);
          setProfile(null);
          setNeedsNickname(false);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [isSupabaseEnabled]);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseEnabled) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
  }, [isSupabaseEnabled]);

  const signOut = useCallback(async () => {
    if (!isSupabaseEnabled) throw new Error('Supabase not configured');

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setUser(null);
    setProfile(null);
    setNeedsNickname(false);
  }, [isSupabaseEnabled]);

  const updateNickname = useCallback(async (nickname: string, avatar: string) => {
    if (!isSupabaseEnabled || !user) throw new Error('Supabase not configured or user not logged in');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          nickname,
          avatar,
        })
        .select()
        .single();

      if (error) throw error;

      setProfile(data);
      setNeedsNickname(false);
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation
        throw new Error('שם זה כבר תפוס');
      }
      throw error;
    }
  }, [user, isSupabaseEnabled]);

  const signInAsGuest = useCallback(async (nickname: string, avatar: string) => {
    if (!nickname.trim()) throw new Error('יש להכניס שם');
    if (nickname.length > 15) throw new Error('השם לא יכול להכיל יותר מ-15 תווים');

    // Create a fake profile for guest mode (not saved to database)
    const guestProfile: UserProfile = {
      id: `guest_${Date.now()}`,
      nickname: nickname.trim(),
      avatar,
      elo_rating: 1500,
      xp: 0,
      level: 1,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      is_online: true,
    };

    setProfile(guestProfile);
    setIsGuest(true);
    setNeedsNickname(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        needsNickname,
        isGuest,
        signInWithGoogle,
        signOut,
        updateNickname,
        signInAsGuest,
        isSupabaseEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
