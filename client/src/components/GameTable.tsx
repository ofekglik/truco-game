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
  const [showMenu, setShowMenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('soundEnabled');
    return saved === null ? true : saved === 'true';
  });
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [trickToast, setTrickToast] = useState<{ winner: string; team1: number; team2: number } | null>(null);
  const [lastCompletedTricksLength, setLastCompletedTricksLength] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [showScorePill, setShowScorePill] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const handScrollRef = useRef<HTMLDivElement>(null);

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
  const isLandscape = windowHeight < windowWidth;

  // Window resize listener — tracks both width and height for orientation changes
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    // Also listen to orientationchange for mobile Safari
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 100));
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', () => setTimeout(handleResize, 100));
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  // Reset panel collapsed state when phase changes (new popup = expand it)
  useEffect(() => {
    setPanelCollapsed(false);
  }, [gameState.phase]);

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
    setDraggingCardId(cardId);
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
    setDraggingCardId(null);
  }, []);

  const handleTouchStart = useCallback((cardId: string, e: React.TouchEvent) => {
    dragStateRef.current.draggedCardId = cardId;
    dragStateRef.current.touchStartTime = Date.now();
    dragStateRef.current.startX = e.touches[0].clientX;
    dragStateRef.current.startY = e.touches[0].clientY;
    setDraggingCardId(cardId);
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
    const teamColor = team === 'team1' ? '#3B82F6' : '#DC2626';
    const teamBg = team === 'team1' ? 'from-blue-900/50 to-blue-800/50' : 'from-red-900/50 to-red-800/50';

    const posClasses = isMobile ? {
      left: 'absolute left-1 top-1/2 -translate-y-1/2',
      top: 'absolute top-1 left-1/2 -translate-x-1/2',
      right: 'absolute right-1 top-1/2 -translate-y-1/2',
    } : {
      left: 'absolute left-2 top-1/2 -translate-y-1/2',
      top: 'absolute top-2 left-1/2 -translate-x-1/2',
      right: 'absolute right-2 top-1/2 -translate-y-1/2',
    };

    return (
      <div key={seat} className={`${posClasses[pos]} z-20`}>
        {/* Poker HUD Badge — compact on mobile */}
        <div className={`relative backdrop-blur-sm border-2 transition-all ${
          isMobile ? 'rounded-lg px-2 py-1.5' : 'rounded-xl px-4 py-3'
        } ${
          isCurrentTurn
            ? `bg-yellow-500/30 border-yellow-400 shadow-lg shadow-yellow-400/50 animate-turnPulse`
            : `bg-gradient-to-br ${teamBg} border-gray-600`
        } ${!player.connected ? 'opacity-50' : ''}`}>
          {/* Team color indicator bar */}
          <div className={`absolute top-0 left-0 right-0 h-1 ${isMobile ? 'rounded-t-[5px]' : 'rounded-t-[9px]'}`} style={{ backgroundColor: teamColor }} />

          {/* Player info */}
          <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2 min-w-max'}`}>
            {player.avatar && (
              <span className={isMobile ? 'text-base' : 'text-2xl'}>{player.avatar}</span>
            )}
            <div className="flex flex-col">
              <div className={`font-bold text-white leading-tight ${isMobile ? 'text-[10px] max-w-[60px] truncate' : 'text-sm'}`}>
                {player.name}
                {!player.connected && <span className={`text-red-400 ml-1 ${isMobile ? 'text-[8px]' : 'text-xs'}`}>(מנותק)</span>}
              </div>
              {/* Card count — dots on desktop, number on mobile */}
              {isMobile ? (
                <div className="text-[9px] text-gray-400">{player.cardCount} קלפים</div>
              ) : (
                <div className="flex gap-1 mt-1">
                  {Array.from({ length: Math.min(10, player.cardCount) }, (_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: teamColor }}
                    />
                  ))}
                  {player.cardCount > 10 && (
                    <span className="text-xs text-gray-300 ml-1">+{player.cardCount - 10}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {isCurrentTurn && !isMobile && renderTurnTimer()}
        </div>
      </div>
    );
  };

  const renderTrickCards = () => {
    const cards = gameState.currentTrick.cards;
    // Position each card near the player who played it (directional layout)
    const offset = isMobile ? 45 : 80;

    // Map each seat's relative position to x,y offsets from center
    const positionMap: Record<string, { x: number; y: number }> = {
      bottom: { x: 0, y: offset },
      top: { x: 0, y: -offset },
      left: { x: -offset, y: 0 },
      right: { x: offset, y: 0 },
    };

    return cards.map((tc, i) => {
      const relPos = getRelativePosition(gameState.mySeat, tc.seat);
      const pos = positionMap[relPos] || { x: 0, y: 0 };

      return (
        <div
          key={i}
          className="absolute z-10 animate-slideIn"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
            animationDelay: `${i * 100}ms`,
          }}
        >
          <CardComponent
            card={tc.card}
            large={!isMobile}
          />
        </div>
      );
    });
  };

  const renderBiddingPanel = () => {
    if (gameState.phase !== GamePhase.BIDDING || !isMyTurn) return null;

    const minBid = validActions.minBid;
    // All possible bid values from 70 to 220 in steps of 10
    const allBids = Array.from({ length: 16 }, (_, i) => 70 + i * 10);

    if (isMobile) {
      // Mobile: collapsible bottom sheet
      if (panelCollapsed) {
        // Collapsed: compact bar with current bid info + expand/pass buttons
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50" dir="rtl">
            <div className="bg-[#16213e]/95 backdrop-blur-md border-t border-yellow-500/40 px-3 py-2 flex items-center gap-2">
              <button
                onClick={() => setPanelCollapsed(false)}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-sm active:scale-95"
              >
                ▲ הציע {gameState.currentBidAmount > 0 ? `(נוכחי: ${gameState.currentBidAmount})` : ''}
              </button>
              <button onClick={onPassBid}
                className="px-4 py-2.5 bg-gray-700/80 hover:bg-gray-600 text-white font-bold rounded-xl text-sm active:scale-95">
                עבור ❌
              </button>
            </div>
          </div>
        );
      }

      // Expanded: full bid grid
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slideUpBottom">
          <div className="bg-[#16213e] rounded-t-2xl shadow-2xl border-t border-[#4a5a7e]/60 overflow-hidden">

            {/* Collapse handle */}
            <button
              onClick={() => setPanelCollapsed(true)}
              className="w-full flex justify-center pt-2 pb-1"
            >
              <div className="w-10 h-1 bg-gray-500 rounded-full" />
            </button>

            {/* Header: current bid status + minimize button */}
            <div className="px-4 py-1.5 flex items-center justify-between" dir="rtl">
              <span className="text-white text-sm font-bold">תורך להציע</span>
              <div className="flex items-center gap-2">
                {gameState.currentBidAmount > 0 && (
                  <span className="text-yellow-400 text-xs font-bold">
                    נוכחי: {gameState.currentBidAmount}
                  </span>
                )}
                <button
                  onClick={() => setPanelCollapsed(true)}
                  className="px-2 py-1 bg-gray-700/60 rounded-lg text-gray-400 text-xs"
                >
                  ▼ הסתר
                </button>
              </div>
            </div>

            {/* Bid grid — 4 cols, compact */}
            <div className="px-3 pb-2">
              <div className="grid grid-cols-4 gap-1.5">
                {allBids.map(val => {
                  const isDisabled = val < minBid;
                  return (
                    <button
                      key={val}
                      onClick={() => !isDisabled && onPlaceBid(val)}
                      disabled={isDisabled}
                      className={`py-2.5 rounded-xl font-bold text-base transition-all ${
                        isDisabled
                          ? 'bg-gray-800/40 text-gray-600 cursor-not-allowed'
                          : 'bg-[#2a3a5e] hover:bg-yellow-500 hover:text-black text-white active:scale-95 active:bg-yellow-500 active:text-black'
                      }`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom actions: Pass + Capo */}
            <div className="px-3 pb-4 pt-1 flex gap-2">
              <button onClick={onPassBid}
                className="flex-1 py-3 bg-gray-700/80 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors text-base active:scale-95">
                עבור ❌
              </button>
              <button onClick={() => onPlaceBid(230)}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors text-base active:scale-95">
                קאפו! 💥
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Desktop: floating panel above hand
    return (
      <div className="absolute left-1/2 -translate-x-1/2 z-30 animate-slideUpBottom"
        style={{ bottom: '240px', width: '420px' }}>
        <div className="bg-[#16213e]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#4a5a7e]/60 overflow-hidden">

          {/* Header: current bid status */}
          <div className="px-4 py-2.5 bg-black/30 border-b border-[#4a5a7e]/40 flex items-center justify-between" dir="rtl">
            <span className="text-gray-400 text-xs font-medium">תורך להציע</span>
            {gameState.currentBidAmount > 0 ? (
              <span className="text-yellow-400 text-sm font-bold">
                נוכחי: {gameState.currentBidAmount} ({gameState.players[gameState.currentBidWinner!]?.name})
              </span>
            ) : (
              <span className="text-gray-500 text-xs">אין הצעות עדיין</span>
            )}
          </div>

          {/* Bid grid */}
          <div className="p-3">
            <div className="grid grid-cols-5 gap-1.5">
              {allBids.map(val => {
                const isDisabled = val < minBid;
                return (
                  <button
                    key={val}
                    onClick={() => !isDisabled && onPlaceBid(val)}
                    disabled={isDisabled}
                    className={`py-2 rounded-lg font-bold text-sm transition-all ${
                      isDisabled
                        ? 'bg-gray-800/40 text-gray-600 cursor-not-allowed'
                        : 'bg-[#2a3a5e] hover:bg-yellow-500 hover:text-black text-white active:scale-95'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom actions: Pass + Capo */}
          <div className="px-3 pb-3 flex gap-2">
            <button onClick={onPassBid}
              className="flex-1 py-2.5 bg-gray-700/80 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors text-sm active:scale-95">
              עבור ❌
            </button>
            <button onClick={() => onPlaceBid(230)}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors text-sm active:scale-95">
              קאפו! 💥
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTrumpPanel = () => {
    if (gameState.phase !== GamePhase.TRUMP_DECLARATION || !validActions.canDeclareTrump) return null;

    if (isMobile) {
      // Mobile: collapsible bottom sheet
      if (panelCollapsed) {
        // Collapsed: compact bar with expand button
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50" dir="rtl">
            <div className="bg-[#16213e]/95 backdrop-blur-md border-t border-yellow-500/40 px-3 py-2">
              <button
                onClick={() => setPanelCollapsed(false)}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-sm active:scale-95"
              >
                ▲ בחר אטו
              </button>
            </div>
          </div>
        );
      }

      // Expanded: full suit grid as bottom sheet
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slideUpBottom">
          <div className="bg-[#16213e] rounded-t-2xl shadow-2xl border-t border-[#4a5a7e]/60 overflow-hidden">
            {/* Collapse handle */}
            <button
              onClick={() => setPanelCollapsed(true)}
              className="w-full flex justify-center pt-2 pb-1"
            >
              <div className="w-10 h-1 bg-gray-500 rounded-full" />
            </button>

            {/* Header */}
            <div className="px-4 py-1.5 flex items-center justify-between" dir="rtl">
              <span className="text-white text-sm font-bold">בחר אטו (חליפה שולטת)</span>
              <button
                onClick={() => setPanelCollapsed(true)}
                className="px-2 py-1 bg-gray-700/60 rounded-lg text-gray-400 text-xs"
              >
                ▼ הסתר
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 px-4 pb-5">
              {Object.values(Suit).map(suit => (
                <button
                  key={suit}
                  onClick={() => {
                    onDeclareTrump(suit);
                    setPanelCollapsed(true);
                  }}
                  className="py-4 px-4 rounded-xl font-bold text-lg transition-all active:scale-95 border-2"
                  style={{
                    backgroundColor: SUIT_COLORS[suit] + '33',
                    borderColor: SUIT_COLORS[suit],
                    color: SUIT_COLORS[suit],
                  }}
                >
                  {SUIT_SYMBOLS[suit]} {SUIT_NAMES_HE[suit]}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Desktop: centered floating panel
    return (
      <>
        <div className="absolute inset-0 z-29 bg-black/40 backdrop-blur-sm animate-fadeIn" />
        <div className="absolute left-1/2 -translate-x-1/2 z-30 animate-slideUpBottom"
          style={{ bottom: '220px', width: '340px' }}>
          <div className="bg-[#16213e] rounded-2xl p-4 shadow-2xl border border-[#2a3a5e]">
            <p className="text-center text-yellow-400 font-bold mb-4 text-base">בחר אטו (חליפה שולטת)</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.values(Suit).map(suit => (
                <button
                  key={suit}
                  onClick={() => onDeclareTrump(suit)}
                  className="py-3 px-4 rounded-xl font-bold text-base transition-all hover:scale-105 border-2"
                  style={{
                    backgroundColor: SUIT_COLORS[suit] + '33',
                    borderColor: SUIT_COLORS[suit],
                    color: SUIT_COLORS[suit],
                  }}
                >
                  {SUIT_SYMBOLS[suit]} {SUIT_NAMES_HE[suit]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderSingingPanel = () => {
    const isBiddingTeam = gameState.biddingTeam && SEAT_TEAM[gameState.mySeat] === gameState.biddingTeam;
    if (gameState.phase !== GamePhase.SINGING || !isBiddingTeam) return null;

    const singingContent = (
      <>
        <p className="text-center text-yellow-400 font-bold mb-4 text-lg">שירה</p>
        {validActions.singableCantes.length > 0 && (
          <div className="space-y-2.5 mb-4">
            {validActions.singableCantes.map(suit => (
              <button
                key={suit}
                onClick={() => onSingCante(suit)}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-base transition-all active:scale-95 border-2"
                style={{
                  backgroundColor: SUIT_COLORS[suit] + '33',
                  borderColor: SUIT_COLORS[suit],
                  color: SUIT_COLORS[suit],
                }}
              >
                שר {SUIT_SYMBOLS[suit]} {SUIT_NAMES_HE[suit]} ({suit === gameState.trumpSuit ? '40' : '20'} נק׳)
              </button>
            ))}
          </div>
        )}
        {validActions.singableCantes.length === 0 && (
          <p className="text-center text-gray-400 text-sm mb-4">אין שירה אפשרית</p>
        )}
        <button onClick={onDoneSinging}
          className="w-full py-3.5 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors text-base active:scale-95">
          סיים שירה
        </button>
      </>
    );

    if (isMobile) {
      // Mobile: collapsible bottom sheet
      if (panelCollapsed) {
        // Collapsed: compact bar with expand button
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50" dir="rtl">
            <div className="bg-[#16213e]/95 backdrop-blur-md border-t border-yellow-500/40 px-3 py-2">
              <button
                onClick={() => setPanelCollapsed(false)}
                className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-sm active:scale-95"
              >
                ▲ שירה
              </button>
            </div>
          </div>
        );
      }

      // Expanded: singing options as bottom sheet
      return (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slideUpBottom">
          <div className="bg-[#16213e] rounded-t-2xl shadow-2xl border-t border-[#4a5a7e]/60 overflow-hidden">
            {/* Collapse handle */}
            <button
              onClick={() => setPanelCollapsed(true)}
              className="w-full flex justify-center pt-2 pb-1"
            >
              <div className="w-10 h-1 bg-gray-500 rounded-full" />
            </button>

            {/* Header */}
            <div className="px-4 py-1.5 flex items-center justify-between" dir="rtl">
              <span className="text-white text-sm font-bold">שירה</span>
              <button
                onClick={() => setPanelCollapsed(true)}
                className="px-2 py-1 bg-gray-700/60 rounded-lg text-gray-400 text-xs"
              >
                ▼ הסתר
              </button>
            </div>

            <div className="px-4 pb-5">
              {singingContent}
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="absolute inset-0 z-29 bg-black/50 backdrop-blur-sm animate-fadeIn" />
        <div className="absolute bottom-0 left-0 right-0 z-30 animate-slideUpBottom">
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1 bg-gray-500 rounded-full" />
          </div>
          <div className="bg-[#16213e] rounded-t-3xl p-6 shadow-2xl">
            {singingContent}
          </div>
        </div>
      </>
    );
  };

  const renderRoundScoring = () => {
    if (gameState.phase !== GamePhase.ROUND_SCORING) return null;
    const lastRound = gameState.roundHistory[gameState.roundHistory.length - 1];
    if (!lastRound) return null;

    const team1Won = lastRound.team1Total > lastRound.team2Total;
    const biddingFell = lastRound.biddingTeamFell;

    return (
      <div className={`${isMobile ? 'fixed' : 'absolute'} inset-0 z-40 bg-black/75 flex items-center justify-center backdrop-blur-md animate-fadeIn`}>
        <div className="bg-gradient-to-b from-[#1a2744] to-[#111b30] border border-[#3a4a6e] rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-slideUpBottom mx-4">
          {/* Header with emoji */}
          <div className="text-center mb-4">
            <div className="text-4xl mb-2 animate-countPulse">{biddingFell ? '💥' : '🎉'}</div>
            <h3 className="text-xl font-bold text-yellow-400">סיום סיבוב {gameState.roundNumber}</h3>
            {biddingFell && (
              <p className="text-red-400 text-sm font-bold mt-1 animate-fadeIn">הקבוצה המציעה נפלה!</p>
            )}
            {!biddingFell && lastRound.bidAmount && (
              <p className="text-green-400 text-sm mt-1 animate-fadeIn">הצעה של {lastRound.bidAmount} הצליחה!</p>
            )}
          </div>

          {/* Round scores */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`rounded-xl p-3 text-center border transition-all ${
              team1Won
                ? 'bg-blue-800/40 border-blue-400 shadow-lg shadow-blue-500/20'
                : 'bg-blue-900/20 border-blue-800/50'
            }`}>
              <p className="text-blue-400 text-xs font-medium mb-1">קבוצה A</p>
              <p className="text-2xl font-bold text-white animate-countPulse">{lastRound.team1Total}</p>
              <p className="text-[10px] text-gray-400 mt-1">לקיחות {lastRound.team1TrickPoints} • שירה {lastRound.team1SingingPoints}</p>
            </div>
            <div className={`rounded-xl p-3 text-center border transition-all ${
              !team1Won
                ? 'bg-red-800/40 border-red-400 shadow-lg shadow-red-500/20'
                : 'bg-red-900/20 border-red-800/50'
            }`}>
              <p className="text-red-400 text-xs font-medium mb-1">קבוצה B</p>
              <p className="text-2xl font-bold text-white animate-countPulse">{lastRound.team2Total}</p>
              <p className="text-[10px] text-gray-400 mt-1">לקיחות {lastRound.team2TrickPoints} • שירה {lastRound.team2SingingPoints}</p>
            </div>
          </div>

          {/* Cumulative + progress */}
          <div className="bg-black/30 rounded-xl p-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <div className="text-center flex-1">
                <p className="text-blue-400 text-[10px]">קבוצה A</p>
                <p className="text-lg font-bold text-white">{gameState.scores.team1}</p>
              </div>
              <div className="text-gray-500 text-xs px-2">ניקוד מצטבר</div>
              <div className="text-center flex-1">
                <p className="text-red-400 text-[10px]">קבוצה B</p>
                <p className="text-lg font-bold text-white">{gameState.scores.team2}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-blue-400 h-full transition-all duration-1000 animate-shimmer"
                  style={{ width: `${Math.min(100, (gameState.scores.team1 / gameState.targetScore) * 100)}%` }}
                />
              </div>
              <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all duration-1000 animate-shimmer"
                  style={{ width: `${Math.min(100, (gameState.scores.team2 / gameState.targetScore) * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-gray-500 text-[10px] text-center mt-1">יעד: {gameState.targetScore}</p>
          </div>

          <button onClick={onNextRound}
            className="w-full py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold rounded-xl text-lg transition-all shadow-lg animate-pulseGlow-gold">
            סיבוב הבא ▶
          </button>
        </div>
      </div>
    );
  };

  const renderGameOver = () => {
    if (gameState.phase !== GamePhase.GAME_OVER) return null;
    const team1Wins = gameState.scores.team1 >= gameState.targetScore;
    const winnerTeam = team1Wins ? 'קבוצה A' : 'קבוצה B';
    const winnerColor = team1Wins ? 'text-blue-400' : 'text-red-400';
    const winnerGlow = team1Wins ? 'shadow-blue-500/40' : 'shadow-red-500/40';

    return (
      <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center backdrop-blur-md p-4 animate-fadeIn">
        <div className="w-full max-w-sm animate-slideUpBottom">
          {/* Sparkle particles */}
          <div className="relative">
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-40 h-40 pointer-events-none">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="absolute animate-sparkle" style={{
                  left: `${20 + Math.random() * 60}%`,
                  top: `${10 + Math.random() * 60}%`,
                  animationDelay: `${i * 0.3}s`,
                  animationDuration: `${1.5 + Math.random()}s`,
                }}>
                  <span className="text-yellow-300 text-xs">✦</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trophy + winner */}
          <div className="text-center mb-5">
            <div className="text-7xl mb-3 animate-trophyBounce inline-block" style={{
              filter: 'drop-shadow(0 0 20px rgba(251, 191, 36, 0.6))',
            }}>🏆</div>
            <h2 className={`text-3xl font-bold ${winnerColor} animate-countPulse`} style={{
              textShadow: team1Wins ? '0 0 20px rgba(59,130,246,0.5)' : '0 0 20px rgba(239,68,68,0.5)',
            }}>
              {winnerTeam} ניצחה!
            </h2>
          </div>

          <div className={`bg-gradient-to-b from-[#1a2744] to-[#111b30] border border-[#3a4a6e] rounded-2xl p-5 shadow-2xl ${winnerGlow}`}>
            {/* Final scores */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`rounded-xl p-4 text-center border transition-all ${
                team1Wins
                  ? 'bg-blue-800/40 border-blue-400 shadow-lg shadow-blue-500/30 animate-shimmerBorder'
                  : 'bg-blue-900/20 border-blue-800/50'
              }`}>
                <p className="text-blue-400 text-xs font-medium mb-1">קבוצה A</p>
                <p className="text-3xl font-bold text-white animate-countPulse">{gameState.scores.team1}</p>
              </div>
              <div className={`rounded-xl p-4 text-center border transition-all ${
                !team1Wins
                  ? 'bg-red-800/40 border-red-400 shadow-lg shadow-red-500/30 animate-shimmerBorder'
                  : 'bg-red-900/20 border-red-800/50'
              }`}>
                <p className="text-red-400 text-xs font-medium mb-1">קבוצה B</p>
                <p className="text-3xl font-bold text-white animate-countPulse" style={{ animationDelay: '0.2s' }}>{gameState.scores.team2}</p>
              </div>
            </div>

            <p className="text-gray-500 text-xs text-center mb-3">יעד: {gameState.targetScore} נקודות</p>

            {/* Round history summary */}
            {gameState.roundHistory.length > 0 && (
              <div className="bg-black/30 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto">
                <p className="text-gray-400 text-xs font-medium mb-2">סיכום סיבובים:</p>
                {gameState.roundHistory.map((r, i) => (
                  <div key={i} className={`flex justify-between text-xs py-1 px-2 rounded ${
                    i % 2 === 0 ? 'bg-white/5' : ''
                  }`}>
                    <span className="text-gray-500">סיבוב {i + 1}</span>
                    <span>
                      <span className="text-blue-400 font-bold">{r.team1Total}</span>
                      <span className="text-gray-600 mx-1">-</span>
                      <span className="text-red-400 font-bold">{r.team2Total}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onNextRound}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-bold rounded-xl transition-all shadow-lg animate-pulseGlow-green"
              >
                🔄 שחק שוב (אותו חדר)
              </button>
              <button
                onClick={handleLeaveRoom}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors"
              >
                ← חזור ללובי
              </button>
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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const toggleFullscreen = () => {
    if (isIOS) {
      // iOS doesn't support Fullscreen API — show a tip instead
      alert('באייפון: לחץ על "שתף" ← "הוסף למסך הבית" כדי לשחק במסך מלא');
      return;
    }
    const doc = document as any;
    const el = document.documentElement as any;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el).catch(() => {});
    } else {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc).catch(() => {});
    }
  };

  // Calculate fan card layout
  const cardCount = sortedHand.length;
  const fanSpreadDegrees = 8;
  const fanHeightPx = 30;

  return (
    <div className="w-screen relative overflow-hidden bg-[#0d1b0e]" style={{ height: '100dvh' }}>
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
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slideInFromRight {
          animation: slideInFromRight 0.3s ease-out;
        }
        @keyframes slideUpBottom {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideUpBottom {
          animation: slideUpBottom 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes countPulse {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-countPulse {
          animation: countPulse 0.5s ease-out forwards;
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .animate-shimmer {
          background-size: 200% 100%;
          animation: shimmer 2s linear infinite;
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0) translateY(0); }
          50% { opacity: 1; transform: scale(1) translateY(-10px); }
        }
        .animate-sparkle {
          animation: sparkle 2s ease-in-out infinite;
        }
        @keyframes trophyBounce {
          0% { transform: scale(0) rotate(-10deg); }
          60% { transform: scale(1.3) rotate(5deg); }
          80% { transform: scale(0.95) rotate(-2deg); }
          100% { transform: scale(1) rotate(0); }
        }
        .animate-trophyBounce {
          animation: trophyBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes pulseGlowGreen {
          0%, 100% { box-shadow: 0 0 5px rgba(34,197,94,0.3); }
          50% { box-shadow: 0 0 20px rgba(34,197,94,0.6); }
        }
        .animate-pulseGlow-green {
          animation: pulseGlowGreen 2s ease-in-out infinite;
        }
        @keyframes pulseGlowGold {
          0%, 100% { box-shadow: 0 0 5px rgba(234,179,8,0.3); }
          50% { box-shadow: 0 0 20px rgba(234,179,8,0.6); }
        }
        .animate-pulseGlow-gold {
          animation: pulseGlowGold 2s ease-in-out infinite;
        }
        @keyframes shimmerBorder {
          0% { border-color: rgba(255,255,255,0.2); }
          50% { border-color: rgba(255,255,255,0.6); }
          100% { border-color: rgba(255,255,255,0.2); }
        }
        .animate-shimmerBorder {
          animation: shimmerBorder 2s ease-in-out infinite;
        }
        @keyframes turnPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(234,179,8,0.4), 0 0 0 0 rgba(234,179,8,0.3); }
          50% { box-shadow: 0 0 20px rgba(234,179,8,0.8), 0 0 30px 5px rgba(234,179,8,0.2); }
        }
        .animate-turnPulse {
          animation: turnPulse 1.5s ease-in-out infinite;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Landscape mode is now supported — no blocker */}

      {/* Table felt */}
      <div className={`absolute rounded-[2rem] bg-gradient-to-br from-[#1a5c2a] to-[#0f3d1a] shadow-inner ${
        isMobile
          ? 'left-2 right-2 top-2 border-[6px] border-[#3a2010]'
          : 'inset-8 rounded-[3rem] border-[12px] border-[#3a2010]'
      }`} style={isMobile ? { bottom: (isMobile && isLandscape) ? '130px' : '155px' } : undefined}>
        <div className={`absolute inset-1 border border-[#2a6a3a]/30 ${isMobile ? 'rounded-[1.5rem]' : 'rounded-[2.5rem]'}`} />

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
            className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMenu(false)}
          />
          <div className="fixed top-0 right-0 h-full w-64 bg-[#1a2a4e]/95 border-l border-blue-500/50 shadow-2xl z-[46] animate-slideInFromRight backdrop-blur-md">
            <div className="p-6 space-y-3 pt-16">
              <h3 className="text-xl font-bold text-yellow-400 mb-4">תפריט</h3>

              <button
                onClick={() => { setShowScorePill(true); setShowMenu(false); }}
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
                onClick={toggleFullscreen}
                className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors text-right"
              >
                📱 {document.fullscreenElement ? 'צא ממסך מלא' : 'מסך מלא'}
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
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

      {/* === Top HUD — compact on mobile === */}

      {isMobile ? (
        <>
          {/* Mobile top bar: trick counter + trump + score in one compact row */}
          <div className="absolute top-1 left-1 right-10 z-20 flex items-center gap-1.5 flex-wrap">
            {/* Trick counter */}
            <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-[10px]">
              <span className="text-gray-400">לקיחה </span>
              <span className="text-white font-bold">{gameState.trickNumber}/10</span>
              <span className="text-gray-500 mx-1">|</span>
              <span className="text-blue-400">{gameState.team1TricksWon}</span>
              <span className="text-gray-500">-</span>
              <span className="text-red-400">{gameState.team2TricksWon}</span>
            </div>

            {/* Trump badge inline */}
            {gameState.trumpSuit && (
              <div className="rounded-md px-2 py-1 backdrop-blur-sm border text-[10px]"
                style={{
                  backgroundColor: `${SUIT_COLORS[gameState.trumpSuit]}22`,
                  borderColor: SUIT_COLORS[gameState.trumpSuit],
                  color: SUIT_COLORS[gameState.trumpSuit],
                }}>
                <span className="font-bold">{SUIT_SYMBOLS[gameState.trumpSuit]} {SUIT_NAMES_HE[gameState.trumpSuit]}</span>
              </div>
            )}

            {/* Score pill */}
            <button onClick={() => setShowScorePill(!showScorePill)}
              className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1 text-[10px] font-bold border border-gray-700">
              <span className="text-blue-400">{gameState.scores.team1}</span>
              <span className="text-gray-500 mx-1">-</span>
              <span className="text-red-400">{gameState.scores.team2}</span>
            </button>

            {/* Singing indicators inline */}
            {gameState.cantes.map((c, i) => (
              <div key={i} className="bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-1 text-[9px]"
                style={{ color: SUIT_COLORS[c.suit] }}>
                {SUIT_SYMBOLS[c.suit]} {c.points}
              </div>
            ))}
          </div>

          {/* Mobile message bar — below top row */}
          <div className="absolute top-8 left-2 right-10 z-20">
            <div className={`px-3 py-1 rounded-md text-xs font-medium backdrop-blur-sm truncate ${
              isMyTurn ? 'bg-yellow-600/80 text-black' : 'bg-black/60 text-gray-200'
            }`}>
              {gameState.lastMessage}
              {isMyTurn && ' ◀ תורך!'}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Desktop: original layout */}
          <div className="absolute top-3 left-4 z-20 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm">
            <span className="text-gray-400">לקיחה: </span>
            <span className="text-white font-bold">{gameState.trickNumber}/10</span>
            <span className="text-gray-500 mx-2">|</span>
            <span className="text-blue-400">{gameState.team1TricksWon}</span>
            <span className="text-gray-500"> - </span>
            <span className="text-red-400">{gameState.team2TricksWon}</span>
          </div>

          {gameState.trumpSuit && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <div
                className="rounded-xl px-5 py-3 backdrop-blur-md border-2 shadow-lg transition-all"
                style={{
                  backgroundColor: `${SUIT_COLORS[gameState.trumpSuit]}22`,
                  borderColor: SUIT_COLORS[gameState.trumpSuit],
                  boxShadow: `0 0 20px ${SUIT_COLORS[gameState.trumpSuit]}88`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{SUIT_SYMBOLS[gameState.trumpSuit]}</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">אטו</span>
                    <span className="text-sm font-bold" style={{ color: SUIT_COLORS[gameState.trumpSuit] }}>
                      {SUIT_NAMES_HE[gameState.trumpSuit]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowScorePill(!showScorePill)}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-20 transition-all"
          >
            <div className="bg-gradient-to-r from-blue-900/80 to-red-900/80 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-bold border border-gray-600 hover:border-yellow-400 hover:shadow-lg hover:shadow-yellow-400/50">
              <span className="text-blue-400">🔵{gameState.scores.team1}</span>
              <span className="text-gray-500 mx-2">-</span>
              <span className="text-red-400">🔴{gameState.scores.team2}</span>
            </div>
          </button>

          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-20">
            <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm ${
              isMyTurn ? 'bg-yellow-600/80 text-black' : 'bg-black/60 text-gray-200'
            }`}>
              {gameState.lastMessage}
              {isMyTurn && ' ◀ תורך!'}
            </div>
          </div>

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
        </>
      )}

      {/* Score Pill Expanded */}
      {showScorePill && (
        <div className={`${isMobile ? 'fixed' : 'absolute'} inset-0 z-50 bg-black/50 flex items-center justify-center`} onClick={() => setShowScorePill(false)}>
          <div onClick={e => e.stopPropagation()}>
            <Scoreboard gameState={gameState} onClose={() => setShowScorePill(false)} />
          </div>
        </div>
      )}

      {/* My hand - Scrollable strip on mobile, Fan layout on desktop */}
      {isMobile ? (
        <div className="absolute bottom-1 left-0 right-0 z-20" style={{ height: windowHeight < windowWidth ? '120px' : '140px' }}>
          <div
            ref={handScrollRef}
            className="flex items-end gap-1 px-2 h-full overflow-x-auto hide-scrollbar"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {sortedHand.map((card, i) => {
              const isPlayable = validActions.playableCards.includes(card.id);
              const isSelected = selectedCardId === card.id;
              return (
                <div
                  key={card.id}
                  className="flex-shrink-0 transition-transform duration-150"
                  style={{
                    scrollSnapAlign: 'center',
                    transform: isSelected ? 'translateY(-16px)' : 'translateY(0)',
                    zIndex: isSelected ? 100 : i,
                  }}
                  onTouchStart={(e) => handleTouchStart(card.id, e)}
                >
                  <CardComponent
                    card={card}
                    playable={isPlayable && gameState.phase === GamePhase.TRICK_PLAY}
                    selected={isSelected}
                    large={false}
                    isBiddingPhase={gameState.phase === GamePhase.BIDDING}
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
      ) : (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 cursor-grab active:cursor-grabbing"
          style={{
            width: Math.max(300, cardCount * 80),
            height: 260,
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
              const isDragging = draggingCardId === card.id;

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
                    left: `calc(50% + ${offset * 62}px)`,
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
                    large={true}
                    isBiddingPhase={gameState.phase === GamePhase.BIDDING}
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
      )}

      {/* Card confirmation popup */}
      {selectedCard && gameState.phase === GamePhase.TRICK_PLAY && isMyTurn && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2" style={{ bottom: isMobile && windowHeight < windowWidth ? '140px' : '180px' }}>
          <div className="bg-[#16213e]/95 border border-yellow-500 rounded-xl p-3 shadow-xl backdrop-blur-sm flex items-center gap-3">
            <CardComponent
              card={selectedCard}
              small
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

      {/* My name - positioned at the table edge, above card hand */}
      <div className="absolute left-1/2 -translate-x-1/2 z-20"
        style={{ bottom: isMobile && windowHeight < windowWidth ? '130px' : isMobile ? '155px' : '255px' }}>
        {gameState.players[gameState.mySeat] && (
          <div className={`relative px-3 py-1 rounded-lg text-xs font-medium border ${
            isMyTurn ? 'bg-yellow-600/30 border-yellow-500 text-yellow-300' : 'bg-[#1a2a4e]/80 border-gray-600 text-gray-400'
          }`}>
            {gameState.players[gameState.mySeat]!.avatar && <span className="mr-1">{gameState.players[gameState.mySeat]!.avatar}</span>}
            {gameState.players[gameState.mySeat]!.name}
            {isMyTurn && renderTurnTimer()}
            {isMyTurn && (gameState.phase === GamePhase.TRICK_PLAY || gameState.phase === GamePhase.BIDDING) && (
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full ml-2 animate-pulse"></span>
            )}
          </div>
        )}
      </div>

      {/* Action panels */}
      {renderBiddingPanel()}
      {renderTrumpPanel()}
      {renderSingingPanel()}
      {renderRoundScoring()}
      {renderGameOver()}


    </div>
  );
};
