import React, { useState, useEffect } from 'react';
import { Card as CardType, SUIT_COLORS, SUIT_SYMBOLS, RANK_NAMES_HE, Suit } from '../types';

interface CardProps {
  card: CardType;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  large?: boolean;
  isBiddingPhase?: boolean;
}

const SUIT_PIPS: Record<Suit, string> = {
  [Suit.OROS]: '●',
  [Suit.COPAS]: '♥',
  [Suit.ESPADAS]: '♠',
  [Suit.BASTOS]: '♣',
};

// Cache which card images exist to avoid re-probing on every render
const imageCache: Record<string, 'loading' | 'ok' | 'fail'> = {};

function getCardImagePath(suit: string, rank: number): string {
  return `/cards/${suit}/${rank}.png`;
}

export const CardComponent: React.FC<CardProps> = ({ card, playable, selected, onClick, small, large, isBiddingPhase }) => {
  const imgPath = getCardImagePath(card.suit, card.rank);
  const cached = imageCache[imgPath];
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'fail'>(cached || 'loading');

  useEffect(() => {
    // If already resolved in cache, use it
    if (cached === 'ok' || cached === 'fail') {
      setImgState(cached);
      return;
    }
    // Probe image existence
    const img = new Image();
    img.onload = () => { imageCache[imgPath] = 'ok'; setImgState('ok'); };
    img.onerror = () => { imageCache[imgPath] = 'fail'; setImgState('fail'); };
    imageCache[imgPath] = 'loading';
    img.src = imgPath;
  }, [imgPath, cached]);

  const containerClasses = `
    relative rounded-lg shadow-lg transition-all duration-200 select-none overflow-hidden
    ${small ? 'w-16 h-[5.5rem]' : large ? 'w-32 h-[11.5rem]' : 'w-[5.5rem] h-[8rem]'}
    ${playable ? 'cursor-pointer hover:-translate-y-3 hover:shadow-xl' : ''}
    ${selected ? '-translate-y-4 ring-2 ring-yellow-400' : ''}
    ${!playable && !small && !isBiddingPhase ? 'opacity-90' : ''}
  `;

  // Image card — the image IS the card (includes numbers, borders, art)
  if (imgState === 'ok') {
    return (
      <div onClick={onClick} className={containerClasses}>
        <img
          src={imgPath}
          alt={`${card.rank} ${card.suit}`}
          className="w-full h-full object-fill"
          draggable={false}
        />
        {/* Playable highlight overlay */}
        {playable && (
          <div className="absolute inset-0 rounded-lg ring-2 ring-yellow-400 pointer-events-none" />
        )}
      </div>
    );
  }

  // Fallback: CSS-rendered card
  const color = SUIT_COLORS[card.suit];
  const pip = SUIT_PIPS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];
  const rankName = RANK_NAMES_HE[card.rank];

  const isSpecial = card.rank >= 10;
  const specialNames: Record<number, string> = { 10: 'J', 11: 'C', 12: 'K' };
  const displayRank = isSpecial ? specialNames[card.rank] || card.rank : card.rank;

  return (
    <div
      onClick={onClick}
      className={`
        ${containerClasses}
        border-2 bg-white text-black
        ${small ? 'text-xs' : large ? 'text-base' : 'text-sm'}
        ${playable ? 'border-yellow-400' : 'border-gray-300'}
      `}
      style={{ fontFamily: 'serif' }}
    >
      {/* Top left */}
      <div className={`absolute ${small ? 'top-0.5 right-1' : large ? 'top-1.5 right-2' : 'top-1 right-1.5'} flex flex-col items-center leading-none`}>
        <span className="font-bold" style={{ color, fontSize: small ? '0.7rem' : large ? '1.2rem' : '0.9rem' }}>{displayRank}</span>
        <span style={{ color, fontSize: small ? '0.6rem' : large ? '1rem' : '0.75rem' }}>{pip}</span>
      </div>

      {/* Center */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isSpecial ? (
          <div className="text-center">
            <div style={{ fontSize: small ? '1.2rem' : large ? '2.5rem' : '1.8rem' }}>{symbol}</div>
            <div className={`text-gray-500 ${large ? 'text-xs' : 'text-[0.5rem]'}`}>{rankName}</div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-0.5 p-1" style={{ maxWidth: small ? '2.5rem' : large ? '5rem' : '3.5rem' }}>
            {Array.from({ length: card.rank }, (_, i) => (
              <span key={i} style={{ color, fontSize: small ? '0.55rem' : large ? '1rem' : '0.7rem' }}>{pip}</span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom right */}
      <div className={`absolute ${small ? 'bottom-0.5 left-1' : large ? 'bottom-1.5 left-2' : 'bottom-1 left-1.5'} flex flex-col items-center leading-none rotate-180`}>
        <span className="font-bold" style={{ color, fontSize: small ? '0.7rem' : large ? '1.2rem' : '0.9rem' }}>{displayRank}</span>
        <span style={{ color, fontSize: small ? '0.6rem' : large ? '1rem' : '0.75rem' }}>{pip}</span>
      </div>
    </div>
  );
};

interface CardBackProps {
  small?: boolean;
  backImageSrc?: string;
}

export const CardBack: React.FC<CardBackProps> = ({ small, backImageSrc }) => {
  const [imageError, setImageError] = React.useState(false);

  // If custom back image is available, render as image
  if (backImageSrc && !imageError) {
    return (
      <div
        className={`
          rounded-lg border-2 border-gray-600 shadow-lg
          ${small ? 'w-10 h-14' : 'w-14 h-20'}
          overflow-hidden
        `}
      >
        <img
          src={backImageSrc}
          alt="card-back"
          className="w-full h-full object-fill"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Fall back to CSS-rendered back
  return (
    <div className={`
      rounded-lg border-2 border-gray-600 shadow-lg
      ${small ? 'w-10 h-14' : 'w-14 h-20'}
      bg-gradient-to-br from-red-900 to-red-800
      flex items-center justify-center
    `}>
      <div className={`
        border border-yellow-600 rounded
        ${small ? 'w-6 h-8' : 'w-8 h-12'}
        bg-gradient-to-br from-red-800 to-red-700
        flex items-center justify-center
      `}>
        <span className="text-yellow-600 text-xs">✦</span>
      </div>
    </div>
  );
};
