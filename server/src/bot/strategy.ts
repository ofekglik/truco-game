/**
 * Bot Strategy Module
 * Provides difficulty-based decision making for bidding, trump, singing, and card play.
 *
 * Difficulty levels:
 *   easy   — Basic heuristics, conservative bidding, random-ish card play
 *   medium — Smarter heuristics, balanced bidding, tactical card play
 *   hard   — Monte Carlo simulation + inference, aggressive optimal play
 */

import {
  GameState, Card, Suit, SeatPosition, SEAT_ORDER, SEAT_TEAM, TeamId,
  CARD_POINTS, CARD_POWER, Rank, Trick, TrickCard, Cante
} from '../engine/types.js';
import { getValidPlays, getNextSeat } from '../engine/tricks.js';
import { determineTrickWinner, calculateTrickPoints } from '../engine/scoring.js';
import { getSingableSuits, canSingCante } from '../engine/singing.js';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

// ─── Hand Evaluation ────────────────────────────────────────────────────────

interface HandEval {
  trickPoints: number;    // estimated points from tricks
  singingPoints: number;  // estimated points from singing
  total: number;
  bestTrumpSuit: Suit;
  bestTrumpScore: number;
}

/** Count cards of a suit in hand */
function countSuit(hand: Card[], suit: Suit): number {
  return hand.filter(c => c.suit === suit).length;
}

/** Check if hand has a void (0 cards) in any non-trump suit */
function countVoids(hand: Card[], excludeSuit?: Suit): number {
  let voids = 0;
  for (const suit of Object.values(Suit)) {
    if (suit === excludeSuit) continue;
    if (countSuit(hand, suit) === 0) voids++;
  }
  return voids;
}

/** Count singletons (exactly 1 card) in non-trump suits */
function countSingletons(hand: Card[], excludeSuit?: Suit): number {
  let singles = 0;
  for (const suit of Object.values(Suit)) {
    if (suit === excludeSuit) continue;
    if (countSuit(hand, suit) === 1) singles++;
  }
  return singles;
}

/** Evaluate trump suitability for a given suit */
function evaluateTrumpSuit(hand: Card[], suit: Suit): number {
  const suitCards = hand.filter(c => c.suit === suit);
  let score = suitCards.length * 2; // length bonus

  for (const c of suitCards) {
    if (c.rank === 1) score += 5;      // ace of trump is dominant
    else if (c.rank === 3) score += 4;  // 3 is second strongest
    else if (c.rank === 12) score += 2; // king
    else if (c.rank === 11) score += 1.5; // horse
  }

  // Cante bonus (king + horse of trump = 40 pts singing)
  if (canSingCante(hand, suit)) score += 6;

  // Void bonus for other suits (more voids = more cuts)
  score += countVoids(hand, suit) * 3;
  score += countSingletons(hand, suit) * 1;

  return score;
}

/** Full hand evaluation assuming a given trump suit */
function evaluateHand(hand: Card[], trumpSuit: Suit, bidAmount: number): HandEval {
  let trickPoints = 0;

  for (const card of hand) {
    const isTrump = card.suit === trumpSuit;
    const power = CARD_POWER[card.rank];

    if (card.rank === 1) {
      // Ace: very likely to win its trick
      trickPoints += isTrump ? 11 : 9;
    } else if (card.rank === 3) {
      // 3: strong but can lose to ace
      trickPoints += isTrump ? 10 : 7;
    } else if (card.rank === 12) {
      trickPoints += isTrump ? 5 : 3;
    } else if (card.rank === 11) {
      trickPoints += isTrump ? 4 : 2;
    } else if (card.rank === 10) {
      trickPoints += isTrump ? 3 : 1;
    }
    // Low cards (2,4,5,6,7) contribute ~0 trick points
  }

  // Trump length bonus: extra trumps let you cut
  const trumpCount = countSuit(hand, trumpSuit);
  if (trumpCount > 3) trickPoints += (trumpCount - 3) * 5;

  // Void/singleton bonus for cutting ability
  trickPoints += countVoids(hand, trumpSuit) * 6;
  trickPoints += countSingletons(hand, trumpSuit) * 2;

  // Singing potential
  let singingPoints = 0;
  for (const suit of Object.values(Suit)) {
    if (canSingCante(hand, suit)) {
      const pts = suit === trumpSuit ? 40 : 20;
      // Check bid-level singing caps
      if (bidAmount === 80 && suit === trumpSuit) continue;
      if (bidAmount === 80 && singingPoints + pts > 20) continue;
      if (bidAmount >= 90 && bidAmount < 100 && singingPoints + pts > 40) continue;
      singingPoints += pts;
    }
  }

  // Find best trump suit
  let bestTrumpSuit = trumpSuit;
  let bestTrumpScore = evaluateTrumpSuit(hand, trumpSuit);
  for (const suit of Object.values(Suit)) {
    const score = evaluateTrumpSuit(hand, suit);
    if (score > bestTrumpScore) {
      bestTrumpScore = score;
      bestTrumpSuit = suit;
    }
  }

  return {
    trickPoints,
    singingPoints,
    total: trickPoints + singingPoints,
    bestTrumpSuit,
    bestTrumpScore,
  };
}

