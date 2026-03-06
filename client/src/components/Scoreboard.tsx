import React from 'react';
import { ClientGameState, SUIT_SYMBOLS, SUIT_NAMES_HE } from '../types';

interface ScoreboardProps {
  gameState: ClientGameState;
  onClose: () => void;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ gameState, onClose }) => {
  return (
    <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-yellow-400">לוח תוצאות</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
      </div>
      
      {/* Current scores */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700">
          <p className="text-blue-400 text-sm">קבוצה 1</p>
          <p className="text-3xl font-bold text-white">{gameState.scores.team1}</p>
        </div>
        <div className="bg-red-900/30 rounded-lg p-3 text-center border border-red-700">
          <p className="text-red-400 text-sm">קבוצה 2</p>
          <p className="text-3xl font-bold text-white">{gameState.scores.team2}</p>
        </div>
      </div>
      
      {/* Round history */}
      {gameState.roundHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-gray-400 text-sm font-medium">היסטוריית סיבובים</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {gameState.roundHistory.map((round, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0a1a] rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-500">סיבוב {i + 1}</span>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${round.biddingTeam === 'team1' && round.biddingTeamFell ? 'text-red-500 line-through' : 'text-blue-400'}`}>
                    {round.team1Total}
                  </span>
                  <span className="text-gray-600">-</span>
                  <span className={`font-bold ${round.biddingTeam === 'team2' && round.biddingTeamFell ? 'text-red-500 line-through' : 'text-red-400'}`}>
                    {round.team2Total}
                  </span>
                </div>
                <span className="text-yellow-500 text-xs">({round.bidAmount})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Trump info */}
      {gameState.trumpSuit && (
        <div className="mt-4 bg-[#0a0a1a] rounded-lg p-2 text-center">
          <span className="text-gray-400 text-xs">אטו נוכחי: </span>
          <span className="text-yellow-400 font-bold">
            {SUIT_SYMBOLS[gameState.trumpSuit]} {SUIT_NAMES_HE[gameState.trumpSuit]}
          </span>
        </div>
      )}
    </div>
  );
};
