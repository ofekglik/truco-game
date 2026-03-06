import React, { useState } from 'react';
import { ClientGameState, SeatPosition, SEAT_NAMES_HE, SEAT_TEAM, GamePhase } from '../types';

interface WaitingRoomProps {
  gameState: ClientGameState;
  roomCode: string;
  onStartGame: () => void;
  onSwapSeat: (targetSeat: SeatPosition) => void;
  onUpdateSettings: (settings: { targetScore: number }) => void;
}

const SEAT_DISPLAY: SeatPosition[] = ['south', 'east', 'north', 'west'];

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  gameState,
  roomCode,
  onStartGame,
  onSwapSeat,
  onUpdateSettings,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [targetScoreEdit, setTargetScoreEdit] = useState(gameState.targetScore);
  const [showScoreEditor, setShowScoreEditor] = useState(false);

  const playerCount = SEAT_DISPLAY.filter((s) => gameState.players[s] !== null).length;
  const isRoomCreator = gameState.mySeat === 'south';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleUpdateScore = () => {
    if (targetScoreEdit >= 500 && targetScoreEdit <= 2000) {
      onUpdateSettings({ targetScore: targetScoreEdit });
      setShowScoreEditor(false);
    }
  };

  const renderSeatSlot = (seat: SeatPosition) => {
    const player = gameState.players[seat];
    const team = SEAT_TEAM[seat];
    const isMySeat = seat === gameState.mySeat;
    const teamColor = team === 'team1' ? '#3B82F6' : '#DC2626';
    const teamBg = team === 'team1' ? 'from-blue-900/40 to-blue-800/40' : 'from-red-900/40 to-red-800/40';

    return (
      <div key={seat} className="flex items-center gap-3 bg-[#16213e]/60 rounded-xl p-4 border border-gray-600 hover:border-yellow-400 transition-all">
        {/* Team color indicator */}
        <div className="w-1 h-12 rounded-full" style={{ backgroundColor: teamColor }} />

        {/* Seat info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-medium">{SEAT_NAMES_HE[seat]}</p>
          {player ? (
            <div className="flex items-center gap-2 mt-1">
              {player.avatar && <span className="text-lg">{player.avatar}</span>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{player.name}</p>
                <div className={`text-xs mt-0.5 font-medium ${player.connected ? 'text-green-400' : 'text-red-400'}`}>
                  {player.connected ? 'מחובר' : 'מנותק'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">ריק</p>
          )}
        </div>

        {/* Action button */}
        <button
          onClick={() => onSwapSeat(seat)}
          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap ${
            isMySeat
              ? 'bg-yellow-600 hover:bg-yellow-500 text-black'
              : player
                ? 'bg-gray-600 hover:bg-gray-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {isMySeat ? '(אתה)' : player ? 'החלף' : 'הצטרף'}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black p-4 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-yellow-400 mb-2">טרוקו</h1>
        <p className="text-gray-400">חדר המתנה</p>
      </div>

      {/* Main content - compact vertical list */}
      <div className="flex-1 flex flex-col gap-4 max-w-2xl mx-auto w-full">
        {/* Room code card */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-yellow-500/30 rounded-xl p-4 backdrop-blur">
          <p className="text-gray-400 text-xs font-medium mb-2">קוד חדר</p>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-mono font-bold text-yellow-400 tracking-widest flex-1" dir="ltr">
              {roomCode}
            </p>
            <button
              onClick={handleCopyCode}
              className="flex-shrink-0 p-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 transition-colors"
              title="Copy room code"
            >
              {copiedCode ? (
                <span className="text-sm font-bold">✓</span>
              ) : (
                <span className="text-sm">📋</span>
              )}
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-2">שתפו קוד זה עם חברים</p>
        </div>

        {/* Target score card */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-green-500/30 rounded-xl p-4 backdrop-blur">
          <p className="text-gray-400 text-xs font-medium mb-2">ניקוד מטרה</p>
          {showScoreEditor && isRoomCreator ? (
            <div className="flex gap-2 items-end">
              <input
                type="number"
                min="500"
                max="2000"
                value={targetScoreEdit}
                onChange={(e) => setTargetScoreEdit(Math.max(500, Math.min(2000, parseInt(e.target.value) || 0)))}
                className="flex-1 bg-gray-700 text-white rounded px-3 py-2 text-sm font-bold"
                dir="ltr"
              />
              <button
                onClick={handleUpdateScore}
                className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-semibold"
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
            <p className="text-gray-500 text-xs mt-2">לחץ לעריכה</p>
          )}
        </div>

        {/* Player count indicator */}
        <div className="text-center py-2">
          <p className="text-gray-400 text-sm">
            <span className="text-xl font-bold text-white">{playerCount}</span>
            <span className="text-gray-500">/</span>
            <span className="text-xl font-bold text-white">4</span>
            <span className="text-gray-500 ml-2">שחקנים</span>
          </p>
        </div>

        {/* Seat slots - vertical list */}
        <div className="space-y-3 flex-1">
          {SEAT_DISPLAY.map((seat) => renderSeatSlot(seat))}
        </div>

        {/* Start button */}
        <button
          onClick={onStartGame}
          disabled={playerCount < 4 || !isRoomCreator}
          className={`w-full py-4 font-bold text-lg rounded-xl transition-all duration-200 ${
            playerCount === 4 && isRoomCreator
              ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white shadow-lg hover:shadow-green-500/50 scale-100 hover:scale-105'
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

        {/* Footer info */}
        <p className="text-center text-gray-500 text-xs">
          {isRoomCreator ? 'אתה יוצר החדר' : 'אתה שחקן'}
        </p>
      </div>
    </div>
  );
};