// ─── Bidding Strategy ───────────────────────────────────────────────────────

export function chooseBid(
  state: GameState, seat: SeatPosition, difficulty: BotDifficulty
): number {
  const player = state.players[seat];
  if (!player) return 0;
  const hand = player.hand;

  if (difficulty === 'easy') return chooseBidEasy(hand, state);
  if (difficulty === 'medium') return chooseBidMedium(hand, state);
  return chooseBidHard(hand, state);
}

function chooseBidEasy(hand: Card[], state: GameState): number {
  // Very conservative: only bid with 3+ high cards, never above 80
  const highCards = hand.filter(c => c.rank === 1 || c.rank === 3).length;
  if (highCards >= 3 && state.currentBidAmount < 80) {
    return Math.max(state.currentBidAmount + 10, 70);
  }
  return 0; // pass
}

function chooseBidMedium(hand: Card[], state: GameState): number {
  // Evaluate with best possible trump
  let bestEval: HandEval | null = null;
  for (const suit of Object.values(Suit)) {
    const ev = evaluateHand(hand, suit, 80);
    if (!bestEval || ev.total > bestEval.total) bestEval = ev;
  }
  if (!bestEval) return 0;

  // Estimate safe bid: hand value × safety factor
  // Add estimated partner contribution (~25 pts average)
  const partnerEstimate = 25;
  const teamEstimate = bestEval.total + partnerEstimate;
  const safetyFactor = 0.75;
  const safeBid = Math.floor(teamEstimate * safetyFactor / 10) * 10;

  const minBid = Math.max(state.currentBidAmount + 10, 70);
  if (safeBid >= minBid && minBid <= 130) {
    return minBid; // Bid minimum to win, don't overbid
  }
  return 0; // pass
}

function chooseBidHard(hand: Card[], state: GameState): number {
  // Monte Carlo bid evaluation: for each possible bid level,
  // simulate games and check win rate
  const minBid = Math.max(state.currentBidAmount + 10, 70);
  if (minBid > 150) return 0; // don't go crazy

  // Quick hand eval for upper bound
  let bestEval: HandEval | null = null;
  for (const suit of Object.values(Suit)) {
    const ev = evaluateHand(hand, suit, minBid);
    if (!bestEval || ev.total > bestEval.total) bestEval = ev;
  }
  if (!bestEval) return 0;

  // Use MC to validate the bid
  const bestTrump = bestEval.bestTrumpSuit;
  const successRate = monteCarloEvalBid(hand, bestTrump, minBid, state, 40);

  if (successRate >= 0.55) {
    // Check if we can bid higher
    for (let bid = minBid + 10; bid <= Math.min(minBid + 30, 150); bid += 10) {
      const rate = monteCarloEvalBid(hand, bestTrump, bid, state, 30);
      if (rate < 0.50) return bid - 10;
    }
    return Math.min(minBid + 30, 150);
  }

  return 0; // pass
}

