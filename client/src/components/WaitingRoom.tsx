import React, { useState } from 'react';
import { ClientGameState, SeatPosition, SEAT_NAMES_HE, SEAT_TEAM, GamePhase } from '../types';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [targetScoreEdit, setTargetScoreEdit] = useState(gameState.targetScore);
  const [showScoreEditor, setShowScoreEditor] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const playerCount = SEAT_DISPLAY.filter((s) => gameState.players[s] !== null).length;
  const isRoomCreator = gameState.mySeat === 'south';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareLink = async () => {
    const url = `${window.location.origin}?room=${roomCode}`;
    // Try native share API on mobile
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'אטו - הצטרף למשחק!',
          text: `הצטרף למשחק אטו! קוד חדר: ${roomCode}`,
          url,
        });
        return;
      } catch {
        // User cancelled or share failed, fall back to clipboard
      }
    }
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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

    return (
      <div key={seat} className="flex items-center gap-3 bg-[#16213e]/60 rounded-xl p-3 border border-gray-600 hover:border-yellow-400 transition-all">
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

        {/* Action button */}
        <button
          onClick={() => onSwapSeat(seat)}
          disabled={isMySeat}
          className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors whitespace-nowrap flex-shrink-0 ${
            isMySeat
              ? 'bg-yellow-600/50 text-yellow-300 cursor-not-allowed'
              : player
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
          }`}
        >
          {isMySeat ? '(אתה)' : player ? 'החלף מקום' : 'שב כאן'}
        </button>
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
          {/* Room code + target score in a row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Room Code */}
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-yellow-500/30 rounded-xl p-3 backdrop-blur">
              <p className="text-gray-400 text-xs font-medium mb-1">קוד חדר</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-mono font-bold text-yellow-400 tracking-widest flex-1" dir="ltr">
                  {roomCode}
                </p>
                <button
                  onClick={handleCopyCode}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 transition-colors"
                >
                  {copiedCode ? <span className="text-xs font-bold">✓</span> : <span className="text-xs">📋</span>}
                </button>
              </div>
            </div>

            {/* Target Score */}
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

          {/* Share link button */}
          <button
            onClick={handleShareLink}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600/40 to-purple-600/40 hover:from-blue-600/60 hover:to-purple-600/60 border border-blue-500/30 hover:border-blue-400/50 rounded-xl text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
          >
            {copiedLink ? (
              <><span>✓</span> הקישור הועתק!</>
            ) : (
              <><span>🔗</span> שתף קישור הצטרפות</>
            )}
          </button>

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
