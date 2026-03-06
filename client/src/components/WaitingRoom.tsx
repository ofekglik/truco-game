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

interface SeatConfig {
  position: 'top' | 'right' | 'bottom' | 'left';
  positionClass: string;
  labelPosition: string;
}

const SEAT_CONFIG: Record<SeatPosition, SeatConfig> = {
  south: {
    position: 'bottom',
    positionClass: 'bottom-8 left-1/2 -translate-x-1/2',
    labelPosition: 'translate-y-16',
  },
  north: {
    position: 'top',
    positionClass: 'top-8 left-1/2 -translate-x-1/2',
    labelPosition: '-translate-y-16',
  },
  east: {
    position: 'right',
    positionClass: 'right-8 top-1/2 -translate-y-1/2',
    labelPosition: 'translate-x-16',
  },
  west: {
    position: 'left',
    positionClass: 'left-8 top-1/2 -translate-y-1/2',
    labelPosition: '-translate-x-16',
  },
};

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

  const renderSeat = (seat: SeatPosition) => {
    const player = gameState.players[seat];
    const team = SEAT_TEAM[seat];
    const isMySeat = seat === gameState.mySeat;
    const config = SEAT_CONFIG[seat];

    const teamColor = team === 'team1' ? 'from-blue-600 to-blue-500' : 'from-red-600 to-red-500';
    const teamBg = team === 'team1' ? 'bg-blue-900/30' : 'bg-red-900/30';
    const teamBorder = team === 'team1' ? 'border-blue-500' : 'border-red-500';

    return (
      <div key={seat} className={`absolute ${config.positionClass} z-10`}>
        {/* Seat Label */}
        <div className={`absolute text-center whitespace-nowrap ${config.labelPosition}`}>
          <p className="text-gray-400 text-xs font-medium">{SEAT_NAMES_HE[seat]}</p>
        </div>

        {/* Chair/Player Container */}
        {player ? (
          <div
            className={`relative w-24 h-24 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
              isMySeat
                ? 'ring-4 ring-yellow-400 shadow-lg shadow-yellow-400/50'
                : 'hover:scale-105'
            } bg-gradient-to-br ${teamColor}`}
            onClick={() => !isMySeat && onSwapSeat(seat)}
          >
            {/* Chair background */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-900 to-amber-950 opacity-40" />

            {/* Player content */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              {player.avatar && (
                <p className="text-4xl mb-1">{player.avatar}</p>
              )}
              <p className="text-white font-bold text-center text-sm leading-tight px-2 line-clamp-2">
                {player.name}
              </p>
              {isMySeat && (
                <p className="text-yellow-300 text-xs font-semibold mt-1">(אתה)</p>
              )}
              <div className={`mt-1 w-2 h-2 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
            </div>

            {/* Seat indicator ring */}
            <div className="absolute inset-0 rounded-full border-2 border-amber-700/50" />
          </div>
        ) : (
          <button
            onClick={() => onSwapSeat(seat)}
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 border-2 border-dashed ${teamBorder} hover:scale-110 group`}
          >
            {/* Empty chair background */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-900/20 to-amber-950/20" />

            {/* Pulsing plus icon */}
            <div className="relative z-10 text-2xl text-gray-400 group-hover:text-gray-300 animate-pulse">
              +
            </div>

            {/* Hover glow */}
            <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-gray-600/20 to-transparent" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-gray-900 to-black p-4 relative overflow-hidden">
      {/* Card pattern background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.05) 35px, rgba(255,255,255,.05) 70px)',
        }} />
      </div>

      {/* Main content container */}
      <div className="relative z-20 w-full max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-yellow-400 mb-2">טרוקו</h1>
          <p className="text-gray-400">חדר המתנה</p>
        </div>

        {/* Room code and settings section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
          {/* Room Code */}
          <div className="md:col-span-2 bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-yellow-500/30 rounded-lg p-6 backdrop-blur">
            <p className="text-gray-400 text-xs font-medium mb-2">קוד חדר</p>
            <div className="flex items-center gap-3">
              <p className="text-3xl md:text-4xl font-mono font-bold text-yellow-400 tracking-widest" dir="ltr">
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

          {/* Target Score */}
          <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-green-500/30 rounded-lg p-6 backdrop-blur">
            <p className="text-gray-400 text-xs font-medium mb-2">ניקוד מטרה</p>
            {showScoreEditor && isRoomCreator ? (
              <div className="flex gap-2 items-end">
                <input
                  type="number"
                  min="500"
                  max="2000"
                  value={targetScoreEdit}
                  onChange={(e) => setTargetScoreEdit(Math.max(500, Math.min(2000, parseInt(e.target.value) || 0)))}
                  className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
                  dir="ltr"
                />
                <button
                  onClick={handleUpdateScore}
                  className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-sm rounded font-semibold"
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
              <p className="text-gray-500 text-xs mt-1">לחץ לעריכה</p>
            )}
          </div>
        </div>

        {/* Player count indicator */}
        <div className="text-center mb-12">
          <p className="text-gray-400">
            <span className="text-2xl font-bold text-white">{playerCount}</span>
            <span className="text-gray-500">/</span>
            <span className="text-2xl font-bold text-white">4</span>
            <span className="text-gray-500 ml-2">שחקנים</span>
          </p>
        </div>

        {/* Card Table */}
        <div className="flex justify-center mb-12">
          <div className="relative w-full max-w-2xl aspect-video">
            {/* Table oval */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-green-700 to-green-900 shadow-2xl border-8 border-amber-900" style={{
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5), 0 20px 60px rgba(0,0,0,0.8)',
            }} />

            {/* Table felt shine */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-green-600/30 to-transparent opacity-50" />

            {/* Seats around the table */}
            {SEAT_DISPLAY.map((seat) => renderSeat(seat))}
          </div>
        </div>

        {/* Start Game Button */}
        <div className="flex justify-center">
          <button
            onClick={onStartGame}
            disabled={playerCount < 4 || !isRoomCreator}
            className={`px-8 py-4 font-bold text-lg rounded-lg transition-all duration-200 ${
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
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center text-gray-500 text-xs">
          <p>{isRoomCreator ? 'אתה יוצר החדר' : 'אתה שחקן'}</p>
        </div>
      </div>
    </div>
  );
};
