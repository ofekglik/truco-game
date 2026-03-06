import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AVATARS = ['🦁', '🐺', '🦊', '🐸', '🦉', '🐯', '🦅', '🐻', '🎭', '👑', '🎪', '🎯'];

export const NicknameScreen: React.FC = () => {
  const { updateNickname } = useAuth();
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!nickname.trim()) {
      setError('יש להכניס שם');
      return;
    }

    if (nickname.length > 15) {
      setError('השם לא יכול להכיל יותר מ-15 תווים');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await updateNickname(nickname.trim(), selectedAvatar);
    } catch (err: any) {
      console.error('Update nickname error:', err);
      setError(err.message || 'שגיאה בעדכון פרופיל');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#0d1117] flex items-center justify-center p-4 overflow-hidden relative"
    >
      {/* Background card suit decorations */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute top-10 left-10 text-6xl">♠</div>
        <div className="absolute top-20 right-20 text-8xl">♥</div>
        <div className="absolute bottom-32 left-1/4 text-7xl">♦</div>
        <div className="absolute bottom-20 right-10 text-6xl">♣</div>
        <div className="absolute top-1/2 right-1/4 text-7xl">♠</div>
      </div>

      {/* Main container with glass morphism effect */}
      <div className="relative w-full max-w-md">
        {/* Animated background glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-3xl blur-2xl opacity-75 animate-pulse"></div>

        {/* Main card */}
        <div className="relative bg-[#0d1117] border-2 border-yellow-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Header section */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-3 drop-shadow-lg">{selectedAvatar}</div>
            <h1
              className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 mb-2"
              style={{ fontFamily: 'Heebo, sans-serif' }}
            >
              בחר שם
            </h1>
            <p className="text-yellow-400/80 text-sm md:text-base font-medium">צור את פרופילך</p>

            {/* Decorative line */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-yellow-500">♦</span>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
              <span className="text-yellow-500">♦</span>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-5">
            {/* Avatar Selection */}
            <div className="space-y-2">
              <label className="block text-yellow-300 text-sm font-semibold">😊 בחר אווטאר</label>
              <div className="grid grid-cols-6 gap-2">
                {AVATARS.map(avatar => (
                  <button
                    key={avatar}
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`aspect-square rounded-xl text-2xl transition-all duration-200 flex items-center justify-center ${
                      selectedAvatar === avatar
                        ? 'ring-4 ring-yellow-400 bg-yellow-500/20 scale-110'
                        : 'bg-[#0a0a0f] hover:bg-yellow-500/10'
                    }`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            {/* Nickname Input */}
            <div className="space-y-2">
              <label className="block text-yellow-300 text-sm font-semibold">👤 שם השחקן</label>
              <input
                type="text"
                value={nickname}
                onChange={e => {
                  setNickname(e.target.value);
                  setError(null);
                }}
                placeholder="הכנס את שמך..."
                className="w-full p-4 rounded-xl bg-[#0a0a0f] border-2 border-yellow-500/30 hover:border-yellow-500/60 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-right transition-colors duration-300"
                maxLength={15}
                autoFocus
              />
              <div className="flex justify-between text-gray-400 text-xs">
                <span>{15 - nickname.length} תווים זמינים</span>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900/30 border border-red-500/60 rounded-xl p-3 text-center">
                <p className="text-red-200 text-sm font-medium">⚠ {error}</p>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={!nickname.trim() || isLoading}
              className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin text-xl">⏳</div>
                    <span>שומר...</span>
                  </div>
                </>
              ) : (
                '✨ שמור פרופיל'
              )}
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-yellow-500/20 text-center">
            <p className="text-gray-400 text-xs">אטו • משחק קלפים קלאסי</p>
          </div>
        </div>
      </div>
    </div>
  );
};
