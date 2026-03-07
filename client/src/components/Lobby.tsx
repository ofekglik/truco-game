import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { RoomSummary } from '../types';

interface LobbyProps {
  onCreateRoom: (name: string, targetScore?: number, avatar?: string, password?: string) => void;
  onJoinRoom: (code: string, name: string, avatar?: string, password?: string) => void;
  error: string | null;
  connected: boolean;
  onShowProfile: () => void;
  roomsList: RoomSummary[];
  onFetchRooms: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  onCreateRoom, onJoinRoom, error, connected, onShowProfile,
  roomsList, onFetchRooms,
}) => {
  const { profile, isGuest, signOut } = useAuth();
  const [showCreateSettings, setShowCreateSettings] = useState(false);
  const [targetScore, setTargetScore] = useState(1000);
  const [createPassword, setCreatePassword] = useState('');
  const [passwordRoomCode, setPasswordRoomCode] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Fetch rooms on mount and periodically as fallback (real-time via socket is primary)
  useEffect(() => {
    onFetchRooms();
    const interval = setInterval(onFetchRooms, 8000);
    return () => clearInterval(interval);
  }, [onFetchRooms]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
        <p className="text-gray-400">טוען פרופיל...</p>
      </div>
    );
  }

  const handleQuickCreate = () => {
    onCreateRoom(profile.nickname, targetScore, profile.avatar, createPassword || undefined);
  };

  const handleJoinRoom = (room: RoomSummary) => {
    if (room.hasPassword) {
      setPasswordRoomCode(room.code);
      setJoinPassword('');
      // Focus the password input after it renders
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    } else {
      onJoinRoom(room.code, profile.nickname, profile.avatar);
    }
  };

  const handlePasswordJoin = (roomCode: string) => {
    if (joinPassword.trim()) {
      onJoinRoom(roomCode, profile.nickname, profile.avatar, joinPassword);
      setPasswordRoomCode(null);
      setJoinPassword('');
    }
  };

  const cancelPasswordPrompt = () => {
    setPasswordRoomCode(null);
    setJoinPassword('');
  };

  // Player count dots
  const PlayerDots: React.FC<{ count: number; max: number }> = ({ count, max }) => (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            i < count ? 'bg-green-400' : 'bg-gray-600'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div
      dir="rtl"
      className="h-[100dvh] w-full bg-[#0d1117] flex flex-col overflow-hidden relative"
    >
      {/* Background card suit decorations */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div className="absolute top-16 left-10 text-6xl">♠</div>
        <div className="absolute top-32 right-20 text-8xl">♥</div>
        <div className="absolute bottom-32 left-1/4 text-7xl">♦</div>
        <div className="absolute bottom-20 right-10 text-6xl">♣</div>
      </div>

      {/* ===== STICKY TOP BAR ===== */}
      <div className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-md border-b border-yellow-500/20 px-4 py-3 flex items-center justify-between gap-3">
        {/* User info (right side in RTL) */}
        {!isGuest ? (
          <button
            onClick={onShowProfile}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/15 hover:bg-yellow-500/30 border border-yellow-500/40 rounded-xl transition-all"
          >
            <span className="text-lg">{profile.avatar}</span>
            <span className="text-yellow-300 font-semibold text-sm max-w-[80px] truncate">{profile.nickname}</span>
          </button>
        ) : (
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/40 hover:bg-gray-600/50 border border-gray-600/40 rounded-xl transition-all"
          >
            <span className="text-lg">{profile.avatar}</span>
            <span className="text-gray-300 font-semibold text-sm max-w-[80px] truncate">{profile.nickname}</span>
          </button>
        )}

        {/* Create Room Button (left side in RTL) */}
        <button
          onClick={() => {
            if (showCreateSettings) {
              handleQuickCreate();
            } else {
              handleQuickCreate();
            }
          }}
          disabled={!connected}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-xl text-sm transition-all active:scale-95 shadow-md hover:shadow-yellow-500/40 disabled:shadow-none"
        >
          <span>+</span>
          <span>צור חדר</span>
        </button>
      </div>

      {/* ===== CREATE SETTINGS (expandable) ===== */}
      <div className="px-4">
        <button
          onClick={() => setShowCreateSettings(!showCreateSettings)}
          className="w-full py-2 text-gray-500 hover:text-gray-300 text-xs font-medium transition-colors flex items-center justify-center gap-1"
        >
          <span>{showCreateSettings ? '▾' : '▸'}</span>
          <span>הגדרות חדר מתקדמות</span>
        </button>

        {showCreateSettings && (
          <div className="pb-4 space-y-3 animate-in fade-in duration-200">
            <div className="bg-[#161b22] border border-gray-700/60 rounded-xl p-4 space-y-3">
              {/* Target Score */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-gray-400 text-xs font-medium">ניקוד יעד</label>
                  <span className="text-yellow-400 text-sm font-bold">{targetScore}</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="2000"
                  step="50"
                  value={targetScore}
                  onChange={e => setTargetScore(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                  style={{
                    background: `linear-gradient(to left, rgb(250, 204, 21) 0%, rgb(250, 204, 21) ${((targetScore - 500) / 1500) * 100}%, rgb(55, 65, 81) ${((targetScore - 500) / 1500) * 100}%, rgb(55, 65, 81) 100%)`
                  }}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-gray-400 text-xs font-medium">סיסמה (אופציונלי)</label>
                <input
                  type="text"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="השאר ריק לחדר פתוח"
                  className="w-full p-2.5 rounded-lg bg-[#0d1117] border border-gray-600 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-600 text-sm transition-colors"
                  maxLength={20}
                />
              </div>

              <button
                onClick={handleQuickCreate}
                disabled={!connected}
                className="w-full py-2.5 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 text-gray-900 font-bold rounded-xl text-sm transition-all active:scale-95"
              >
                צור חדר עם הגדרות
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connection status */}
      {!connected && (
        <div className="mx-4 mb-2 bg-red-900/20 border border-red-500/40 rounded-lg p-2 text-center">
          <p className="text-red-300 text-xs font-medium">מתחבר לשרת...</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mx-4 mb-2 bg-red-900/25 border border-red-500/50 rounded-lg p-2 text-center">
          <p className="text-red-200 text-xs font-medium">{error}</p>
        </div>
      )}

      {/* ===== ROOM LIST AREA ===== */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Section header */}
        <div className="flex items-center justify-between mb-3 mt-1">
          <h2 className="text-gray-400 text-sm font-medium">
            חדרים פתוחים
            {roomsList.length > 0 && (
              <span className="mr-1.5 text-yellow-400 font-bold">({roomsList.length})</span>
            )}
          </h2>
          {connected && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-gray-500 text-[10px]">live</span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {roomsList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
            <div className="text-6xl mb-4 opacity-60">🃏🃏🃏</div>
            <p className="text-gray-400 text-lg font-medium mb-2">אין חדרים פתוחים</p>
            <p className="text-gray-500 text-sm mb-6">תהיו הראשונים!</p>
            <button
              onClick={handleQuickCreate}
              disabled={!connected}
              className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-yellow-400 hover:from-yellow-400 hover:to-yellow-300 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-500 text-gray-900 font-bold rounded-2xl text-base transition-all active:scale-95 shadow-lg hover:shadow-yellow-500/40"
            >
              + צור חדר חדש
            </button>
          </div>
        ) : (
          /* Room cards grid: 1 col mobile, 2 col desktop */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roomsList.map((room) => {
              const isPasswordPromptActive = passwordRoomCode === room.code;

              return (
                <div
                  key={room.code}
                  className={`bg-[#161b22] border rounded-xl p-4 transition-all duration-200 ${
                    isPasswordPromptActive
                      ? 'border-yellow-500/60 ring-1 ring-yellow-500/30'
                      : 'border-gray-700/60 hover:border-gray-500/60'
                  }`}
                >
                  {/* Card header: creator info + lock */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl flex-shrink-0">{room.creatorAvatar || '🃏'}</span>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">
                          החדר של {room.creatorName}
                        </p>
                        <p className="text-gray-500 text-xs">ניקוד יעד: {room.targetScore}</p>
                      </div>
                    </div>
                    {room.hasPassword && (
                      <span className="text-yellow-500 text-lg flex-shrink-0" title="חדר מוגן בסיסמה">🔒</span>
                    )}
                  </div>

                  {/* Player count */}
                  <div className="flex items-center justify-between mb-3">
                    <PlayerDots count={room.playerCount} max={room.maxPlayers} />
                    <span className={`text-xs font-medium ${
                      room.playerCount >= 3 ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {room.playerCount}/{room.maxPlayers} שחקנים
                    </span>
                  </div>

                  {/* Password prompt (inline) */}
                  {isPasswordPromptActive ? (
                    <div className="space-y-2 animate-in fade-in duration-150">
                      <div className="flex gap-2">
                        <input
                          ref={passwordInputRef}
                          type="password"
                          value={joinPassword}
                          onChange={e => setJoinPassword(e.target.value)}
                          placeholder="הכנס סיסמה..."
                          className="flex-1 p-2.5 rounded-lg bg-[#0d1117] border border-gray-600 focus:border-yellow-400 focus:outline-none text-white placeholder-gray-500 text-sm text-center transition-colors"
                          maxLength={20}
                          onKeyDown={e => e.key === 'Enter' && handlePasswordJoin(room.code)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePasswordJoin(room.code)}
                          disabled={!joinPassword.trim()}
                          className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black text-sm font-bold rounded-lg transition-colors"
                        >
                          הצטרף
                        </button>
                        <button
                          onClick={cancelPasswordPrompt}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Join button */
                    <button
                      onClick={() => handleJoinRoom(room)}
                      disabled={room.playerCount >= room.maxPlayers}
                      className={`w-full py-2.5 font-bold rounded-lg text-sm transition-all active:scale-[0.98] ${
                        room.playerCount >= room.maxPlayers
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : room.hasPassword
                            ? 'bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/40'
                            : 'bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/40'
                      }`}
                    >
                      {room.playerCount >= room.maxPlayers
                        ? 'החדר מלא'
                        : room.hasPassword
                          ? '🔑 הצטרף עם סיסמה'
                          : 'הצטרף'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800/50 text-center">
        <p className="text-gray-600 text-[10px]">אטו • משחק קלפים קלאסי</p>
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #fbbf24; cursor: pointer;
          border: 2px solid #f59e0b;
          -webkit-appearance: none;
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%;
          background: #fbbf24; cursor: pointer;
          border: 2px solid #f59e0b;
        }
      `}</style>
    </div>
  );
};
