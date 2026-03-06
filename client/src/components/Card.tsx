import React from 'react';
import { Card as CardType, SUIT_COLORS, SUIT_SYMBOLS, RANK_NAMES_HE, Suit } from '../types';

interface CardProps {
  card: CardType;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  large?: boolean;
  useCustomImages?: boolean;
  imageSrc?: string;
  isBiddingPhase?: boolean;
}

const SUIT_PIPS: Record<Suit, string> = {
  [Suit.OROS]: '●',
  [Suit.COPAS]: '♥',
  [Suit.ESPADAS]: '♠',
  [Suit.BASTOS]: '♣',
};

export const CardComponent: React.FC<CardProps> = ({ card, playable, selected, onClick, small, large, useCustomImages, imageSrc, isBiddingPhase }) => {
  const [imageError, setImageError] = React.useState(false);

  // If custom image is available and loads successfully, render as image
  if (useCustomImages && imageSrc && !imageError) {
    return (
      <div
        onClick={onClick}
        className={`
          relative rounded-lg border-2 bg-white text-black shadow-lg
          transition-all duration-200 select-none overflow-hidden
          ${small ? 'w-14 h-20' : large ? 'w-28 h-40' : 'w-20 h-28'}
          ${playable ? 'cursor-pointer hover:-translate-y-3 hover:shadow-xl border-yellow-400' : 'border-gray-300'}
          ${selected ? '-translate-y-4 ring-2 ring-yellow-400' : ''}
          ${!playable && !small && !isBiddingPhase ? 'opacity-90' : ''}
        `}
      >
        <img
          src={imageSrc}
          alt={`${card.rank}${card.suit}`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Fall back to CSS-rendered card
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
        relative rounded-lg border-2 bg-white text-black shadow-lg
        transition-all duration-200 select-none
        ${small ? 'w-14 h-20 text-xs' : large ? 'w-28 h-40 text-base' : 'w-20 h-28 text-sm'}
        ${playable ? 'cursor-pointer hover:-translate-y-3 hover:shadow-xl border-yellow-400' : 'border-gray-300'}
        ${selected ? '-translate-y-4 ring-2 ring-yellow-400' : ''}
        ${!playable && !small && !isBiddingPhase ? 'opacity-90' : ''}
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
          className="w-full h-full object-cover"
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