// ─── Trump Declaration Strategy ─────────────────────────────────────────────

export function chooseTrump(
  state: GameState, seat: SeatPosition, difficulty: BotDifficulty
): Suit {
  const player = state.players[seat];
  if (!player) return Suit.ESPADAS;
  const hand = player.hand;

  if (difficulty === 'easy') {
    // Just pick the longest suit
    let best = Suit.ESPADAS;
    let bestCount = 0;
    for (const suit of Object.values(Suit)) {
      const count = countSuit(hand, suit);
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }

  // Medium + Hard: use evaluation scoring
  let bestSuit = Suit.ESPADAS;
  let bestScore = -1;

  if (difficulty === 'hard') {
    // MC: simulate with each suit as trump, pick highest average score
    for (const suit of Object.values(Suit)) {
      const avgScore = monteCarloEvalTrump(hand, suit, state, 40);
      if (avgScore > bestScore) { bestScore = avgScore; bestSuit = suit; }
    }
  } else {
    // Medium: use heuristic
    for (const suit of Object.values(Suit)) {
      const score = evaluateTrumpSuit(hand, suit);
      if (score > bestScore) { bestScore = score; bestSuit = suit; }
    }
  }

  return bestSuit;
}

// ─── Singing Strategy ───────────────────────────────────────────────────────

export function chooseSinging(
  state: GameState, seat: SeatPosition, difficulty: BotDifficulty
): Suit | null {
  const player = state.players[seat];
  if (!player || !state.trumpSuit || !state.biddingTeam) return null;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return null;

  const singable = getSingableSuits(
    player.hand, state.trumpSuit, state.currentBidAmount,
    state.cantes, seat, state.biddingTeam
  );
  if (singable.length === 0) return null;

  if (difficulty === 'easy') {
    // Sing the first available
    return singable[0];
  }

  // Medium + Hard: prefer trump cante (40 pts > 20 pts)
  const trumpCante = singable.find(s => s === state.trumpSuit);
  if (trumpCante) return trumpCante;
  return singable[0];
}

// ─── Singer Choice Strategy ─────────────────────────────────────────────────

export function chooseSingerChoice(
  state: GameState, seat: SeatPosition, difficulty: BotDifficulty
): 'self' | 'partner' {
  if (difficulty === 'easy') return 'self';

  // Medium + Hard: check who has better singing options
  const player = state.players[seat];
  if (!player || !state.trumpSuit || !state.biddingTeam) return 'self';

  const myCanteCount = getSingableSuits(
    player.hand, state.trumpSuit, state.currentBidAmount,
    state.cantes, seat, state.biddingTeam
  ).length;

  // We can't see partner's hand, but we can infer:
  // if we have both cante pairs already, sing ourselves
  if (myCanteCount >= 2) return 'self';

  // Hard: if we have 0 cantes, let partner try
  if (difficulty === 'hard' && myCanteCount === 0) return 'partner';

  return 'self';
}

// ─── Card Play Strategy ─────────────────────────────────────────────────────

export function chooseCard(
  state: GameState, seat: SeatPosition, difficulty: BotDifficulty
): Card | null {
  const player = state.players[seat];
  if (!player) return null;

  const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
  if (validPlays.length === 0) return null;
  if (validPlays.length === 1) return validPlays[0]; // forced play

  if (difficulty === 'easy') return chooseCardEasy(validPlays, state, seat);
  if (difficulty === 'medium') return chooseCardMedium(validPlays, state, seat, player.hand);
  return chooseCardHard(validPlays, state, seat, player.hand);
}

function chooseCardEasy(validPlays: Card[], state: GameState, seat: SeatPosition): Card {
  // Play random but with a slight preference: avoid aces early
  if (state.completedTricks.length < 3) {
    const nonAces = validPlays.filter(c => c.rank !== 1);
    if (nonAces.length > 0) {
      return nonAces[Math.floor(Math.random() * nonAces.length)];
    }
  }
  return validPlays[Math.floor(Math.random() * validPlays.length)];
}

function chooseCardMedium(
  validPlays: Card[], state: GameState, seat: SeatPosition, hand: Card[]
): Card {
  const trick = state.currentTrick;
  const myTeam = SEAT_TEAM[seat];
  const trumpSuit = state.trumpSuit;

  // Leading: play ace of a strong suit, or low card of a weak suit
  if (trick.cards.length === 0) {
    return chooseLeadCard(validPlays, hand, trumpSuit, myTeam, state);
  }

  const leadSuit = trick.cards[0].card.suit;
  const partnerSeat = getPartnerSeat(seat);
  const partnerPlayed = trick.cards.find(tc => tc.seat === partnerSeat);
  const currentWinner = trick.cards.length > 0
    ? determineTrickWinner({ cards: trick.cards, leadSeat: trick.leadSeat }, trumpSuit)
    : null;
  const partnerIsWinning = currentWinner && SEAT_TEAM[currentWinner.seat] === myTeam;

  // Partner is winning — play lowest valid card
  if (partnerIsWinning && trick.cards.length >= 2) {
    return getLowestCard(validPlays);
  }

  // We need to win this trick
  // Try to play the cheapest winning card
  const trickWithMyPlays = validPlays.map(card => {
    const hypoTrick: Trick = {
      cards: [...trick.cards, { card, seat }],
      leadSeat: trick.leadSeat,
    };
    const winner = determineTrickWinner(hypoTrick, trumpSuit);
    return { card, wins: winner.seat === seat };
  });

  const winningPlays = trickWithMyPlays.filter(p => p.wins);
  if (winningPlays.length > 0) {
    // Play the cheapest winning card (minimize point waste)
    return winningPlays.sort((a, b) =>
      CARD_POINTS[a.card.rank] - CARD_POINTS[b.card.rank] ||
      CARD_POWER[a.card.rank] - CARD_POWER[b.card.rank]
    )[0].card;
  }

  // Can't win — play lowest value card
  return getLowestCard(validPlays);
}

function chooseCardHard(
  validPlays: Card[], state: GameState, seat: SeatPosition, hand: Card[]
): Card {
  // Monte Carlo: simulate N games for each valid play, pick best average
  const SIM_COUNT = 80;
  return monteCarloChooseCard(validPlays, hand, state, seat, SIM_COUNT);
}

// ─── Lead Card Heuristics ───────────────────────────────────────────────────

function chooseLeadCard(
  validPlays: Card[], hand: Card[], trumpSuit: Suit | null, myTeam: TeamId,
  state: GameState
): Card {
  // Leading strategy:
  // 1. Lead aces of non-trump suits (guaranteed win, collect points)
  // 2. Lead from long non-trump suit to establish control
  // 3. Avoid leading low trumps (save them for cutting)

  const nonTrumpAces = validPlays.filter(c =>
    c.rank === 1 && c.suit !== trumpSuit
  );
  if (nonTrumpAces.length > 0) {
    // Lead ace of shortest side suit to cash it before getting cut
    return nonTrumpAces.sort((a, b) =>
      countSuit(hand, a.suit) - countSuit(hand, b.suit)
    )[0];
  }

  // Lead 3s of non-trump suits if we also hold the ace (combo)
  const nonTrumpThrees = validPlays.filter(c =>
    c.rank === 3 && c.suit !== trumpSuit &&
    hand.some(h => h.suit === c.suit && h.rank === 1)
  );
  if (nonTrumpThrees.length > 0) return nonTrumpThrees[0];

  // Lead low cards from short suits (set up future cuts)
  const nonTrumps = validPlays.filter(c => c.suit !== trumpSuit);
  if (nonTrumps.length > 0) {
    return nonTrumps.sort((a, b) => {
      const suitDiff = countSuit(hand, a.suit) - countSuit(hand, b.suit);
      if (suitDiff !== 0) return suitDiff; // shorter suit first
      return CARD_POWER[a.rank] - CARD_POWER[b.rank]; // lower power first
    })[0];
  }

  // Only trumps left — lead lowest
  return getLowestCard(validPlays);
}

// ─── Monte Carlo Simulation Engine ──────────────────────────────────────────

/** Get all 40 cards in the deck */
function getAllCards(): Card[] {
  const cards: Card[] = [];
  const ranks: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  for (const suit of Object.values(Suit)) {
    for (const rank of ranks) {
      cards.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return cards;
}

/** Shuffle array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Get unseen cards (not in my hand, not already played) */
function getUnseenCards(myHand: Card[], state: GameState): Card[] {
  const allCards = getAllCards();
  const myIds = new Set(myHand.map(c => c.id));
  const playedIds = new Set<string>();

  for (const trick of state.completedTricks) {
    for (const tc of trick.cards) playedIds.add(tc.card.id);
  }
  for (const tc of state.currentTrick.cards) {
    playedIds.add(tc.card.id);
  }

  return allCards.filter(c => !myIds.has(c.id) && !playedIds.has(c.id));
}

/** Deal unseen cards randomly to the other 3 players */
function dealHypothetical(
  unseen: Card[],
  mySeat: SeatPosition,
  state: GameState
): Map<SeatPosition, Card[]> {
  const hands = new Map<SeatPosition, Card[]>();
  const otherSeats = SEAT_ORDER.filter(s => s !== mySeat);

  // Figure out how many cards each player should have
  const myCardCount = state.players[mySeat]?.hand.length || 0;
  const cardsPerSeat: Record<SeatPosition, number> = {} as any;
  for (const s of otherSeats) {
    const p = state.players[s];
    // Infer card count: start with 10, subtract completed tricks & current trick plays
    let count = 10 - state.completedTricks.length;
    // Subtract if they've played in the current trick
    if (state.currentTrick.cards.some(tc => tc.seat === s)) count--;
    cardsPerSeat[s] = Math.max(0, count);
  }

  const shuffled = shuffle([...unseen]);
  let idx = 0;
  for (const s of otherSeats) {
    const count = cardsPerSeat[s];
    hands.set(s, shuffled.slice(idx, idx + count));
    idx += count;
  }

  return hands;
}

/**
 * Simulate remaining tricks from current state with heuristic play.
 * Returns the point score for the given team.
 */
function simulateRemainingTricks(
  myHand: Card[],
  otherHands: Map<SeatPosition, Card[]>,
  state: GameState,
  mySeat: SeatPosition,
  myTeam: TeamId
): number {
  // Build simulation hands (copy)
  const simHands = new Map<SeatPosition, Card[]>();
  simHands.set(mySeat, [...myHand]);
  for (const [seat, hand] of otherHands) {
    simHands.set(seat, [...hand]);
  }

  const trumpSuit = state.trumpSuit;
  let currentLead = state.currentTrick.leadSeat;
  let team1Points = 0;
  let team2Points = 0;
  let tricksPlayed = state.completedTricks.length;

  // Complete the current trick if partially played
  let trickCards: TrickCard[] = [...state.currentTrick.cards];
  let nextPlayer = state.currentTurnSeat;

  // Fill remaining positions in current trick
  while (trickCards.length < 4) {
    const hand = simHands.get(nextPlayer);
    if (!hand || hand.length === 0) break;

    const validPlays = getValidPlays(hand, { cards: trickCards }, trumpSuit);
    if (validPlays.length === 0) break;

    // Heuristic play for simulation
    const card = simHeuristicPlay(validPlays, { cards: trickCards, leadSeat: currentLead }, nextPlayer, trumpSuit);
    const idx = hand.findIndex(c => c.id === card.id);
    if (idx >= 0) hand.splice(idx, 1);
    trickCards.push({ card, seat: nextPlayer });
    nextPlayer = getNextSeat(nextPlayer);
  }

  // Resolve current trick
  if (trickCards.length === 4) {
    const trick: Trick = { cards: trickCards, leadSeat: currentLead };
    const winner = determineTrickWinner(trick, trumpSuit);
    const pts = calculateTrickPoints(trick);
    tricksPlayed++;
    const bonus = tricksPlayed === 10 ? 10 : 0;
    if (SEAT_TEAM[winner.seat] === 'team1') team1Points += pts + bonus;
    else team2Points += pts + bonus;
    currentLead = winner.seat;
  }

  // Play remaining tricks
  while (tricksPlayed < 10) {
    const trickCards: TrickCard[] = [];
    let player = currentLead;

    for (let i = 0; i < 4; i++) {
      const hand = simHands.get(player);
      if (!hand || hand.length === 0) break;

      const validPlays = getValidPlays(hand, { cards: trickCards }, trumpSuit);
      if (validPlays.length === 0) break;

      const card = simHeuristicPlay(validPlays, { cards: trickCards, leadSeat: currentLead }, player, trumpSuit);
      const idx = hand.findIndex(c => c.id === card.id);
      if (idx >= 0) hand.splice(idx, 1);
      trickCards.push({ card, seat: player });
      player = getNextSeat(player);
    }

    if (trickCards.length < 4) break; // shouldn't happen

    const trick: Trick = { cards: trickCards, leadSeat: currentLead };
    const winner = determineTrickWinner(trick, trumpSuit);
    const pts = calculateTrickPoints(trick);
    tricksPlayed++;
    const bonus = tricksPlayed === 10 ? 10 : 0;
    if (SEAT_TEAM[winner.seat] === 'team1') team1Points += pts + bonus;
    else team2Points += pts + bonus;
    currentLead = winner.seat;
  }

  return myTeam === 'team1' ? team1Points : team2Points;
}

/** Simple heuristic card selection for simulation playout */
function simHeuristicPlay(
  validPlays: Card[],
  trick: { cards: TrickCard[]; leadSeat: SeatPosition },
  seat: SeatPosition,
  trumpSuit: Suit | null
): Card {
  if (validPlays.length === 1) return validPlays[0];

  // If leading: play highest power card (aggressive playout)
  if (trick.cards.length === 0) {
    return validPlays.sort((a, b) => CARD_POWER[b.rank] - CARD_POWER[a.rank])[0];
  }

  // Following: try to win with cheapest winner, else play lowest
  const myTeam = SEAT_TEAM[seat];
  const currentWinner = determineTrickWinner(
    { cards: trick.cards, leadSeat: trick.leadSeat }, trumpSuit
  );
  const partnerWinning = SEAT_TEAM[currentWinner.seat] === myTeam;

  if (partnerWinning) {
    // Partner winning — dump lowest
    return validPlays.sort((a, b) =>
      CARD_POINTS[a.rank] - CARD_POINTS[b.rank] ||
      CARD_POWER[a.rank] - CARD_POWER[b.rank]
    )[0];
  }

  // Try to win cheaply
  for (const card of validPlays.sort((a, b) => CARD_POWER[a.rank] - CARD_POWER[b.rank])) {
    const hypoCards = [...trick.cards, { card, seat }];
    const winner = determineTrickWinner({ cards: hypoCards, leadSeat: trick.leadSeat }, trumpSuit);
    if (winner.seat === seat) return card; // cheapest win
  }

  // Can't win — play lowest
  return validPlays.sort((a, b) =>
    CARD_POINTS[a.rank] - CARD_POINTS[b.rank] ||
    CARD_POWER[a.rank] - CARD_POWER[b.rank]
  )[0];
}

/** Monte Carlo: choose the best card to play */
function monteCarloChooseCard(
  validPlays: Card[],
  myHand: Card[],
  state: GameState,
  mySeat: SeatPosition,
  simCount: number
): Card {
  const myTeam = SEAT_TEAM[mySeat];
  const unseen = getUnseenCards(myHand, state);
  const scores: Map<string, { total: number; count: number }> = new Map();

  for (const card of validPlays) {
    scores.set(card.id, { total: 0, count: 0 });
  }

  for (let sim = 0; sim < simCount; sim++) {
    const otherHands = dealHypothetical(unseen, mySeat, state);

    for (const card of validPlays) {
      // Play this card, then simulate the rest
      const handAfter = myHand.filter(c => c.id !== card.id);

      // Build state with this card played
      const simTrick: TrickCard[] = [...state.currentTrick.cards, { card, seat: mySeat }];
      const simState: GameState = {
        ...state,
        currentTrick: { cards: simTrick, leadSeat: state.currentTrick.leadSeat },
        currentTurnSeat: getNextSeat(mySeat),
      };

      const teamPts = simulateRemainingTricks(
        handAfter, otherHands, simState, mySeat, myTeam
      );

      const entry = scores.get(card.id)!;
      entry.total += teamPts;
      entry.count++;
    }
  }

  // Pick card with highest average score
  let bestCard = validPlays[0];
  let bestAvg = -Infinity;
  for (const card of validPlays) {
    const entry = scores.get(card.id)!;
    const avg = entry.total / entry.count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestCard = card;
    }
  }

  return bestCard;
}

/** Monte Carlo: evaluate a bid level (returns success rate 0-1) */
function monteCarloEvalBid(
  myHand: Card[],
  trumpSuit: Suit,
  bidAmount: number,
  state: GameState,
  simCount: number
): number {
  const mySeat = state.currentTurnSeat;
  const myTeam = SEAT_TEAM[mySeat];
  const unseen = getUnseenCards(myHand, state);
  let successes = 0;

  for (let sim = 0; sim < simCount; sim++) {
    const otherHands = dealHypothetical(unseen, mySeat, state);

    // Simulate full game from trick 1
    const simState: GameState = {
      ...state,
      trumpSuit,
      biddingTeam: myTeam,
      currentBidAmount: bidAmount,
      currentBidWinner: mySeat,
      phase: state.phase,
      currentTrick: { cards: [], leadSeat: getNextSeat(state.dealerSeat) },
      completedTricks: [],
      trickNumber: 1,
      currentTurnSeat: getNextSeat(state.dealerSeat),
    };

    const trickPts = simulateRemainingTricks(
      [...myHand], otherHands, simState, mySeat, myTeam
    );

    // Estimate singing points (simple: count cante pairs in our hand)
    let singingPts = 0;
    for (const suit of Object.values(Suit)) {
      if (canSingCante(myHand, suit)) {
        const pts = suit === trumpSuit ? 40 : 20;
        if (bidAmount === 80 && suit === trumpSuit) continue;
        if (bidAmount === 80 && singingPts + pts > 20) continue;
        if (bidAmount >= 90 && bidAmount < 100 && singingPts + pts > 40) continue;
        singingPts += pts;
      }
    }

    if (trickPts + singingPts >= bidAmount) successes++;
  }

  return successes / simCount;
}

/** Monte Carlo: evaluate trump suit (returns average team points) */
function monteCarloEvalTrump(
  myHand: Card[],
  trumpSuit: Suit,
  state: GameState,
  simCount: number
): number {
  const mySeat = state.currentTurnSeat;
  const myTeam = SEAT_TEAM[mySeat];
  const unseen = getUnseenCards(myHand, state);
  let totalPts = 0;

  for (let sim = 0; sim < simCount; sim++) {
    const otherHands = dealHypothetical(unseen, mySeat, state);

    const simState: GameState = {
      ...state,
      trumpSuit,
      currentTrick: { cards: [], leadSeat: getNextSeat(state.dealerSeat) },
      completedTricks: [],
      trickNumber: 1,
      currentTurnSeat: getNextSeat(state.dealerSeat),
    };

    totalPts += simulateRemainingTricks(
      [...myHand], otherHands, simState, mySeat, myTeam
    );
  }

  return totalPts / simCount;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPartnerSeat(seat: SeatPosition): SeatPosition {
  const partners: Record<SeatPosition, SeatPosition> = {
    south: 'north', north: 'south', east: 'west', west: 'east',
  };
  return partners[seat];
}

function getLowestCard(cards: Card[]): Card {
  return cards.sort((a, b) =>
    CARD_POINTS[a.rank] - CARD_POINTS[b.rank] ||
    CARD_POWER[a.rank] - CARD_POWER[b.rank]
  )[0];
}
