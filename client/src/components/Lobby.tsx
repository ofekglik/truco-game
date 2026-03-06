import React, { useState } from 'react';

interface LobbyProps {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (code: string, name: string) => void;
  error: string | null;
  connected: boolean;
}

export const Lobby: React.FC<LobbyProps> = ({ onCreateRoom, onJoinRoom, error, connected }) => {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');

  const handleCreate = () => {
    if (name.trim()) onCreateRoom(name.trim());
  };

  const handleJoin = () => {
    if (name.trim() && roomCode.trim()) onJoinRoom(roomCode.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0a0a1a] to-[#1a1a2e]">
      <div className="bg-[#16213e] border border-[#2a3a5e] rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h1 className="text-4xl font-bold text-center mb-2 text-yellow-400" style={{ fontFamily: 'Heebo, sans-serif' }}>
          🃏 טרוקו
        </h1>
        <p className="text-center text-gray-400 mb-8 text-sm">משחק קלפים ספרדי</p>
        
        {!connected && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-center text-red-300 text-sm">
            מתחבר לשרת...
          </div>
        )}
        
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-center text-red-300 text-sm">
            {error}
          </div>
        )}

        {mode === 'menu' && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              disabled={!connected}
              className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-xl text-lg transition-colors"
            >
              צור חדר חדש
            </button>
            <button
              onClick={() => setMode('join')}
              disabled={!connected}
              className="w-full py-4 bg-[#2a3a5e] hover:bg-[#3a4a6e] disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl text-lg transition-colors border border-[#4a5a7e]"
            >
              הצטרף לחדר
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-2 text-sm">שם השחקן</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="הכנס את שמך..."
                className="w-full p-3 rounded-lg bg-[#0a0a1a] border border-[#2a3a5e] text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
                maxLength={20}
                autoFocus
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-xl transition-colors"
            >
              צור חדר
            </button>
            <button
              onClick={() => setMode('menu')}
              className="w-full py-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              חזרה
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-2 text-sm">שם השחקן</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="הכנס את שמך..."
                className="w-full p-3 rounded-lg bg-[#0a0a1a] border border-[#2a3a5e] text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
                maxLength={20}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-gray-300 mb-2 text-sm">קוד חדר</label>
              <input
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                placeholder="הכנס קוד חדר..."
                className="w-full p-3 rounded-lg bg-[#0a0a1a] border border-[#2a3a5e] text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none text-center tracking-[0.5em] text-2xl font-mono"
                maxLength={4}
                dir="ltr"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!name.trim() || !roomCode.trim()}
              className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-xl transition-colors"
            >
              הצטרף
            </button>
            <button
              onClick={() => setMode('menu')}
              className="w-full py-2 text-gray-400 hover:text-white transition-colors text-sm"
            >
              חזרה
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
