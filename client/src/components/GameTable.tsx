import React, { useState } from 'react';
import {
  ClientGameState, GamePhase, SeatPosition, Suit, SUIT_NAMES_HE, SUIT_SYMBOLS,
  SUIT_COLORS, SEAT_NAMES_HE, SEAT_TEAM, Card as CardType
} from '../types';
import { CardComponent, CardBack } from './Card';
import { Scoreboard } from './Scoreboard';

interface GameTableProps {
  gameState: ClientGameState;
  onPlayCard: (cardId: string) => void;
  onPlaceBid: (amount: number) => void;
  onPassBid: () => void;
  onDeclareTrump: (suit: Suit) => void;
  onSingCante: (suit: Suit) => void;
  onDoneSinging: () => void;
  onNextRound: () => void;
}

// Map seats to screen positions relative to current player (always at bottom)
function getRelativePosition(mySeat: SeatPosition, targetSeat: SeatPosition): 'bottom' | 'left' | 'right' | 'top' {
  const order: SeatPosition[] = ['south', 'east', 'north', 'west'];
  const myIdx = order.indexOf(mySeat);
  const targetIdx = order.indexOf(targetSeat);
  const diff = (targetIdx - myIdx + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as const)[diff];
}

export const GameTable: React.FC<GameTableProps> = ({
  gameState, onPlayCard, onPlaceBid, onPassBid, onDeclareTrump, onSingCante, onDoneSinging, onNextRound
}) => {
  const [bidAmount, setBidAmount] = useState(70);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const { validActions } = gameState;
  const isMyTurn = gameState.currentTurnSeat === gameState.mySeat;

  // Find the full card object for the selected card
  const selectedCard = selectedCardId ? gameState.myHand.find(c => c.id === selectedCardId) : null;
  // Clear selection if it's no longer our turn or the card left our hand
  if (selectedCardId && (!isMyTurn || !selectedCard)) {
    // use a timeout to avoid setState during render
    setTimeout(() => setSelectedCardId(null), 0);
  }

  // Sort hand by suit then rank
  const sortedHand = [...gameState.myHand].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.rank - b.rank;
  });

  const renderOtherPlayer = (pos: 'left' | 'top' | 'right') => {
    const order: SeatPosition[] = ['south', 'east', 'north', 'west'];
    const myIdx = order.indexOf(gameState.mySeat);
    const offsets = { left: 1, top: 2, right: 3 };
    const seatIdx = (myIdx + offsets[pos]) % 4;
    const seat = order[seatIdx];
    const player = gameState.players[seat];
    if (!player) return null;

    const isCurrentTurn = gameState.currentTurnSeat === seat;
    const team = SEAT_TEAM[seat];
    const teamColor = team === 'team1' ? 'border-blue-500' : 'border-red-500';

    const posClasses = {
      left: 'absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center',
      top: 'absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center',
      right: 'absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center',
    };

    return (
      <div key={seat} className={posClasses[pos]}>
        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium mb-2 border-2 ${
          isCurrentTurn ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : `bg-[#1a2a4e]/80 ${teamColor} text-gray-300`
        } ${!player.connected ? 'opacity-50' : ''}`}>
          {player.name}
          {!player.connected && ' (מנותק)'}
        </div>
        <div className={`flex ${pos === 'left' || pos === 'right' ? 'flex-col -space-y-8' : 'flex-row -space-x-6'}`}>
          {Array.from({ length: player.cardCount }, (_, i) => (
            <CardBack key={i} small />
          ))}
        </div>
      </div>
    );
  };

  const renderTrickCards = () => {
    const positions: Record<string, string> = {
      bottom: 'bottom-1/3 left-1/2 -translate-x-1/2',
      left: 'top-1/2 left-1/3 -translate-y-1/2',
      top: 'top-1/3 left-1/2 -translate-x-1/2',
      right: 'top-1/2 right-1/3 -translate-y-1/2',
    };

    return gameState.currentTrick.cards.map((tc, i) => {
      const pos = getRelativePosition(gameState.mySeat, tc.seat);
      return (
        <div key={i} className={`absolute ${positions[pos]} z-10`}>
          <CardComponent card={tc.card} small />
        </div>
      );
    });
  };

  const renderBiddingPanel = () => {
    if (gameState.phase !== GamePhase.BIDDING || !isMyTurn) return null;
    
    return (
      <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 bg-[#16213e]/95 border border-[#4a5a7e] rounded-xl p-4 shadow-xl backdrop-blur-sm">
        <p className="text-center text-yellow-400 font-bold mb-3">הצעה שלך</p>
        <div className="flex items-center gap-3 mb-3" dir="ltr">
          <button onClick={() => setBidAmount(Math.max(validActions.minBid, bidAmount - 10))}
            className="w-10 h-10 rounded-lg bg-[#2a3a5e] hover:bg-[#3a4a6e] text-white text-xl font-bold">−</button>
          <input
            type="number"
            value={bidAmount}
            onChange={e => {
              const raw = Number(e.target.value);
              const rounded = Math.round(raw / 10) * 10;
              setBidAmount(Math.max(validActions.minBid, Math.min(220, rounded)));
            }}
            className="w-20 h-10 text-center text-2xl font-bold bg-[#0a0a1a] text-yellow-400 rounded-lg border border-[#4a5a7e]"
            min={validActions.minBid}
            max={220}
            step={10}
          />
          <button onClick={() => setBidAmount(Math.min(220, bidAmount + 10))}
            className="w-10 h-10 rounded-lg bg-[#2a3a5e] hover:bg-[#3a4a6e] text-white text-xl font-bold">+</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { onPlaceBid(bidAmount); setBidAmount(Math.max(70, bidAmount + 10)); }}
            className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg">
            קנה ({bidAmount})
          </button>
          <button onClick={() => onPlaceBid(230)}
            className="py-2 px-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg text-sm">
            קאפו!
          </button>
          <button onClick={onPassBid}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg">
            עבור
          </button>
        </div>
      </div>
    );
  };

  const renderTrumpPanel = () => {
    if (gameState.phase !== GamePhase.TRUMP_DECLARATION || !validActions.canDeclareTrump) return null;
    
    return (
      <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 bg-[#16213e]/95 border border-[#4a5a7e] rounded-xl p-4 shadow-xl backdrop-blur-sm">
        <p className="text-center text-yellow-400 font-bold mb-3">בחר אטו (חליפה שולטת)</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(Suit).map(suit => (
            <button
              key={suit}
              onClick={() => onDeclareTrump(suit)}
              className="py-3 px-4 rounded-lg font-bold text-lg transition-colors hover:scale-105"
              style={{
                backgroundColor: SUIT_COLORS[suit] + '33',
                borderColor: SUIT_COLORS[suit],
                borderWidth: '2px',
                color: SUIT_COLORS[suit],
              }}
            >
              {SUIT_SYMBOLS[suit]} {SUIT_NAMES_HE[suit]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSingingPanel = () => {
    // Show singing panel to bidding team members during singing phase
    const isBiddingTeam = gameState.biddingTeam && SEAT_TEAM[gameState.mySeat] === gameState.biddingTeam;
    if (gameState.phase !== GamePhase.SINGING || !isBiddingTeam) return null;

    return (
      <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 bg-[#16213e]/95 border border-[#4a5a7e] rounded-xl p-4 shadow-xl backdrop-blur-sm">
        <p className="text-center text-yellow-400 font-bold mb-3">שירה</p>
        {validActions.singableCantes.length > 0 && (
          <div className="space-y-2 mb-3">
            {validActions.singableCantes.map(suit => (
              <button
                key={suit}
                onClick={() => onSingCante(suit)}
                className="w-full py-2 px-4 rounded-lg font-bold transition-colors hover:scale-105"
                style={{
                  backgroundColor: SUIT_COLORS[suit] + '33',
                  borderColor: SUIT_COLORS[suit],
                  borderWidth: '2px',
                  color: SUIT_COLORS[suit],
                }}
              >
                שר {SUIT_SYMBOLS[suit]} {SUIT_NAMES_HE[suit]} ({suit === gameState.trumpSuit ? '40' : '20'} נק׳)
              </button>
            ))}
          </div>
        )}
        {validActions.singableCantes.length === 0 && (
          <p className="text-center text-gray-400 text-sm mb-3">אין שירה אפשרית</p>
        )}
        <button onClick={onDoneSinging}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg">
          סיים שירה
        </button>
      </div>
    );
  };

  const renderRoundScoring = () => {
    if (gameState.phase !== GamePhase.ROUND_SCORING) return null;
    const lastRound = gameState.roundHistory[gameState.roundHistory.length - 1];
    if (!lastRound) return null;

    return (
      <div className="absolute inset-0 z-40 bg-black/70 flex items-center justify-center backdrop-blur-sm">
        <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h3 className="text-2xl font-bold text-center text-yellow-400 mb-4">סיום סיבוב {gameState.roundNumber}</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-900/30 rounded-lg p-3 text-center border border-blue-700">
              <p className="text-blue-400 text-sm mb-1">קבוצה 1</p>
              <p className="text-2xl font-bold text-white">{lastRound.team1Total}</p>
              <p className="text-xs text-gray-400">לקיחות: {lastRound.team1TrickPoints} | שירה: {lastRound.team1SingingPoints}</p>
            </div>
            <div className="bg-red-900/30 rounded-lg p-3 text-center border border-red-700">
              <p className="text-red-400 text-sm mb-1">קבוצה 2</p>
              <p className="text-2xl font-bold text-white">{lastRound.team2Total}</p>
              <p className="text-xs text-gray-400">לקיחות: {lastRound.team2TrickPoints} | שירה: {lastRound.team2SingingPoints}</p>
            </div>
          </div>
          
          {lastRound.biddingTeamFell && (
            <div className="bg-red-900/40 border border-red-600 rounded-lg p-2 mb-4 text-center">
              <p className="text-red-300 font-bold">הקבוצה המציעה נפלה! 💀</p>
            </div>
          )}
          
          <div className="bg-[#0a0a1a] rounded-lg p-3 mb-4">
            <p className="text-center text-gray-300 text-sm">ניקוד מצטבר</p>
            <div className="flex justify-around mt-2">
              <div className="text-center">
                <p className="text-blue-400 text-xs">קבוצה 1</p>
                <p className="text-xl font-bold text-white">{gameState.scores.team1}</p>
              </div>
              <div className="text-yellow-500 text-xl">—</div>
              <div className="text-center">
                <p className="text-red-400 text-xs">קבוצה 2</p>
                <p className="text-xl font-bold text-white">{gameState.scores.team2}</p>
              </div>
            </div>
          </div>
          
          <button onClick={onNextRound}
            className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-xl text-lg transition-colors">
            סיבוב הבא
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-[#0d1b0e]">
      {/* Table felt */}
      <div className="absolute inset-8 rounded-[3rem] bg-gradient-to-br from-[#1a5c2a] to-[#0f3d1a] border-[12px] border-[#3a2010] shadow-inner">
        {/* Table border decoration */}
        <div className="absolute inset-2 rounded-[2.5rem] border border-[#2a6a3a]/30" />
        
        {/* Center info */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-5">
          {gameState.trumpSuit && (
            <div className="bg-black/40 rounded-xl px-4 py-2 backdrop-blur-sm mb-2">
              <span className="text-gray-400 text-xs">אטו: </span>
              <span style={{ color: SUIT_COLORS[gameState.trumpSuit] }} className="text-lg font-bold">
                {SUIT_SYMBOLS[gameState.trumpSuit]} {SUIT_NAMES_HE[gameState.trumpSuit]}
              </span>
            </div>
          )}
          {gameState.currentBidAmount > 0 && (
            <div className="bg-black/40 rounded-lg px-3 py-1 backdrop-blur-sm">
              <span className="text-gray-400 text-xs">הצעה: </span>
              <span className="text-yellow-400 font-bold">{gameState.currentBidAmount}</span>
            </div>
          )}
        </div>
        
        {/* Trick cards */}
        {renderTrickCards()}
        
        {/* Other players */}
        {renderOtherPlayer('left')}
        {renderOtherPlayer('top')}
        {renderOtherPlayer('right')}
      </div>
      
      {/* Message bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm ${
          isMyTurn ? 'bg-yellow-600/80 text-black' : 'bg-black/60 text-gray-200'
        }`}>
          {gameState.lastMessage}
          {isMyTurn && ' ◀ תורך!'}
        </div>
      </div>
      
      {/* Trick counter */}
      <div className="absolute top-3 right-4 z-20 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm">
        <span className="text-gray-400">לקיחה: </span>
        <span className="text-white font-bold">{gameState.trickNumber}/10</span>
        <span className="text-gray-500 mx-2">|</span>
        <span className="text-blue-400">{gameState.team1TricksWon}</span>
        <span className="text-gray-500"> - </span>
        <span className="text-red-400">{gameState.team2TricksWon}</span>
      </div>
      
      {/* Score button */}
      <div className="absolute top-3 left-4 z-20">
        <button onClick={() => setShowScoreboard(!showScoreboard)}
          className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm hover:bg-black/80 transition-colors">
          <span className="text-blue-400 font-bold">{gameState.scores.team1}</span>
          <span className="text-gray-500 mx-1">-</span>
          <span className="text-red-400 font-bold">{gameState.scores.team2}</span>
          <span className="text-gray-400 mr-2"> 📊</span>
        </button>
      </div>
      
      {/* Singing indicators */}
      {gameState.cantes.length > 0 && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {gameState.cantes.map((c, i) => (
            <div key={i} className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-xs"
              style={{ color: SUIT_COLORS[c.suit] }}>
              {SUIT_SYMBOLS[c.suit]} {c.points} נק׳
            </div>
          ))}
        </div>
      )}
      
      {/* My hand */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-end justify-center" style={{ gap: '-0.25rem' }}>
          {sortedHand.map((card, i) => {
            const isPlayable = validActions.playableCards.includes(card.id);
            const isSelected = selectedCardId === card.id;
            const offset = (i - sortedHand.length / 2) * 2;
            return (
              <div key={card.id} style={{ marginLeft: i > 0 ? '-0.5rem' : '0', transform: `rotate(${offset}deg)` }}>
                <CardComponent
                  card={card}
                  playable={isPlayable && gameState.phase === GamePhase.TRICK_PLAY}
                  selected={isSelected}
                  onClick={() => {
                    if (gameState.phase === GamePhase.TRICK_PLAY) {
                      setSelectedCardId(isSelected ? null : card.id);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Card confirmation popup */}
      {selectedCard && gameState.phase === GamePhase.TRICK_PLAY && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 animate-fade-in">
          <div className="bg-[#16213e]/95 border border-yellow-500 rounded-xl p-3 shadow-xl backdrop-blur-sm flex items-center gap-3">
            <CardComponent card={selectedCard} small />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { onPlayCard(selectedCard.id); setSelectedCardId(null); }}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors">
                שחק
              </button>
              <button
                onClick={() => setSelectedCardId(null)}
                className="px-5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg text-xs transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* My name */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
        {gameState.players[gameState.mySeat] && (
          <div className={`px-3 py-1 rounded-lg text-sm font-medium border-2 ${
            isMyTurn ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : 'bg-[#1a2a4e]/80 border-blue-500 text-gray-300'
          }`}>
            {gameState.players[gameState.mySeat]!.name} (אתה)
          </div>
        )}
      </div>
      
      {/* Action panels */}
      {renderBiddingPanel()}
      {renderTrumpPanel()}
      {renderSingingPanel()}
      {renderRoundScoring()}
      
      {/* Scoreboard overlay */}
      {showScoreboard && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowScoreboard(false)}>
          <div onClick={e => e.stopPropagation()}>
            <Scoreboard gameState={gameState} onClose={() => setShowScoreboard(false)} />
          </div>
        </div>
      )}

      {/* Debug toggle */}
      <button onClick={() => setShowDebug(!showDebug)}
        className="absolute bottom-2 right-2 z-50 text-[10px] text-gray-600 hover:text-white">
        DBG
      </button>
      {showDebug && (
        <div className="absolute bottom-8 right-2 z-50 bg-black/90 text-[10px] text-green-400 p-2 rounded font-mono max-w-xs max-h-48 overflow-auto" dir="ltr">
          <div>phase: {gameState.phase}</div>
          <div>mySeat: {gameState.mySeat}</div>
          <div>turn: {gameState.currentTurnSeat}</div>
          <div>isMyTurn: {String(isMyTurn)}</div>
          <div>trick#{gameState.trickNumber} cards: {gameState.currentTrick.cards.map(tc => `${tc.seat}:${tc.card.id}`).join(', ') || 'none'}</div>
          <div>trump: {gameState.trumpSuit || 'none'}</div>
          <div>playable: [{validActions.playableCards.join(', ')}]</div>
          <div>hand: [{gameState.myHand.map(c => c.id).join(', ')}]</div>
        </div>
      )}
    </div>
  );
};
