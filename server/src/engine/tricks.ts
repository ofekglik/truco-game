import { Card, GameState, SeatPosition, Suit, CARD_POWER, SEAT_ORDER } from './types.js';

/**
 * Get valid cards a player can play given the current trick state.
 * Rules:
 * 1. Must follow suit if possible (חובת סדרה)
 * 2. Must over-beat with higher card of lead suit if possible (חובת עלייה)
 * 3. If void in lead suit, MUST play trump (חובת חיתוך)
 * 4. If trump was already played and can't beat it, not required to play trump
 */
export function getValidPlays(hand: Card[], currentTrick: { cards: { card: Card; seat: SeatPosition }[] }, trumpSuit: Suit | null): Card[] {
  // First card of trick - can play anything
  if (currentTrick.cards.length === 0) {
    return [...hand];
  }
  
  const leadSuit = currentTrick.cards[0].card.suit;
  const cardsOfLeadSuit = hand.filter(c => c.suit === leadSuit);
  
  if (cardsOfLeadSuit.length > 0) {
    // Rule 1: Must follow suit
    // Rule 2: Must over-beat if possible
    const highestLeadPower = getHighestPowerInTrick(currentTrick.cards, leadSuit);
    const higherCards = cardsOfLeadSuit.filter(c => CARD_POWER[c.rank] > highestLeadPower);
    
    if (higherCards.length > 0) {
      return higherCards; // Must play a higher card of lead suit
    }
    return cardsOfLeadSuit; // Must follow suit even if can't beat
  }
  
  // Void in lead suit
  if (trumpSuit) {
    const trumpCards = hand.filter(c => c.suit === trumpSuit);
    
    if (trumpCards.length > 0) {
      // Rule 3: Must play trump if void in lead suit
      // Rule 4: But if trump already played and can't beat it, free play
      const trumpInTrick = currentTrick.cards.filter(c => c.card.suit === trumpSuit);
      
      if (trumpInTrick.length > 0) {
        const highestTrumpPower = getHighestPowerInTrick(currentTrick.cards, trumpSuit);
        const higherTrumps = trumpCards.filter(c => CARD_POWER[c.rank] > highestTrumpPower);
        
        if (higherTrumps.length > 0) {
          return higherTrumps; // Must beat with higher trump
        }
        // Can't beat existing trump - free play (Rule 4)
        return [...hand];
      }
      
      return trumpCards; // Must play trump (Rule 3)
    }
  }
  
  // No lead suit, no trump - free play
  return [...hand];
}

function getHighestPowerInTrick(cards: { card: Card; seat: SeatPosition }[], suit: Suit): number {
  let max = -1;
  for (const tc of cards) {
    if (tc.card.suit === suit && CARD_POWER[tc.card.rank] > max) {
      max = CARD_POWER[tc.card.rank];
    }
  }
  return max;
}

export function getNextSeat(seat: SeatPosition): SeatPosition {
  const idx = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(idx + 1) % 4];
}
