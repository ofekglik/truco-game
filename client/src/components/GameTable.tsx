import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClientGameState, GamePhase, SeatPosition, Suit, SUIT_NAMES_HE, SUIT_SYMBOLS,
  SUIT_COLORS, SEAT_NAMES_HE, SEAT_TEAM, Card as CardType, CARD_POWER
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
  onLeaveRoom: () => void;
  reconnecting: boolean;
  connected: boolean;
}

function getRelativePosition(mySeat: SeatPosition, targetSeat: SeatPosition): 'bottom' | 'left' | 'right' | 'top' {
  const order: SeatPosition[] = ['south', 'east', 'north', 'west'];
  const myIdx = order.indexOf(mySeat);
  const targetIdx = order.indexOf(targetSeat);
  const diff = (targetIdx - myIdx + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as const)[diff];
}

const createOscillatorSound = (frequency: number, duration: number, type: 'sine' | 'square' | 'triangle' | 'sawtooth' = 'sine') => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();

  oscillator.frequency.value = frequency;
  oscillator.type = type;
  envelope.gain.setValueAtTime(0.3, audioContext.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

  oscillator.connect(envelope);
  envelope.connect(audioContext.destination);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

const playCardPlaySound = () => {
  createOscillatorSound(800, 0.1, 'square');
};

const playTurnChime = () => {
  createOscillatorSound(440, 0.15, 'sine');
  setTimeout(() => createOscillatorSound(554, 0.15, 'sine'), 80);
};

const playWinSound = () => {
  createOscillatorSound(330, 0.2, 'sine');
  setTimeout(() => createOscillatorSound(440, 0.2, 'sine'), 150);
  setTimeout(() => createOscillatorSound(550, 0.3, 'sine'), 300);
};

export const GameTable: React.FC<GameTableProps> = ({
  gameState, onPlayCard, onPlaceBid, onPassBid, onDeclareTrump, onSingCante, onDoneSinging, onNextRound,
  onLeaveRoom, reconnecting, connected
}) => {
  const [bidAmount, setBidAmount] = useState(70);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('soundEnabled');
    return saved === null ? true : saved === 'true';
  });
  const [useCustomImages, setUseCustomImages] = useState(false);
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [trickToast, setTrickToast] = useState<{ winner: string; team1: number; team2: number } | null>(null);
  const [lastCompletedTricksLength, setLastCompletedTricksLength] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const dragStateRef = useRef<{
    isDragging: boolean;
    draggedCardId: string | null;
    startX: number;
    startY: number;
    touchStartTime: number;
  }>({
    isDragging: false,
    draggedCardId: null,
    startX: 0,
    startY: 0,
    touchStartTime: 0,
  });

  const { validActions } = gameState;
  const isMyTurn = gameState.currentTurnSeat === gameState.mySeat;
  const isMobile = windowWidth < 768;
  const isLandscape = window.innerHeight < window.innerWidth;

  // Check for custom card images on mount
  useEffect(() => {
    const img = new Image();
    img.onload = () => setUseCustomImages(true);
    img.onerror = () => setUseCustomImages(false);
    img.src = '/cards/oros/1.png';
  }, []);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (handOrder.length === 0 || gameState.roundNumber > (lastCompletedTricksLength > gameState.completedTricks.length ? gameState.roundNumber : -1)) {
      const defaultOrder = [...gameState.myHand].sort((a, b) => {
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return a.rank - b.rank;
      }).map(c => c.id);
      setHandOrder(defaultOrder);
    }
  }, [gameState.roundNumber, gameState.myHand.length]);

  useEffect(() => {
    if (gameState.completedTricks.length > lastCompletedTricksLength && gameState.completedTricks.length > 0) {
      const lastTrick = gameState.completedTricks[gameState.completedTricks.length - 1];
      if (lastTrick.winnerSeat) {
        const winnerPlayer = gameState.players[lastTrick.winnerSeat];
        if (winnerPlayer) {
          setTrickToast({
            winner: winnerPlayer.name,
            team1: gameState.team1TricksWon,
            team2: gameState.team2TricksWon,
          });
          if (soundEnabled) playWinSound();
          setTimeout(() => setTrickToast(null), 2500);
        }
      }
      setLastCompletedTricksLength(gameState.completedTricks.length);
    }
  }, [gameState.completedTricks.length, gameState.team1TricksWon, gameState.team2TricksWon, soundEnabled]);

  useEffect(() => {
    if (isMyTurn && soundEnabled) {
      playTurnChime();
      navigator.vibrate?.(100);
    }
  }, [isMyTurn, soundEnabled]);

  const selectedCard = selectedCardId ? gameState.myHand.find(c => c.id === selectedCardId) : null;

  useEffect(() => {
    if (selectedCardId && (!isMyTurn || !selectedCard)) {
      setSelectedCardId(null);
    }
  }, [isMyTurn, selectedCardId, selectedCard]);

  const sortedHand = handOrder
    .map(id => gameState.myHand.find(c => c.id === id))
    .filter((c): c is CardType => c !== undefined);

  const handleDragStart = useCallback((cardId: string, e: React.MouseEvent | React.TouchEvent) => {
    const isTouchEvent = 'touches' in e;
    if (isTouchEvent) {
      dragStateRef.current.touchStartTime = Date.now();
      return;
    }
    const mouseEvent = e as React.MouseEvent;
    dragStateRef.current.isDragging = true;
    dragStateRef.current.draggedCardId = cardId;
    dragStateRef.current.startX = mouseEvent.clientX;
    dragStateRef.current.startY = mouseEvent.clientY;
  }, []);

  const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStateRef.current.isDragging || !dragStateRef.current.draggedCardId) return;

    const isTouchEvent = 'touches' in e;
    const clientX = isTouchEvent ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;

    const draggedIdx = sortedHand.findIndex(c => c.id === dragStateRef.current.draggedCardId);
    if (draggedIdx === -1) return;

    const currentX = dragStateRef.current.startX;
    const threshold = 30;
    if (clientX < currentX - threshold && draggedIdx > 0) {
      const newOrder = [...handOrder];
      const from = newOrder.indexOf(dragStateRef.current.draggedCardId!);
      const to = from - 1;
      [newOrder[from], newOrder[to]] = [newOrder[to], newOrder[from]];
      setHandOrder(newOrder);
      dragStateRef.current.startX = clientX;
    } else if (clientX > currentX + threshold && draggedIdx < sortedHand.length - 1) {
      const newOrder = [...handOrder];
      const from = newOrder.indexOf(dragStateRef.current.draggedCardId!);
      const to = from + 1;
      [newOrder[from], newOrder[to]] = [newOrder[to], newOrder[from]];
      setHandOrder(newOrder);
      dragStateRef.current.startX = clientX;
    }
  }, [sortedHand, handOrder]);

  const handleDragEnd = useCallback(() => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.draggedCardId = null;
  }, []);

  const handleTouchStart = useCallback((cardId: string, e: React.TouchEvent) => {
    dragStateRef.current.draggedCardId = cardId;
    dragStateRef.current.touchStartTime = Date.now();
    dragStateRef.current.startX = e.touches[0].clientX;
    dragStateRef.current.startY = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragStateRef.current.draggedCardId) return;

    const holdDuration = Date.now() - dragStateRef.current.touchStartTime;
    if (holdDuration < 200) return;

    if (!dragStateRef.current.isDragging) {
      dragStateRef.current.isDragging = true;
    }

    handleDragMove(e);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  const renderTurnTimer = () => {
    const isCurrentTurnPlayer = isMyTurn;
    if (!isCurrentTurnPlayer) return null;

    const circumference = 2 * Math.PI * 18;
    const elapsed = (Date.now() - gameState.turnStartedAt) / 1000;
    const progress = Math.min(1, elapsed / 60);
    const offset = circumference * (1 - progress);
    const isLowTime = elapsed > 50;

    return (
      <svg width="44" height="44" className="absolute -bottom-12 left-1/2 -translate-x-1/2">
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={isLowTime ? '#ef4444' : '#eab308'}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        {elapsed < 15 && (
          <text x="22" y="28" textAnchor="middle" className="text-xs font-bold" fill={isLowTime ? '#ef4444' : '#eab308'}>
            {Math.ceil(60 - elapsed)}
          </text>
        )}
      </svg>
    );
  };

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
        <div className={`relative px-3 py-1.5 rounded-lg text-sm font-medium mb-2 border-2 ${
          isCurrentTurn ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : `bg-[#1a2a4e]/80 ${teamColor} text-gray-300`
        } ${!player.connected ? 'opacity-50' : ''}`}>
          {player.avatar && <span className="mr-1">{player.avatar}</span>}
          {player.name}
          {!player.connected && ' (מנותק)'}
          {isCurrentTurn && renderTurnTimer()}
        </div>
        <div className={`flex ${pos === 'left' || pos === 'right' ? 'flex-col -space-y-8' : 'flex-row -space-x-6'}`}>
          {Array.from({ length: player.cardCount }, (_, i) => (
            <CardBack
              key={i}
              small
              backImageSrc={useCustomImages ? '/cards/back.png' : undefined}
            />
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
      const cardImageSrc = useCustomImages ? `/cards/${tc.card.suit}/${tc.card.rank}.png` : undefined;
      return (
        <div
          key={i}
          className={`absolute ${positions[pos]} z-10 animate-slideIn`}
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <CardComponent
            card={tc.card}
            small
            useCustomImages={useCustomImages}
            imageSrc={cardImageSrc}
          />
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
              <p className="text-red-300 font-bold">הקבוצה המציעה נפלה!</p>
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

          <div className="bg-[#0a0a1a] rounded-lg p-3 mb-4">
            <p className="text-gray-400 text-xs text-center mb-2">התקדמות לניצחון ({gameState.targetScore})</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, (gameState.scores.team1 / gameState.targetScore) * 100)}%` }}
                />
              </div>
              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, (gameState.scores.team2 / gameState.targetScore) * 100)}%` }}
                />
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

  const renderGameOver = () => {
    if (gameState.phase !== GamePhase.GAME_OVER) return null;
    const team1Wins = gameState.scores.team1 >= gameState.targetScore;
    const winnerTeam = team1Wins ? 'קבוצה 1' : 'קבוצה 2';
    const winnerColor = team1Wins ? 'text-blue-400' : 'text-red-400';

    return (
      <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm">
        <div className="text-center">
          <h2 className={`text-5xl font-bold mb-4 ${winnerColor}`}>🎉 {winnerTeam} ניצחה! 🎉</h2>
          <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-blue-900/30 rounded-lg p-4 text-center border border-blue-700">
                <p className="text-blue-400 text-sm mb-2">קבוצה 1</p>
                <p className="text-4xl font-bold text-white">{gameState.scores.team1}</p>
              </div>
              <div className="bg-red-900/30 rounded-lg p-4 text-center border border-red-700">
                <p className="text-red-400 text-sm mb-2">קבוצה 2</p>
                <p className="text-4xl font-bold text-white">{gameState.scores.team2}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleLeaveRoom = () => {
    setShowLeaveConfirm(false);
    setShowMenu(false);
    onLeaveRoom();
  };

  // Calculate fan card layout
  const cardCount = sortedHand.length;
  const fanSpreadDegrees = 8;
  const fanHeightPx = 30;

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-[#0d1b0e]">
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out forwards;
        }
        @keyframes slideInTop {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideInTop {
          animation: slideInTop 0.4s ease-out forwards;
        }
        @keyframes goldenGlow {
          0%, 100% {
            box-shadow: 0 0 0 rgba(251, 191, 36, 0);
          }
          50% {
            box-shadow: 0 0 12px rgba(251, 191, 36, 0.6);
          }
        }
        .animate-goldenGlow {
          animation: goldenGlow 0.6s ease-in-out;
        }
        @keyframes slideInFromLeft {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideInFromLeft {
          animation: slideInFromLeft 0.3s ease-out;
        }
      `}</style>

      {/* Table felt */}
      <div className={`absolute inset-8 rounded-[3rem] bg-gradient-to-br from-[#1a5c2a] to-[#0f3d1a] border-[12px] border-[#3a2010] shadow-inner ${
        isMobile ? 'inset-4' : ''
      }`}>
        <div className="absolute inset-2 rounded-[2.5rem] border border-[#2a6a3a]/30" />

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

        {renderTrickCards()}
        {renderOtherPlayer('left')}
        {renderOtherPlayer('top')}
        {renderOtherPlayer('right')}
      </div>

      {trickToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-25 animate-slideInTop">
          <div className="bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 text-sm text-white border border-gray-600">
            <span className="font-bold">{trickToast.winner}</span> ניצח לקיחה |
            <span className="text-blue-400 mx-2 font-bold">{trickToast.team1}</span>
            <span className="text-gray-500">-</span>
            <span className="text-red-400 mx-2 font-bold">{trickToast.team2}</span>
          </div>
        </div>
      )}

      {/* Reconnection Overlay */}
      {reconnecting && (
        <div className="absolute inset-0 z-60 bg-black/70 flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">🔄</div>
            <p className="text-gray-300 text-lg">מתחבר מחדש...</p>
          </div>
        </div>
      )}

      {/* Hamburger Menu */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="absolute top-4 right-4 z-50 text-2xl hover:scale-110 transition-transform"
      >
        ☰
      </button>

      {/* Menu Slide-out Panel */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute top-0 right-0 h-full w-64 bg-[#1a2a4e] border-l border-blue-500 shadow-lg z-45 animate-slideInFromLeft">
            <div className="p-6 space-y-4">
              <h3 className="text-xl font-bold text-yellow-400 mb-6">תפריט</h3>

              <button
                onClick={() => setShowScoreboard(!showScoreboard)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-right"
              >
                📊 הצג טבלת ניקוד
              </button>

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-right"
              >
                {soundEnabled ? '🔊' : '🔇'} {soundEnabled ? 'כבה צליל' : 'הדלק צליל'}
              </button>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-right"
              >
                🔧 {showDebug ? 'הסתר' : 'הצג'} Debug
              </button>

              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors text-right"
              >
                🚪 עזוב משחק
              </button>
            </div>
          </div>
        </>
      )}

      {/* Leave Room Confirmation */}
      {showLeaveConfirm && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#16213e] border border-[#4a5a7e] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-yellow-400 mb-4 text-center">בטוח שאתה רוצה לעזוב את המשחק?</h3>
            <div className="flex gap-3">
              <button
                onClick={handleLeaveRoom}
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
      <div className="absolute top-3 left-4 z-20 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm">
        <span className="text-gray-400">לקיחה: </span>
        <span className="text-white font-bold">{gameState.trickNumber}/10</span>
        <span className="text-gray-500 mx-2">|</span>
        <span className="text-blue-400">{gameState.team1TricksWon}</span>
        <span className="text-gray-500"> - </span>
        <span className="text-red-400">{gameState.team2TricksWon}</span>
      </div>

      {/* Singing indicators */}
      {gameState.cantes.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex gap-2 flex-wrap justify-center max-w-xs">
          {gameState.cantes.map((c, i) => (
            <div key={i} className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-xs"
              style={{ color: SUIT_COLORS[c.suit] }}>
              {SUIT_SYMBOLS[c.suit]} {c.points} נק׳
            </div>
          ))}
        </div>
      )}

      {/* My hand - Fan layout */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 cursor-grab active:cursor-grabbing"
        style={{
          width: Math.max(300, cardCount * 60),
          height: 200,
        }}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative w-full h-full flex items-end justify-center" style={{ perspective: '1000px' }}>
          {sortedHand.map((card, i) => {
            const isPlayable = validActions.playableCards.includes(card.id);
            const isSelected = selectedCardId === card.id;
            const isDragging = dragStateRef.current.draggedCardId === card.id;

            const centerIdx = (cardCount - 1) / 2;
            const offset = i - centerIdx;
            const rotation = offset * fanSpreadDegrees;
            const yOffset = Math.cos((offset / (cardCount / 2)) * (Math.PI / 3)) * fanHeightPx;

            return (
              <div
                key={card.id}
                className={`absolute transition-all ${isDragging ? 'opacity-50' : ''}`}
                style={{
                  bottom: `${yOffset}px`,
                  left: '50%',
                  transform: `translateX(-50%) rotate(${rotation}deg) ${isSelected ? 'translateY(-20px)' : ''}`,
                  transformOrigin: 'bottom center',
                  zIndex: isSelected ? 100 : i,
                }}
                onMouseDown={(e) => handleDragStart(card.id, e)}
                onTouchStart={(e) => handleTouchStart(card.id, e)}
              >
                <CardComponent
                  card={card}
                  playable={isPlayable && gameState.phase === GamePhase.TRICK_PLAY}
                  selected={isSelected}
                  useCustomImages={useCustomImages}
                  imageSrc={useCustomImages ? `/cards/${card.suit}/${card.rank}.png` : undefined}
                  onClick={() => {
                    if (gameState.phase === GamePhase.TRICK_PLAY && !dragStateRef.current.isDragging) {
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
      {selectedCard && gameState.phase === GamePhase.TRICK_PLAY && isMyTurn && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
          <div className="bg-[#16213e]/95 border border-yellow-500 rounded-xl p-3 shadow-xl backdrop-blur-sm flex items-center gap-3">
            <CardComponent
              card={selectedCard}
              small
              useCustomImages={useCustomImages}
              imageSrc={useCustomImages ? `/cards/${selectedCard.suit}/${selectedCard.rank}.png` : undefined}
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  onPlayCard(selectedCard.id);
                  if (soundEnabled) playCardPlaySound();
                  setSelectedCardId(null);
                }}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors"
              >
                שחק
              </button>
              <button
                onClick={() => setSelectedCardId(null)}
                className="px-5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg text-xs transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My name */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
        {gameState.players[gameState.mySeat] && (
          <div className={`relative px-3 py-1 rounded-lg text-sm font-medium border-2 ${
            isMyTurn ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : 'bg-[#1a2a4e]/80 border-blue-500 text-gray-300'
          }`}>
            {gameState.players[gameState.mySeat]!.avatar && <span className="mr-1">{gameState.players[gameState.mySeat]!.avatar}</span>}
            {gameState.players[gameState.mySeat]!.name} (אתה)
            {isMyTurn && renderTurnTimer()}
          </div>
        )}
      </div>

      {/* Action panels */}
      {renderBiddingPanel()}
      {renderTrumpPanel()}
      {renderSingingPanel()}
      {renderRoundScoring()}
      {renderGameOver()}

      {/* Scoreboard overlay */}
      {showScoreboard && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowScoreboard(false)}>
          <div onClick={e => e.stopPropagation()}>
            <Scoreboard gameState={gameState} onClose={() => setShowScoreboard(false)} />
          </div>
        </div>
      )}

      {/* Debug toggle */}
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
          <div>handOrder: [{handOrder.join(', ')}]</div>
          <div>connected: {String(connected)}</div>
          <div>reconnecting: {String(reconnecting)}</div>
        </div>
      )}
    </div>
  );
};
