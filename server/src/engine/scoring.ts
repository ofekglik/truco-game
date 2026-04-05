import { Card, CARD_POINTS, Trick, TrickCard, CARD_POWER, Suit, Rank } from './types.js';

export function getCardPoints(card: Card): number {
  return CARD_POINTS[card.rank];
}

export function getCardPower(card: Card): number {
  return CARD_POWER[card.rank];
}

export function calculateTrickPoints(trick: Trick): number {
  return trick.cards.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
}

export function determineTrickWinner(trick: Trick, trumpSuit: Suit | null): TrickCard {
  if (!trick.cards || trick.cards.length === 0) {
    // Safety: should never happen, but prevents crash
    return { card: { id: 'unknown', suit: 'espadas' as Suit, rank: 2 as Rank }, seat: 'south' as any };
  }
  const leadSuit = trick.cards[0].card.suit;
  let winner = trick.cards[0];
  
  for (let i = 1; i < trick.cards.length; i++) {
    const challenger = trick.cards[i];
    if (beats(challenger.card, winner.card, leadSuit, trumpSuit)) {
      winner = challenger;
    }
  }
  return winner;
}

function beats(challenger: Card, current: Card, leadSuit: Suit, trumpSuit: Suit | null): boolean {
  const challengerIsTrump = trumpSuit && challenger.suit === trumpSuit;
  const currentIsTrump = trumpSuit && current.suit === trumpSuit;
  
  // Trump beats non-trump
  if (challengerIsTrump && !currentIsTrump) return true;
  if (!challengerIsTrump && currentIsTrump) return false;
  
  // Both trump - compare power
  if (challengerIsTrump && currentIsTrump) {
    return getCardPower(challenger) > getCardPower(current);
  }
  
  // Neither is trump - only lead suit matters
  if (challenger.suit === leadSuit && current.suit !== leadSuit) return true;
  if (challenger.suit !== leadSuit && current.suit === leadSuit) return false;
  
  // Same suit - compare power
  if (challenger.suit === current.suit) {
    return getCardPower(challenger) > getCardPower(current);
  }
  
  // Different non-lead suits - current winner holds
  return false;
}

export function calculateTeamTrickPoints(tricks: Trick[], trumpSuit: Suit | null, teamSeats: string[]): number {
  let total = 0;
  for (let i = 0; i < tricks.length; i++) {
    const winner = determineTrickWinner(tricks[i], trumpSuit);
    if (teamSeats.includes(winner.seat)) {
      let points = calculateTrickPoints(tricks[i]);
      // Last trick bonus
      if (i === tricks.length - 1) {
        points += 10;
      }
      total += points;
    }
  }
  return total;
}
