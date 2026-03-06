import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Suit, SUIT_NAMES_HE, SUIT_SYMBOLS } from '../types';

interface Stats {
  games_played: number;
  games_won: number;
  games_lost: number;
  total_tricks_won: number;
  current_win_streak: number;
  trump_oros_count: number;
  trump_copas_count: number;
  trump_espadas_count: number;
  trump_bastos_count: number;
}

type RankInfo = {
  name: string;
  icon: string;
  minElo: number;
};

export const ProfilePage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { profile, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [favoriteTrump, setFavoriteTrump] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ranks: RankInfo[] = [
    { name: 'Bronze', icon: '🥉', minElo: 0 },
    { name: 'Silver', icon: '🥈', minElo: 1000 },
    { name: 'Gold', icon: '🥇', minElo: 1200 },
    { name: 'Platinum', icon: '💎', minElo: 1400 },
    { name: 'Diamond', icon: '💠', minElo: 1600 },
    { name: 'Master', icon: '👑', minElo: 1800 },
  ];

  useEffect(() => {
    const fetchStats = async () => {
      if (!profile) return;

      try {
        const { data } = await supabase
          .from('player_stats')
          .select('*')
          .eq('id', profile.id)
          .single();

        if (data) {
          setStats(data);

          // Calculate favorite trump suit
          const trumpCounts = {
            [Suit.OROS]: data.trump_oros_count,
            [Suit.COPAS]: data.trump_copas_count,
            [Suit.ESPADAS]: data.trump_espadas_count,
            [Suit.BASTOS]: data.trump_bastos_count,
          };

          const maxSuit = Object.entries(trumpCounts).reduce((a, b) =>
            a[1] > b[1] ? a : b
          );

          if (maxSuit[1] > 0) {
            setFavoriteTrump(maxSuit[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [profile]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <p className="text-gray-400">לא הצלחנו לטעון את הפרופיל</p>
      </div>
    );
  }

  const getRank = (): RankInfo => {
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (profile.elo_rating >= ranks[i].minElo) {
        return ranks[i];
      }
    }
    return ranks[0];
  };

  const rank = getRank();
  const winRate = stats && stats.games_played > 0 ? Math.round((stats.games_won / stats.games_played) * 100) : 0;
  const memberSince = new Date(profile.created_at).toLocaleDateString('he-IL');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#0d1117] flex items-center justify-center p-4 overflow-hidden relative"
    >
      {/* Main container */}
      <div className="relative w-full max-w-md">
        {/* Animated background glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-3xl blur-2xl opacity-75 animate-pulse"></div>

        {/* Main card */}
        <div className="relative bg-[#0d1117] border-2 border-yellow-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-sm max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <button
              onClick={onBack}
              className="text-yellow-400 hover:text-yellow-300 transition-colors mb-4"
            >
              ← חזרה
            </button>
            <div className="text-5xl mb-3">{profile.avatar}</div>
            <h1 className="text-3xl font-bold text-yellow-300 mb-1">{profile.nickname}</h1>
            <p className="text-gray-400 text-sm">חבר מ{memberSince}</p>
          </div>

          {/* Rank Badge */}
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl">{rank.icon}</span>
              <div>
                <p className="text-gray-300 text-sm">דרגה</p>
                <p className="text-yellow-300 font-bold text-lg">{rank.name}</p>
              </div>
            </div>
            <p className="text-yellow-400 font-bold mt-2 text-xl">{profile.elo_rating} ELO</p>
          </div>

          {/* Level and XP */}
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
            <p className="text-gray-400 text-sm mb-1">רמה</p>
            <p className="text-3xl font-bold text-yellow-300">{profile.level}</p>
            <p className="text-gray-400 text-xs mt-2">{profile.xp} XP</p>
          </div>

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Games Played */}
              <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">משחקים</p>
                <p className="text-blue-300 font-bold text-lg">{stats.games_played}</p>
              </div>

              {/* Win Rate */}
              <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">שיעור ניצחון</p>
                <p className="text-green-300 font-bold text-lg">{winRate}%</p>
              </div>

              {/* Wins */}
              <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">ניצחונות</p>
                <p className="text-yellow-300 font-bold text-lg">{stats.games_won}</p>
              </div>

              {/* Losses */}
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">הפסדות</p>
                <p className="text-red-300 font-bold text-lg">{stats.games_lost}</p>
              </div>

              {/* Tricks Won */}
              <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">טריקים</p>
                <p className="text-purple-300 font-bold text-lg">{stats.total_tricks_won}</p>
              </div>

              {/* Win Streak */}
              <div className="p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg text-center">
                <p className="text-gray-400 text-xs mb-1">רצף</p>
                <p className="text-orange-300 font-bold text-lg">
                  {stats.current_win_streak > 0 ? `🔥 ${stats.current_win_streak}` : '—'}
                </p>
              </div>
            </div>
          )}

          {/* Favorite Trump Suit */}
          {favoriteTrump && (
            <div className="mb-6 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl text-center">
              <p className="text-gray-400 text-sm mb-2">חליפת טראמפ המועדפת</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl">
                  {SUIT_SYMBOLS[favoriteTrump as Suit]}
                </span>
                <p className="text-indigo-300 font-bold text-lg">
                  {SUIT_NAMES_HE[favoriteTrump as Suit]}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={onBack}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-900/60 to-blue-800/60 hover:from-blue-800/80 hover:to-blue-700/80 text-white font-bold rounded-2xl transition-all duration-300 border border-blue-500/50 hover:border-blue-400/80"
            >
              ← חזור למשחק
            </button>

            <button
              onClick={handleSignOut}
              className="w-full py-3 px-4 bg-gradient-to-r from-red-900/60 to-red-800/60 hover:from-red-800/80 hover:to-red-700/80 text-white font-bold rounded-2xl transition-all duration-300 border border-red-500/50 hover:border-red-400/80"
            >
              🚪 התנתק
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-yellow-500/20 text-center">
            <p className="text-gray-400 text-xs">אטו • משחק קלפים קלאסי</p>
          </div>
        </div>
      </div>
    </div>
  );
};
