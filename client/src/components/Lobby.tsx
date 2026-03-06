import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RoomSummary } from '../types';

interface LobbyProps {
  onCreateRoom: (name: string, targetScore?: number, avatar?: string, password?: string) => void;
  onJoinRoom: (code: string, name: string, avatar?: string, password?: string) => void;
  error: string | null;
  connected: boolean;
  prefillRoomCode?: string;
  onShowProfile: () => void;
  roomsList: RoomSummary[];
  onFetchRooms: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom, onJoinRoom, error, connected, prefillRoomCode, onShowProfile,
  roomsList, onFetchRooms,
}) => {
  const { profile } = useAuth();
  const [roomCode, setRoomCode] = useState(prefillRoomCode || '');
  const [targetScore, setTargetScore] = useState(1000);
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'browse' | 'join'>(prefillRoomCode ? 'join' : 'menu');
  const [passwordPromptRoom, setPasswordPromptRoom] = useState<RoomSummary | null>(null);

  // If prefillRoomCode arrives after mount
  useEffect(() => {
    if (prefillRoomCode) {
      setRoomCode(prefillRoomCode);
      setMode('join');
    }
  }, [prefillRoomCode]);

  // Fetch rooms when entering browse mode or periodically
  useEffect(() => {
    if (mode === 'browse' || mode === 'menu') {
      onFetchRooms();
      const interval = setInterval(onFetchRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [mode, onFetchRooms]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <p className="text-gray-400">טוען פרופיל...</p>
      </div>
    );
  }

  const handleCreate = () => {
    onCreateRoom(profile.nickname, targetScore, profile.avatar, password || undefined);
  };

  const handleJoin = () => {
    if (roomCode.trim()) {
      onJoinRoom(roomCode.trim().toUpperCase(), profile.nickname, profile.avatar, joinPassword || undefined);
    }
  };

  const handleBrowseJoin = (room: RoomSummary) => {
    if (room.hasPassword) {
      setPasswordPromptRoom(room);
      setJoinPassword('');
    } else {
      onJoinRoom(room.code, profile.nickname, profile.avatar);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordPromptRoom) {
      onJoinRoom(passwordPromptRoom.code, profile.nickname, profile.avatar, joinPassword);
      setPasswordPromptRoom(null);
      setJoinPassword('');
    }
  };

  const goToMenu = () => {
    setRoomCode('');
    setPassword('');
    setJoinPassword('');
    setTargetScore(1000);
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

      {/* Profile Button */}
      <button
        onClick={onShowProfile}
        className="absolute top-4 left-4 flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/50 rounded-lg transition-all duration-300"
        title="הצג פרופיל"
      >
        <span className="text-xl">{profile.avatar}</span>
        <span className="text-yellow-300 font-semibold text-sm hidden sm:inline">{profile.nickname}</span>
      </button>

      {/* Password Prompt Modal */}
      {passwordPromptRoom && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-6 w-full max-w-sm shadow-2xl" dir="rtl">
            <h3 className="text-lg font-bold text-yellow-400 mb-2">🔒 חדר מוגן בסיסמה</h3>
            <p className="text-gray-400 text-sm mb-4">חדר {passwordPromptRoom.code} של {passwordPromptRoom.creatorName}</p>
            <input
              type="password"
              value={joinPassword}
              onChange={e => setJoinPassword(e.target.value)}
              placeholder="הכנס סיסמה"
              className="w-full p-3 rounded-xl bg-[#0a0a1a] border border-[#4a5a7e] text-white placeholder-gray-500 text-center mb-4 focus:border-yellow-400 focus:outline-none"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <div className="flex gap-3">
              <button
                onClick={handlePasswordSubmit}
                disabled={!joinPassword.trim()}
                className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-xl transition-colors"
              >
                הצטרף
              </button>
              <button
                onClick={() => setPasswordPromptRoom(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main container */}
      <div className="relative w-full max-w-md">
        <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-3xl blur-2xl opacity-75 animate-pulse"></div>

        <div className="relative bg-[#0d1117] border-2 border-yellow-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-7xl mb-3 drop-shadow-lg">🃏</div>
            <h1
              className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-400 mb-2"
              style={{ fontFamily: 'Heebo, sans-serif' }}
            >
              אטו
            </h1>
            <p className="text-yellow-400/80 text-sm font-medium">משחק קלפים ספרדי קלאסי</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-yellow-500">♦</span>
              <div className="w-16 h-px bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
              <span className="text-yellow-500">♦</span>
            </div>
          </div>

          {/* Connection status */}
          {!connected && (
            <div className="mb-4 bg-red-900/20 border border-red-500/50 rounded-xl p-3 text-center">
              <p className="text-red-300 text-sm font-medium">🔄 מתחבר לשרת...</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-500/60 rounded-xl p-3 text-center">
              <p className="text-red-200 text-sm font-medium">⚠ {error}</p>
            </div>
          )}

          {/* ===== MENU MODE ===== */}
          {mode === 'menu' && (
            <div className="space-y-3">
              <button
                onClick={() => setMode('create')}
                disabled={!connected}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                ✨ צור חדר חדש
              </button>
              <button
                onClick={() => setMode('browse')}
                disabled={!connected}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-900/60 to-blue-800/60 hover:from-blue-800/80 hover:to-blue-700/80 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-white font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 border border-blue-500/50 hover:border-blue-400/80 shadow-lg hover:shadow-blue-500/30 disabled:shadow-none disabled:cursor-not-allowed"
              >
                🏠 חדרים פתוחים
                {roomsList.length > 0 && (
                  <span className="mr-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">{roomsList.length}</span>
                )}
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={!connected}
                className="w-full py-3 px-6 bg-[#1a1a2e] hover:bg-[#222240] disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 font-medium rounded-2xl text-sm transition-all duration-300 border border-gray-700 hover:border-gray-600"
              >
                🔑 הצטרף עם קוד
              </button>
            </div>
          )}

          {/* ===== BROWSE ROOMS MODE ===== */}
          {mode === 'browse' && (
            <div className="space-y-4">
              <h2 className="text-yellow-400 font-bold text-lg text-center">🏠 חדרים פתוחים</h2>

              {roomsList.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3 opacity-50">🕸️</div>
                  <p className="text-gray-500 text-sm">אין חדרים פתוחים כרגע</p>
                  <p className="text-gray-600 text-xs mt-1">צור חדר חדש או המתן</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {roomsList.map((room) => (
                    <button
                      key={room.code}
                      onClick={() => handleBrowseJoin(room)}
                      className="w-full p-3 bg-[#1a1a2e] hover:bg-[#222240] border border-gray-700 hover:border-yellow-500/50 rounded-xl transition-all text-right flex items-center gap-3"
                    >
                      {/* Room code */}
                      <div className="bg-yellow-500/20 rounded-lg px-2.5 py-1.5 flex-shrink-0" dir="ltr">
                        <span className="text-yellow-400 font-mono font-bold text-sm">{room.code}</span>
                      </div>

                      {/* Room info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white text-sm font-medium truncate">{room.creatorName}</span>
                          {room.hasPassword && <span className="text-yellow-500 text-xs">🔒</span>}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          יעד: {room.targetScore}
                        </div>
                      </div>

                      {/* Player count */}
                      <div className="flex-shrink-0 text-center">
                        <div className={`text-lg font-bold ${room.playerCount >= 3 ? 'text-green-400' : 'text-blue-400'}`}>
                          {room.playerCount}/{room.maxPlayers}
                        </div>
                        <div className="text-gray-600 text-[10px]">שחקנים</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={goToMenu}
                className="w-full py-3 text-yellow-300 hover:text-yellow-200 transition-colors text-sm font-medium"
              >
                ← חזרה לתפריט
              </button>
            </div>
          )}

          {/* ===== CREATE ROOM MODE ===== */}
          {mode === 'create' && (
            <div className="space-y-4">
              {/* Player Info */}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl">{profile.avatar}</span>
                  <p className="text-yellow-300 font-bold">{profile.nickname}</p>
                </div>
              </div>

              {/* Target Score Slider */}
              <div className="space-y-2">
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

              {/* Optional Password */}
              <div className="space-y-2">
                <label className="text-gray-400 text-sm font-medium">🔒 סיסמה (אופציונלי)</label>
                <input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="השאר ריק לחדר פתוח"
                  className="w-full p-3 rounded-xl bg-[#0a0a0f] border border-gray-700 hover:border-gray-600 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-600 text-sm transition-colors"
                  maxLength={20}
                />
              </div>

              <button
                onClick={handleCreate}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50"
              >
                ✨ צור חדר
              </button>

              <button
                onClick={goToMenu}
                className="w-full py-3 text-yellow-300 hover:text-yellow-200 transition-colors text-sm font-medium"
              >
                ← חזרה לתפריט
              </button>
            </div>
          )}

          {/* ===== JOIN BY CODE MODE ===== */}
          {mode === 'join' && (
            <div className="space-y-4">
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl">{profile.avatar}</span>
                  <p className="text-yellow-300 font-bold">{profile.nickname}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-yellow-300 text-sm font-semibold">🔑 קוד חדר</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="XXXX"
                  className="w-full p-4 rounded-xl bg-[#0a0a0f] border-2 border-yellow-500/30 hover:border-yellow-500/60 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-center tracking-widest text-3xl font-mono font-bold transition-colors"
                  maxLength={4}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <label className="text-gray-400 text-sm font-medium">🔒 סיסמה (אם יש)</label>
                <input
                  type="password"
                  value={joinPassword}
                  onChange={e => setJoinPassword(e.target.value)}
                  placeholder="השאר ריק אם אין סיסמה"
                  className="w-full p-3 rounded-xl bg-[#0a0a0f] border border-gray-700 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-600 text-sm text-center transition-colors"
                  maxLength={20}
                />
              </div>

              <button
                onClick={handleJoin}
                disabled={!roomCode.trim() || roomCode.length < 4}
                className="w-full py-4 px-6 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-yellow-500/50 disabled:shadow-none disabled:cursor-not-allowed"
              >
                🔑 הצטרף
              </button>

              <button
                onClick={goToMenu}
                className="w-full py-3 text-yellow-300 hover:text-yellow-200 transition-colors text-sm font-medium"
              >
                ← חזרה לתפריט
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-yellow-500/20 text-center">
            <p className="text-gray-400 text-xs">אטו • משחק קלפים קלאסי</p>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          input[type="range"] { height: 6px; }
          input[type="range"]::-webkit-slider-thumb {
            width: 24px; height: 24px; border-radius: 50%;
            background: #fbbf24; cursor: pointer;
            border: 2px solid #f59e0b;
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
          }
          input[type="range"]::-moz-range-thumb {
            width: 24px; height: 24px; border-radius: 50%;
            background: #fbbf24; cursor: pointer;
            border: 2px solid #f59e0b;
          }
        }
      `}</style>
    </div>
  );
};
