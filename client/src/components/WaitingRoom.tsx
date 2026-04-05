import React, { useState } from 'react';
import { ClientGameState, SeatPosition, SEAT_NAMES_HE, SEAT_TEAM, GamePhase, BotDifficulty } from '../types';

interface WaitingRoomProps {
  gameState: ClientGameState;
  roomCode: string;
  onStartGame: () => void;
  onSwapSeat: (targetSeat: SeatPosition) => void;
  onUpdateSettings: (settings: { targetScore: number }) => void;
  onLeaveRoom: () => void;
  reconnecting: boolean;
  connected: boolean;
}

const SEAT_DISPLAY: SeatPosition[] = ['south', 'east', 'north', 'west'];

const DIFFICULTY_OPTIONS: { value: BotDifficulty; label: string; emoji: string; color: string }[] = [
  { value: 'easy', label: 'קל', emoji: '🟢', color: 'bg-green-600' },
  { value: 'medium', label: 'בינוני', emoji: '🟡', color: 'bg-yellow-600' },
  { value: 'hard', label: 'קשה', emoji: '🔴', color: 'bg-red-600' },
  { value: 'legendary', label: 'אגדי', emoji: '👑', color: 'bg-amber-600' },
];

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  gameState,
  roomCode,
  onStartGame,
  onSwapSeat,
  onUpdateSettings,
  onLeaveRoom,
  reconnecting,
  connected,
}) => {
  const [targetScoreEdit, setTargetScoreEdit] = useState(gameState.targetScore);
  const [showScoreEditor, setShowScoreEditor] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Per-seat bot difficulty selection
  const [seatDifficulty, setSeatDifficulty] = useState<Record<string, BotDifficulty>>({});
  const [addingSeat, setAddingSeat] = useState<string | null>(null);
  const [removingSeat, setRemovingSeat] = useState<string | null>(null);
  const [legendaryPassword, setLegendaryPassword] = useState('');
  const [legendaryError, setLegendaryError] = useState('');
  const [showLegendaryInput, setShowLegendaryInput] = useState<string | null>(null);

  const playerCount = SEAT_DISPLAY.filter((s) => gameState.players[s] !== null).length;
  const isRoomCreator = gameState.mySeat === 'south';

  const getDifficulty = (seat: SeatPosition): BotDifficulty => seatDifficulty[seat] || 'medium';

  const handleAddBot = async (seat: SeatPosition) => {
    const difficulty = getDifficulty(seat);

    // If legendary and no password yet, show password input
    if (difficulty === 'legendary' && showLegendaryInput !== seat) {
      setShowLegendaryInput(seat);
      setLegendaryError('');
      return;
    }

    setAddingSeat(seat);
    setLegendaryError('');
    try {
      const body: Record<string, string> = { roomCode, seat, difficulty };
      if (difficulty === 'legendary') body.password = legendaryPassword;
      const resp = await fetch('/api/bots/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        if (difficulty === 'legendary') {
          setLegendaryError(resp.status === 401 ? 'סיסמה שגויה' : err.error || 'שגיאה');
        }
      } else {
        setLegendaryPassword('');
        setShowLegendaryInput(null);
      }
    } catch (e) { console.error('Failed to add bot:', e); }
    setAddingSeat(null);
  };

  const handleRemoveBot = async (seat: SeatPosition) => {
    setRemovingSeat(seat);
    try {
      await fetch('/api/bots/seat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, seat }),
      });
    } catch (e) { console.error('Failed to remove bot:', e); }
    setRemovingSeat(null);
  };

  const handleUpdateScore = () => {
    if (targetScoreEdit >= 500 && targetScoreEdit <= 2000) {
      onUpdateSettings({ targetScore: targetScoreEdit });
      setShowScoreEditor(false);
    }
  };

  const isBot = (seat: SeatPosition): boolean => {
    const player = gameState.players[seat];
    return !!player && player.name.includes('בוט');
  };

  const renderSeatSlot = (seat: SeatPosition) => {
    const player = gameState.players[seat];
    const team = SEAT_TEAM[seat];
    const isMySeat = seat === gameState.mySeat;
    const teamColor = team === 'team1' ? '#3B82F6' : '#DC2626';
    const seatIsBot = isBot(seat);
    const isEmpty = !player;
    const difficulty = getDifficulty(seat);
    const diffOption = DIFFICULTY_OPTIONS.find(d => d.value === difficulty)!;

    return (
      <div key={seat} className="bg-[#16213e]/60 rounded-xl p-3 border border-gray-600 hover:border-yellow-400 transition-all">
        <div className="flex items-center gap-3">
          {/* Team color indicator */}
          <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />

          {/* Seat info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium">{SEAT_NAMES_HE[seat]}</p>
            {player ? (
              <div className="flex items-center gap-2 mt-0.5">
                {player.avatar && <span className="text-base">{player.avatar}</span>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{player.name}</p>
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-0.5">ריק</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5 flex-shrink-0">
            {isMySeat ? (
              <span className="px-3 py-1.5 rounded-lg font-bold text-xs bg-yellow-600/50 text-yellow-300">(אתה)</span>
            ) : seatIsBot && isRoomCreator ? (
              <button
                onClick={() => handleRemoveBot(seat)}
                disabled={removingSeat === seat}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-red-600/50 hover:bg-red-500/60 text-red-300 border border-red-500/40 transition-all disabled:opacity-50"
              >
                {removingSeat === seat ? '...' : '✕ הסר'}
              </button>
            ) : player ? (
              <button
                onClick={() => onSwapSeat(seat)}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                החלף מקום
              </button>
            ) : (
              <button
                onClick={() => onSwapSeat(seat)}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-green-600 hover:bg-green-500 text-white transition-colors"
              >
                שב כאן
              </button>
            )}
          </div>
        </div>

        {/* Bot controls for empty seats — room creator only */}
        {isEmpty && isRoomCreator && (
          <div className="mt-2 pt-2 border-t border-gray-700/50">
            <div className="flex items-center gap-2">
              {/* Difficulty picker (compact) */}
              <div className="flex gap-1 flex-1" dir="ltr">
                {DIFFICULTY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSeatDifficulty(prev => ({ ...prev, [seat]: opt.value }));
                      if (opt.value !== 'legendary') setShowLegendaryInput(null);
                    }}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                      difficulty === opt.value
                        ? opt.value === 'legendary'
                          ? 'bg-gradient-to-b from-yellow-600 to-amber-700 text-white border border-yellow-400'
                          : 'bg-purple-600 text-white border border-purple-400'
                        : 'bg-gray-700/50 text-gray-500 border border-gray-600/50 hover:text-gray-300'
                    }`}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
              {/* Add bot button */}
              <button
                onClick={() => handleAddBot(seat)}
                disabled={addingSeat === seat || (difficulty === 'legendary' && showLegendaryInput === seat && !legendaryPassword)}
                className={`px-3 py-1 rounded font-bold text-xs transition-all disabled:opacity-50 whitespace-nowrap ${
                  difficulty === 'legendary'
                    ? 'bg-gradient-to-r from-yellow-600/60 to-amber-600/60 hover:from-yellow-500/70 hover:to-amber-500/70 text-yellow-200 border border-yellow-500/40'
                    : 'bg-purple-600/50 hover:bg-purple-500/60 text-purple-200 border border-purple-500/40'
                }`}
              >
                {addingSeat === seat ? '...' : `🤖 ${diffOption.emoji}`}
              </button>
            </div>

            {/* Legendary password input (shown inline when needed) */}
            {showLegendaryInput === seat && difficulty === 'legendary' && (
              <div className="mt-2 space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="סיסמת בוט אגדי..."
                    value={legendaryPassword}
                    onChange={(e) => { setLegendaryPassword(e.target.value); setLegendaryError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && legendaryPassword) handleAddBot(seat); }}
                    className="flex-1 bg-gray-700/80 text-white rounded px-2 py-1 text-xs border border-yellow-500/30 focus:border-yellow-400 focus:outline-none placeholder-gray-500"
                    dir="rtl"
                    autoFocus
                  />
                  <button
                    onClick={() => handleAddBot(seat)}
                    disabled={!legendaryPassword || addingSeat === seat}
                    className="px-2 py-1 bg-yellow-600/60 hover:bg-yellow-500/70 text-yellow-200 text-xs rounded font-bold disabled:opacity-50"
                  >
                    👑 הוסף
                  </button>
                </div>
                {legendaryError && (
                  <p className="text-red-400 text-[10px] text-center">{legendaryError}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gradient-to-b from-gray-900 via-gray-900 to-black" dir="rtl">
      {/* Reconnection overlay */}
      {reconnecting && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">🔄</div>
            <p className="text-gray-300 text-lg">מתחבר מחדש...</p>
          </div>
        </div>
      )}

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-yellow-400 mb-4 text-center">לעזוב את החדר?</h3>
            <p className="text-gray-400 text-sm text-center mb-6">תחזור לדף הראשי</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLeaveConfirm(false); onLeaveRoom(); }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
              >
                כן, עזוב
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-full p-4 pb-8">
        {/* Header with back button */}
        <div className="flex items-center justify-between max-w-lg mx-auto mb-4">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="p-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 text-gray-400 hover:text-white transition-colors text-sm"
          >
            ← עזוב
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-yellow-400">אטו</h1>
            <p className="text-gray-400 text-xs">חדר המתנה</p>
          </div>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>

        {/* Connection status */}
        {!connected && !reconnecting && (
          <div className="max-w-lg mx-auto mb-3">
            <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-2 text-center">
              <p className="text-red-300 text-xs font-medium">מנותק מהשרת...</p>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
          {/* Target Score */}
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-green-500/30 rounded-xl p-3 backdrop-blur">
              <p className="text-gray-400 text-xs font-medium mb-1">ניקוד מטרה</p>
              {showScoreEditor && isRoomCreator ? (
                <div className="flex gap-2 items-end">
                  <input
                    type="number"
                    min="500"
                    max="2000"
                    value={targetScoreEdit}
                    onChange={(e) => setTargetScoreEdit(Math.max(500, Math.min(2000, parseInt(e.target.value) || 0)))}
                    className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm font-bold w-16"
                    dir="ltr"
                  />
                  <button
                    onClick={handleUpdateScore}
                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded font-semibold"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => isRoomCreator && setShowScoreEditor(true)}
                  className={`text-2xl font-bold text-green-400 ${isRoomCreator ? 'cursor-pointer hover:text-green-300' : ''}`}
                >
                  {gameState.targetScore}
                </div>
              )}
              {isRoomCreator && !showScoreEditor && (
                <p className="text-gray-500 text-[10px] mt-1">לחץ לעריכה</p>
              )}
            </div>
          </div>

          {/* Player count */}
          <div className="text-center py-1">
            <span className="text-lg font-bold text-white">{playerCount}</span>
            <span className="text-gray-500">/</span>
            <span className="text-lg font-bold text-white">4</span>
            <span className="text-gray-500 text-sm mr-2">שחקנים</span>
          </div>

          {/* Seat slots */}
          <div className="space-y-2">
            {SEAT_DISPLAY.map((seat) => renderSeatSlot(seat))}
          </div>

          {/* Start button */}
          <button
            onClick={onStartGame}
            disabled={playerCount < 4 || !isRoomCreator}
            className={`w-full py-3 font-bold text-lg rounded-xl transition-all duration-200 mt-2 ${
              playerCount === 4 && isRoomCreator
                ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white shadow-lg hover:shadow-green-500/50'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {!isRoomCreator ? (
              'ממתינים ליוצר החדר...'
            ) : playerCount < 4 ? (
              `ממתינים ל-${4 - playerCount} שחקנים נוספים...`
            ) : (
              'התחל משחק!'
            )}
          </button>

          {/* Footer */}
          <p className="text-center text-gray-500 text-xs pb-4">
            {isRoomCreator ? 'אתה יוצר החדר' : 'אתה שחקן'}
          </p>
        </div>
      </div>
    </div>
  );
};
