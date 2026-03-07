// ELO Rating Calculation
// K-factor: 32 (standard for competitive games)
// Default rating: 1000

const K = 32;
const DEFAULT_RATING = 1000;

/**
 * Calculate expected score (probability of winning) for a player
 */
function expectedScore(myElo: number, oppElo: number): number {
  return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
}

/**
 * Calculate ELO change for a single player
 * @param myElo - Player's current ELO rating
 * @param oppAvgElo - Average ELO of the opposing team
 * @param won - Whether the player's team won
 * @returns Integer ELO change (positive for win, negative for loss)
 */
export function calculateEloChange(myElo: number, oppAvgElo: number, won: boolean): number {
  const expected = expectedScore(myElo, oppAvgElo);
  const actual = won ? 1 : 0;
  return Math.round(K * (actual - expected));
}

/**
 * Calculate team average ELO
 * Uses only authenticated players' ratings; defaults to DEFAULT_RATING for guests
 */
export function teamAverageElo(ratings: (number | undefined)[]): number {
  if (ratings.length === 0) return DEFAULT_RATING;
  const sum = ratings.reduce((acc: number, r) => acc + (r ?? DEFAULT_RATING), 0);
  return Math.round(sum / ratings.length);
}

export { DEFAULT_RATING };
