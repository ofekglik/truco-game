import React from 'react';
import { ClientGameState, SeatPosition, SEAT_NAMES_HE, SEAT_TEAM } from '../types';

interface WaitingRoomProps {
  gameState: ClientGameState;
  roomCode: string;
  onStartGame: () => void;
}

const SEAT_DISPLAY: SeatPosition[] = ['south', 'east', 'north', 'west'];

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ gameState, roomCode, onStartGame }) => {
  const playerCount = SEAT_DISPLAY.filter(s => gameState.players[s] !== null).length;
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#0a0a1a] to-[#1a1a2e]">
      <div className="bg-[#16213e] border border-[#2a3a5e] rounded-2xl p-8 w-full max-w-lg shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-2 text-yellow-400">חדר משחק</h2>
        
        {/* Room Code */}
        <div className="bg-[#0a0a1a] rounded-xl p-4 mb-6 text-center">
          <p className="text-gray-400 text-sm mb-1">קוד חדר</p>
          <p className="text-4xl font-mono font-bold text-yellow-400 tracking-[0.3em]" dir="ltr">{roomCode}</p>
          <p className="text-gray-500 text-xs mt-2">שתפו את הקוד עם חברים</p>
        </div>
        
        {/* Players */}
        <div className="space-y-3 mb-6">
          <p className="text-gray-300 text-sm font-medium">שחקנים ({playerCount}/4)</p>
          {SEAT_DISPLAY.map(seat => {
            const player = gameState.players[seat];
            const team = SEAT_TEAM[seat];
            const teamColor = team === 'team1' ? 'text-blue-400' : 'text-red-400';
            const teamLabel = team === 'team1' ? 'קבוצה 1' : 'קבוצה 2';
            const isMySeat = seat === gameState.mySeat;
            
            return (
              <div
                key={seat}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player ? 'bg-[#1a2a4e]' : 'bg-[#0a0a1a] border border-dashed border-[#2a3a5e]'
                } ${isMySeat ? 'ring-1 ring-yellow-500' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs ${teamColor}`}>{teamLabel}</span>
                  <span className="text-gray-500 text-xs">({SEAT_NAMES_HE[seat]})</span>
                </div>
                <div className="flex items-center gap-2">
                  {player ? (
                    <>
                      <span className="text-white font-medium">{player.name}</span>
                      {isMySeat && <span className="text-yellow-400 text-xs">(אתה)</span>}
                      <span className={`w-2 h-2 rounded-full ${player.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                    </>
                  ) : (
                    <span className="text-gray-600">ממתין לשחקן...</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        <button
          onClick={onStartGame}
          disabled={playerCount < 4}
          className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-xl transition-colors"
        >
          {playerCount < 4 ? `ממתינים ל-${4 - playerCount} שחקנים נוספים...` : 'התחל משחק!'}
        </button>
      </div>
    </div>
  );
};
