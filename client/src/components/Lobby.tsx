import React, { useState } from 'react';

interface LobbyProps {
  onCreateRoom: (name: string, targetScore?: number, avatar?: string) => void;
  onJoinRoom: (code: string, name: string, avatar?: string) => void;
  error: string | null;
  connected: boolean;
}

const AVATARS = ['🦁', '🐺', '🦊', '🐸', '🦉', '🐯', '🦅', '🐻', '🎭', '👑', '🎪', '🎯'];

export const Lobby: React.FC<LobbyProps> = ({ onCreateRoom, onJoinRoom, error, connected }) => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [targetScore, setTargetScore] = useState(1000);
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');

  const handleCreate = () => {
    if (name.trim()) onCreateRoom(name.trim(), targetScore, selectedAvatar);
  };

  const handleJoin = () => {
    if (name.trim() && roomCode.trim()) onJoinRoom(roomCode.trim().toUpperCase(), name.trim(), selectedAvatar);
  };

  const resetForm = () => {
    setName('');
    setRoomCode('');
    setTargetScore(1000);
    setSelectedAvatar(AVATARS[0]);
  };

  const goToMenu = () => {
    resetForm();
    setMode('menu');
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
            <div className="text-7xl mb-3 drop-shadow-lg">🃏</div>
            <h1
              className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 mb-2"
              style={{ fontFamily: 'Heebo, sans-serif' }}
            >
              טרוקו
            </h1>
            <p className="text-yellow-400/80 text-sm md:text-base font-medium">משחק קלפים ספרדי קלאסי</p>

            {/* Decorative line */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-yellow-500">♦</span>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
              <span className="text-yellow-500">♦</span>
            </div>
          </div>

          {/* Connection status */}
          {!connected && (
            <div className="mb-6 bg-red-900/20 border border-red-500/50 rounded-xl p-3 text-center">
              <p className="text-red-300 text-sm font-medium">🔄 מתחבר לשרת...</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-900/30 border border-red-500/60 rounded-xl p-4 text-center animate-pulse">
              <p className="text-red-200 text-sm font-medium">⚠ {error}</p>
            </div>
          )}

          {/* Menu Mode */}
          {mode === 'menu' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <button
                onClick={() => setMode('create')}
                disabled={!connected}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                ✨ צור חדר חדש
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={!connected}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-900/60 to-blue-800/60 hover:from-blue-800/80 hover:to-blue-700/80 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-white font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-blue-500/50 hover:border-blue-400/80 shadow-lg hover:shadow-blue-500/30 disabled:shadow-none disabled:cursor-not-allowed"
              >
                🔑 הצטרף לחדר
              </button>
            </div>
          )}

          {/* Create Room Mode */}
          {mode === 'create' && (
            <div className="space-y-5 animate-in fade-in duration-300">
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

              {/* Player Name Input */}
              <div className="space-y-2">
                <label className="block text-yellow-300 text-sm font-semibold">👤 שם השחקן</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="הכנס את שמך..."
                  className="w-full p-4 rounded-xl bg-[#0a0a0f] border-2 border-yellow-500/30 hover:border-yellow-500/60 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-right transition-colors duration-300"
                  maxLength={20}
                  autoFocus
                />
              </div>

              {/* Target Score Slider */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-yellow-300 text-sm font-semibold">🎯 סכום המטרה</label>
                  <span className="text-yellow-400 text-lg font-bold">{targetScore}</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="2000"
                  step="50"
                  value={targetScore}
                  onChange={e => setTargetScore(parseInt(e.target.value))}
                  className="w-full h-3 bg-yellow-500/20 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                  style={{
                    background: `linear-gradient(to left, rgb(250, 204, 21) 0%, rgb(250, 204, 21) ${((targetScore - 500) / 1500) * 100}%, rgba(250, 204, 21, 0.2) ${((targetScore - 500) / 1500) * 100}%, rgba(250, 204, 21, 0.2) 100%)`
                  }}
                />
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>500</span>
                  <span>2000</span>
                </div>
              </div>

              {/* Create Button */}
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                ✨ צור חדר
              </button>

              {/* Back Button */}
              <button
                onClick={goToMenu}
                className="w-full py-3 text-yellow-300 hover:text-yellow-200 transition-colors duration-300 text-sm font-medium"
              >
                ← חזרה לתפריט
              </button>
            </div>
          )}

          {/* Join Room Mode */}
          {mode === 'join' && (
            <div className="space-y-5 animate-in fade-in duration-300">
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

              {/* Player Name Input */}
              <div className="space-y-2">
                <label className="block text-yellow-300 text-sm font-semibold">👤 שם השחקן</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="הכנס את שמך..."
                  className="w-full p-4 rounded-xl bg-[#0a0a0f] border-2 border-yellow-500/30 hover:border-yellow-500/60 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-right transition-colors duration-300"
                  maxLength={20}
                  autoFocus
                />
              </div>

              {/* Room Code Input */}
              <div className="space-y-2">
                <label className="block text-yellow-300 text-sm font-semibold">🔑 קוד חדר</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="XXXX"
                  className="w-full p-4 rounded-xl bg-[#0a0a0f] border-2 border-yellow-500/30 hover:border-yellow-500/60 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-center tracking-widest text-3xl font-mono font-bold transition-colors duration-300"
                  maxLength={4}
                  dir="ltr"
                />
                <p className="text-gray-400 text-xs text-center">4 תווים בלבד</p>
              </div>

              {/* Join Button */}
              <button
                onClick={handleJoin}
                disabled={!name.trim() || !roomCode.trim() || roomCode.length < 4}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                🔑 הצטרף לחדר
              </button>

              {/* Back Button */}
              <button
                onClick={goToMenu}
                className="w-full py-3 text-yellow-300 hover:text-yellow-200 transition-colors duration-300 text-sm font-medium"
              >
                ← חזרה לתפריט
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-yellow-500/20 text-center">
            <p className="text-gray-400 text-xs">טרוקו • משחק קלפים קלאסי</p>
          </div>
        </div>
      </div>

      {/* Mobile-specific optimizations */}
      <style>{`
        @media (max-width: 768px) {
          input[type="range"] {
            height: 6px;
          }

          input[type="range"]::-webkit-slider-thumb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #fbbf24;
            cursor: pointer;
            border: 2px solid #f59e0b;
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
          }

          input[type="range"]::-moz-range-thumb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #fbbf24;
            cursor: pointer;
            border: 2px solid #f59e0b;
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
          }
        }

        @media (min-width: 769px) {
          input[type="range"]::-webkit-slider-thumb {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #fbbf24;
            cursor: pointer;
            border: 2px solid #f59e0b;
            box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
          }

          input[type="range"]::-moz-range-thumb {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #fbbf24;
            cursor: pointer;
            border: 2px solid #f59e0b;
            box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
          }
        }
      `}</style>
    </div>
  );
};
