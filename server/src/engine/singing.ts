import { Card, Suit, SeatPosition, SEAT_TEAM, TeamId, Cante } from './types.js';

/**
 * Check if a player can sing a cante for a given suit.
 * A cante requires holding both the 11 (Horse) and 12 (King) of that suit.
 */
export function canSingCante(hand: Card[], suit: Suit): boolean {
  const hasHorse = hand.some(c => c.suit === suit && c.rank === 11);
  const hasKing = hand.some(c => c.suit === suit && c.rank === 12);
  return hasHorse && hasKing;
}

/**
 * Get all singable cantes from a hand, considering bid level and trump suit.
 * At bid 80: no trump singing, regular cante only
 * At bid 90: trump singing allowed, max 40 pts total from singing
 * At bid 100+: all singing allowed, no cap
 */
export function getSingableSuits(
  hand: Card[],
  trumpSuit: Suit,
  bidAmount: number,
  existingCantes: Cante[],
  playerSeat: SeatPosition,
  biddingTeam: TeamId
): Suit[] {
  // Only bidding team can sing
  if (SEAT_TEAM[playerSeat] !== biddingTeam) return [];
  
  const singable: Suit[] = [];
  
  // Calculate existing singing points for the team
  const existingPoints = existingCantes
    .filter(c => SEAT_TEAM[c.seat] === biddingTeam)
    .reduce((sum, c) => sum + c.points, 0);
  
  for (const suit of Object.values(Suit)) {
    if (!canSingCante(hand, suit)) continue;
    
    // Already sang this suit?
    if (existingCantes.some(c => c.seat === playerSeat && c.suit === suit)) continue;
    
    const isTrump = suit === trumpSuit;
    const cantePoints = isTrump ? 40 : 20;
    
    if (bidAmount < 80) continue; // No singing below 80
    
    if (bidAmount === 80) {
      // Only regular cantes, no trump, max 20 pts total (1 cante)
      if (isTrump) continue;
      if (existingPoints + cantePoints > 20) continue;
      singable.push(suit);
    } else if (bidAmount >= 90 && bidAmount < 100) {
      // Max 40 pts from singing
      if (existingPoints + cantePoints > 40) continue;
      singable.push(suit);
    } else {
      // 100+: no cap
      singable.push(suit);
    }
  }
  
  return singable;
}
