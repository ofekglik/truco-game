/**
 * Context Engine for Legendary Bot
 *
 * Builds rich, precomputed context strings for each game phase.
 * All deterministic analysis (card tracking, void detection, point counting,
 * strategic warnings) is computed here so the LLM can focus on strategic reasoning.
 */

import {
  GameState, Card, Suit, SeatPosition, SEAT_ORDER, SEAT_TEAM, TeamId,
  CARD_POINTS, CARD_POWER, Rank, SUIT_NAMES_HE, Trick
} from '../engine/types.js';
import { canSingCante, getSingableSuits } from '../engine/singing.js';
import { determineTrickWinner, calculateTrickPoints } from '../engine/scoring.js';
import { getValidPlays } from '../engine/tricks.js';
import { chooseBid, chooseTrump, chooseCard } from './strategy.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const ALL_RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

// ─── Helpers ───────────────────────────────────────────────────────────────

function cardStr(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function getPartner(seat: SeatPosition): SeatPosition {
  const map: Record<SeatPosition, SeatPosition> = {
    south: 'north', north: 'south', east: 'west', west: 'east',
  };
  return map[seat];
}

// ─── Card Tracking ─────────────────────────────────────────────────────────

interface CardTracker {
  played: Map<string, { card: Card; bySeat: SeatPosition; trickNum: number }>;
  unseenBySuit: Map<Suit, Card[]>;
  myHandBySuit: Map<Suit, Card[]>;
}

function buildCardTracker(state: GameState, seat: SeatPosition): CardTracker {
  const player = state.players[seat];
  const myHand = player?.hand || [];
  const myIds = new Set(myHand.map(c => c.id));

  const played = new Map<string, { card: Card; bySeat: SeatPosition; trickNum: number }>();
  for (let i = 0; i < state.completedTricks.length; i++) {
    for (const tc of state.completedTricks[i].cards) {
      played.set(tc.card.id, { card: tc.card, bySeat: tc.seat, trickNum: i + 1 });
    }
  }
  for (const tc of state.currentTrick.cards) {
    played.set(tc.card.id, { card: tc.card, bySeat: tc.seat, trickNum: state.completedTricks.length + 1 });
  }

  const unseenBySuit = new Map<Suit, Card[]>();
  const myHandBySuit = new Map<Suit, Card[]>();
  for (const suit of Object.values(Suit)) {
    unseenBySuit.set(suit, []);
    myHandBySuit.set(suit, []);
  }
  for (const card of myHand) {
    myHandBySuit.get(card.suit)!.push(card);
  }
  for (const suit of Object.values(Suit)) {
    for (const rank of ALL_RANKS) {
      const id = `${suit}-${rank}`;
      if (!myIds.has(id) && !played.has(id)) {
        unseenBySuit.get(suit)!.push({ suit, rank, id });
      }
    }
    unseenBySuit.get(suit)!.sort((a, b) => CARD_POWER[b.rank] - CARD_POWER[a.rank]);
    myHandBySuit.get(suit)!.sort((a, b) => CARD_POWER[b.rank] - CARD_POWER[a.rank]);
  }

  return { played, unseenBySuit, myHandBySuit };
}

// ─── Void Detection ────────────────────────────────────────────────────────

function detectVoids(state: GameState, mySeat: SeatPosition): Map<SeatPosition, Set<Suit>> {
  const voids = new Map<SeatPosition, Set<Suit>>();
  for (const s of SEAT_ORDER) voids.set(s, new Set());

  const allTricks = [...state.completedTricks];
  // Include current trick for in-progress detection
  if (state.currentTrick.cards.length >= 2) {
    allTricks.push(state.currentTrick as Trick);
  }

  for (const trick of allTricks) {
    if (trick.cards.length < 2) continue;
    const leadSuit = trick.cards[0].card.suit;
    for (let i = 1; i < trick.cards.length; i++) {
      const tc = trick.cards[i];
      if (tc.card.suit !== leadSuit) {
        voids.get(tc.seat)!.add(leadSuit);
      }
    }
  }

  return voids;
}

// ─── Point Counting ────────────────────────────────────────────────────────

interface PointCount {
  team1Trick: number;
  team2Trick: number;
  team1Sing: number;
  team2Sing: number;
}

function countPoints(state: GameState): PointCount {
  let team1Trick = 0, team2Trick = 0;

  for (let i = 0; i < state.completedTricks.length; i++) {
    const trick = state.completedTricks[i];
    const winner = determineTrickWinner(trick, state.trumpSuit);
    const pts = calculateTrickPoints(trick);
    const lastBonus = (i === state.completedTricks.length - 1 && state.completedTricks.length === 10) ? 10 : 0;
    if (SEAT_TEAM[winner.seat] === 'team1') team1Trick += pts + lastBonus;
    else team2Trick += pts + lastBonus;
  }

  let team1Sing = 0, team2Sing = 0;
  for (const c of state.cantes) {
    if (SEAT_TEAM[c.seat] === 'team1') team1Sing += c.points;
    else team2Sing += c.points;
  }

  return { team1Trick, team2Trick, team1Sing, team2Sing };
}

// ─── Suit Strength Assessment ──────────────────────────────────────────────

function assessSuitStrength(cards: Card[], suit: Suit, hand: Card[]): string {
  if (cards.length === 0) return 'VOID (can cut with trump)';

  const hasAce = cards.some(c => c.rank === 1);
  const has3 = cards.some(c => c.rank === 3);
  const singable = canSingCante(hand, suit);

  if (hasAce && has3) return 'DOMINANT (ace+3 controls)';
  if (hasAce) return 'STRONG (ace controls)';
  if (has3 && singable) return 'GOOD (3+cante, but ace is out)';
  if (has3) return 'GOOD (3 is strong, ace is out)';
  if (singable) return 'SINGABLE (king+horse pair)';
  if (cards.length === 1) return 'SINGLETON (will void quickly)';
  if (cards.length >= 3) return `LONG (${cards.length}) but no power`;
  return 'WEAK';
}

// ─── Bidding Analysis ──────────────────────────────────────────────────────

function analyzeBiddingHistory(state: GameState, mySeat: SeatPosition): string[] {
  if (state.bids.length === 0) return [];
  const partner = getPartner(mySeat);
  const myTeam = SEAT_TEAM[mySeat];
  const lines: string[] = ['BIDDING HISTORY:'];

  for (const bid of state.bids) {
    const relation = bid.seat === partner ? 'partner'
      : SEAT_TEAM[bid.seat] === myTeam ? 'teammate'
      : 'opponent';

    if (bid.amount === 0) {
      lines.push(`  ${bid.seat}(${relation}): PASS — likely weak hand`);
    } else {
      let inference = '';
      if (bid.amount >= 100) inference = ' — very strong hand, multiple aces likely';
      else if (bid.amount >= 90) inference = ' — strong hand, good trump+singing potential';
      else if (bid.amount >= 80) inference = ' — decent hand';
      else inference = ' — minimum bid, testing waters';

      // Declaration bid detection
      const isDeclaration = state.bids.filter(b => b.amount === bid.amount).length > 1
        && bid.seat !== state.currentBidWinner;
      if (isDeclaration) {
        inference = ' — DECLARATION BID (signaling strength to partner at same level)';
      }

      lines.push(`  ${bid.seat}(${relation}): ${bid.amount}${inference}`);
    }
  }

  return lines;
}

// ─── Max Singing Calculation ───────────────────────────────────────────────

function calcMaxSinging(hand: Card[], trumpSuit: Suit, bidAmount: number): number {
  let singPts = 0;
  // Trump cante first (higher value)
  if (canSingCante(hand, trumpSuit)) {
    const pts = 40;
    if (bidAmount === 80) { /* no trump cante at 80 */ }
    else if (bidAmount >= 90 && bidAmount < 100 && singPts + pts <= 40) singPts += pts;
    else if (bidAmount >= 100) singPts += pts;
  }
  // Non-trump cantes
  for (const suit of Object.values(Suit)) {
    if (suit === trumpSuit) continue;
    if (!canSingCante(hand, suit)) continue;
    const pts = 20;
    if (bidAmount === 80 && singPts + pts > 20) continue;
    if (bidAmount >= 90 && bidAmount < 100 && singPts + pts > 40) continue;
    singPts += pts;
  }
  return singPts;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC CONTEXT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build rich context for BIDDING decisions.
 * Includes: hand analysis, suit strengths, singing potential, bidding math, MC analysis.
 */
export function buildBiddingContext(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player) return '';

  const hand = player.hand;
  const myTeam = SEAT_TEAM[seat];
  const partner = getPartner(seat);
  const tracker = buildCardTracker(state, seat);

  const L: string[] = [];

  L.push(`YOU: ${seat} (${myTeam}) | Partner: ${partner}`);
  L.push(`GAME SCORE: team1=${state.scores.team1}, team2=${state.scores.team2} (target: ${state.targetScore})`);
  L.push('');

  // ── Hand breakdown per suit ──
  L.push('YOUR HAND (10 cards):');
  for (const suit of Object.values(Suit)) {
    const cards = tracker.myHandBySuit.get(suit)!;
    const assessment = assessSuitStrength(cards, suit, hand);
    if (cards.length === 0) {
      L.push(`  ${suit}: VOID — can cut with trump`);
      continue;
    }
    const cardList = cards.map(c => {
      const pts = CARD_POINTS[c.rank];
      const labels: Partial<Record<number, string>> = { 1: 'ace', 3: '3★', 12: 'king', 11: 'horse', 10: 'sota' };
      return `${labels[c.rank] || c.rank}(${pts}pts)`;
    }).join(', ');
    L.push(`  ${suit}: [${cardList}] — ${cards.length} cards, ${assessment}`);
  }
  L.push('');

  // ── Singing potential ──
  const singPairs: string[] = [];
  for (const suit of Object.values(Suit)) {
    if (canSingCante(hand, suit)) singPairs.push(`${suit} (20pts non-trump, 40pts if trump)`);
  }
  L.push(singPairs.length > 0
    ? `SINGING POTENTIAL: ${singPairs.join('; ')}`
    : 'SINGING POTENTIAL: none');
  L.push('');

  // ── Trump suit analysis ──
  L.push('TRUMP ANALYSIS (if you win the bid):');
  for (const suit of Object.values(Suit)) {
    const cards = tracker.myHandBySuit.get(suit)!;
    const voidCount = Object.values(Suit).filter(s => s !== suit && tracker.myHandBySuit.get(s)!.length === 0).length;
    const singletonCount = Object.values(Suit).filter(s => s !== suit && tracker.myHandBySuit.get(s)!.length === 1).length;
    const maxSing = calcMaxSinging(hand, suit, 90); // estimate at bid 90
    const hasAce = cards.some(c => c.rank === 1);
    const has3 = cards.some(c => c.rank === 3);

    const traits: string[] = [];
    traits.push(`${cards.length} trumps`);
    if (hasAce) traits.push('ace');
    if (has3) traits.push('3★');
    if (canSingCante(hand, suit)) traits.push('cante(40pts)');
    if (voidCount > 0) traits.push(`${voidCount} voids`);
    if (singletonCount > 0) traits.push(`${singletonCount} singletons`);
    traits.push(`max singing=${maxSing}pts`);

    L.push(`  ${suit}: ${traits.join(', ')}`);
  }
  L.push('');

  // ── Bidding math ──
  L.push('BID MATH (what you need to make each bid level):');
  for (let bid = 70; bid <= 130; bid += 10) {
    if (bid < Math.max(70, state.currentBidAmount)) continue;
    // Pick best trump for this bid level
    let bestSing = 0;
    for (const suit of Object.values(Suit)) {
      bestSing = Math.max(bestSing, calcMaxSinging(hand, suit, bid));
    }
    const trickNeeded = Math.max(0, bid - bestSing);
    const pct = Math.round((trickNeeded / 130) * 100);
    L.push(`  Bid ${bid}: need ${trickNeeded} trick pts (${pct}% of 130) with up to ${bestSing}pts singing`);
  }
  L.push('');

  // ── Risk assessment ──
  L.push('RISK ASSESSMENT:');
  const unprotectedSuits = Object.values(Suit).filter(suit => {
    const cards = tracker.myHandBySuit.get(suit)!;
    return cards.length > 0 && !cards.some(c => c.rank === 1);
  });
  if (unprotectedSuits.length > 0) {
    L.push(`  Suits without ace (opponent leads first = ~15pts at risk each): ${unprotectedSuits.join(', ')}`);
  }
  const voidSuits = Object.values(Suit).filter(suit => tracker.myHandBySuit.get(suit)!.length === 0);
  if (voidSuits.length > 0) {
    L.push(`  Void suits (can cut with trump): ${voidSuits.join(', ')}`);
  }
  L.push('');

  // ── MC recommendations ──
  const hardBid = chooseBid(state, seat, 'hard');
  const medBid = chooseBid(state, seat, 'medium');
  L.push(`MC ANALYSIS: hard=${hardBid || 'pass'}, medium=${medBid || 'pass'}`);
  L.push('');

  // ── Bidding history ──
  L.push(...analyzeBiddingHistory(state, seat));

  return L.join('\n');
}

/**
 * Build rich context for TRUMP DECLARATION.
 */
export function buildTrumpContext(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player) return '';

  const hand = player.hand;
  const myTeam = SEAT_TEAM[seat];
  const partner = getPartner(seat);
  const tracker = buildCardTracker(state, seat);

  const L: string[] = [];

  L.push(`YOU: ${seat} (${myTeam}) | Partner: ${partner}`);
  L.push(`You WON the bid at ${state.currentBidAmount}. Choose trump suit.`);
  L.push('');

  L.push('DETAILED SUIT ANALYSIS:');
  for (const suit of Object.values(Suit)) {
    const cards = tracker.myHandBySuit.get(suit)!;
    const cardList = cards.map(c => c.rank).join(',') || 'none';
    const hasAce = cards.some(c => c.rank === 1);
    const has3 = cards.some(c => c.rank === 3);
    const singable = canSingCante(hand, suit);

    const pros: string[] = [];
    const cons: string[] = [];

    if (cards.length >= 4) pros.push(`long (${cards.length})`);
    else if (cards.length >= 3) pros.push(`decent length (${cards.length})`);
    if (hasAce) pros.push('ACE (strongest card)');
    if (has3) pros.push('3★ (second strongest)');
    if (singable) pros.push('CANTE → 40pts singing!');
    const otherVoids = Object.values(Suit).filter(s => s !== suit && tracker.myHandBySuit.get(s)!.length === 0);
    if (otherVoids.length > 0) pros.push(`${otherVoids.length} void(s) in other suits → can cut`);
    const otherSingletons = Object.values(Suit).filter(s => s !== suit && tracker.myHandBySuit.get(s)!.length === 1);
    if (otherSingletons.length > 0) pros.push(`${otherSingletons.length} singleton(s) → quick void`);

    if (cards.length <= 2) cons.push(`short (${cards.length})`);
    if (!hasAce) cons.push('no ace');
    if (cards.length === 0) cons.push('VOID — cannot be trump!');

    L.push(`  ${suit} [${cardList}]:`);
    if (pros.length > 0) L.push(`    + ${pros.join(', ')}`);
    if (cons.length > 0) L.push(`    - ${cons.join(', ')}`);

    // Singing math at current bid
    const maxSing = calcMaxSinging(hand, suit, state.currentBidAmount);
    const trickNeeded = Math.max(0, state.currentBidAmount - maxSing);
    L.push(`    → Bid ${state.currentBidAmount} with this trump: need ${trickNeeded} trick pts (singing=${maxSing}pts)`);
  }
  L.push('');

  // MC
  const hardTrump = chooseTrump(state, seat, 'hard');
  const medTrump = chooseTrump(state, seat, 'medium');
  L.push(`MC ANALYSIS: hard=${hardTrump}, medium=${medTrump}`);
  L.push('');

  // Bidding context for inference
  L.push(...analyzeBiddingHistory(state, seat));

  return L.join('\n');
}

/**
 * Build rich context for SINGER CHOICE (who sings first: self or partner).
 */
export function buildSingerChoiceContext(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player || !state.trumpSuit || !state.biddingTeam) return '';

  const hand = player.hand;
  const myTeam = SEAT_TEAM[seat];
  const partner = getPartner(seat);

  const L: string[] = [];

  L.push(`YOU: ${seat} (${myTeam}) | Partner: ${partner}`);
  L.push(`TRUMP: ${state.trumpSuit} | BID: ${state.currentBidAmount}`);
  L.push('Both you AND your partner can sing. Choose who sings FIRST.');
  L.push('(Only one cante per trick win — order matters for singing caps.)');
  L.push('');

  // My cantes
  const mySingable = getSingableSuits(hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
  L.push('YOUR CANTES:');
  for (const suit of mySingable) {
    const isTrump = suit === state.trumpSuit;
    const pts = isTrump ? 40 : 20;
    const hasAce = hand.some(c => c.suit === suit && c.rank === 1);
    const protection = hasAce ? 'PROTECTED — you have the ace of this suit' : 'EXPOSED — ace is NOT in your hand';
    L.push(`  ${suit}: ${pts}pts ${isTrump ? '(TRUMP cante)' : ''} — ${protection}`);
  }
  L.push('');

  // Points status
  const pts = countPoints(state);
  const teamTrick = myTeam === 'team1' ? pts.team1Trick : pts.team2Trick;
  const teamSing = myTeam === 'team1' ? pts.team1Sing : pts.team2Sing;
  const needed = state.currentBidAmount - teamTrick - teamSing;
  L.push(`POINTS: ${teamTrick} trick + ${teamSing} singing = ${teamTrick + teamSing}. Need ${state.currentBidAmount}. Gap: ${needed > 0 ? needed : 'ALREADY MADE'}`);
  L.push('');

  // Singing cap rules
  if (state.currentBidAmount === 80) {
    L.push('SINGING CAP: bid 80 → max 20pts total, NO trump cante allowed');
  } else if (state.currentBidAmount >= 90 && state.currentBidAmount < 100) {
    L.push('SINGING CAP: bid 90-99 → max 40pts total singing');
    L.push('  If you sing a 40pt trump cante first → no more singing possible');
    L.push('  If partner sings 20pt non-trump first → you can still sing 20pt non-trump (total 40)');
  } else {
    L.push('SINGING CAP: bid 100+ → no limit');
  }
  L.push('');

  L.push('STRATEGY GUIDANCE:');
  L.push('  "self" = you sing first. "partner" = partner sings first.');
  L.push('  Consider: which cante is more valuable (trump=40 vs non-trump=20)?');
  L.push('  A PROTECTED cante (you hold the ace) is safe — the king+horse cannot be captured.');
  L.push('  An EXPOSED cante might lose the king or horse before you can sing.');
  L.push('  Also consider singing caps — singing order affects total available points.');

  return L.join('\n');
}

/**
 * Build rich context for SINGING action (which suit to sing).
 */
export function buildSingingContext(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player || !state.trumpSuit || !state.biddingTeam) return '';

  const hand = player.hand;
  const myTeam = SEAT_TEAM[seat];

  const singable = getSingableSuits(hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
  if (singable.length <= 1) return ''; // no decision needed

  const L: string[] = [];
  L.push(`TRUMP: ${state.trumpSuit} | BID: ${state.currentBidAmount}`);
  L.push('You can sing multiple cantes. Choose which to sing NOW:');

  for (const suit of singable) {
    const isTrump = suit === state.trumpSuit;
    const pts = isTrump ? 40 : 20;
    const hasAce = hand.some(c => c.suit === suit && c.rank === 1);
    L.push(`  ${suit}: ${pts}pts ${isTrump ? '(TRUMP)' : ''} — ace ${hasAce ? 'in hand (safe)' : 'NOT in hand (exposed)'}`);
  }

  // Existing singing
  const existingPts = state.cantes.filter(c => SEAT_TEAM[c.seat] === myTeam).reduce((s, c) => s + c.points, 0);
  if (state.currentBidAmount >= 90 && state.currentBidAmount < 100) {
    L.push(`\nSINGING CAP: already used ${existingPts}pts of 40pts max`);
  }

  return L.join('\n');
}

/**
 * Build rich context for TRICK PLAY decisions.
 * This is the most detailed context: card tracking, voids, points, trick history, warnings.
 */
export function buildTrickPlayContext(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player) return '';

  const hand = player.hand;
  const myTeam = SEAT_TEAM[seat];
  const partner = getPartner(seat);
  const tracker = buildCardTracker(state, seat);
  const knownVoids = detectVoids(state, seat);
  const pts = countPoints(state);
  const validPlays = getValidPlays(hand, state.currentTrick, state.trumpSuit);

  const teamTrick = myTeam === 'team1' ? pts.team1Trick : pts.team2Trick;
  const oppTrick = myTeam === 'team1' ? pts.team2Trick : pts.team1Trick;
  const teamSing = myTeam === 'team1' ? pts.team1Sing : pts.team2Sing;
  const oppSing = myTeam === 'team1' ? pts.team2Sing : pts.team1Sing;
  const isBiddingTeam = state.biddingTeam === myTeam;
  const tricksRemaining = 10 - state.completedTricks.length;

  const L: string[] = [];

  // ── Header ──
  L.push(`YOU: ${seat} (${myTeam}) | Partner: ${partner}`);
  L.push(`TRUMP: ${state.trumpSuit} | BID: ${state.currentBidAmount} by ${state.currentBidWinner}(${state.biddingTeam})`);
  if (state.cantes.length > 0) {
    L.push(`SINGING: your team ${teamSing}pts, opponents ${oppSing}pts`);
  }
  L.push('');

  // ── Point status ──
  L.push(`TRICK ${state.completedTricks.length + 1}/10 — ${tricksRemaining} remaining`);
  L.push(`YOUR TEAM: ${teamTrick} trick + ${teamSing} sing = ${teamTrick + teamSing}`);
  L.push(`OPPONENTS: ${oppTrick} trick + ${oppSing} sing = ${oppTrick + oppSing}`);

  if (isBiddingTeam) {
    const gap = state.currentBidAmount - teamTrick - teamSing;
    if (gap > 0) {
      const avgPerTrick = Math.round(gap / Math.max(1, tricksRemaining));
      L.push(`→ YOUR TEAM BID ${state.currentBidAmount}: need ${gap} more pts in ${tricksRemaining} tricks (~${avgPerTrick}/trick)`);
    } else {
      L.push(`→ YOUR TEAM BID ${state.currentBidAmount}: MADE IT! (${teamTrick + teamSing} >= ${state.currentBidAmount}). Play safe, protect the lead.`);
    }
  } else {
    const oppGap = state.currentBidAmount - oppTrick - oppSing;
    if (oppGap > 0) {
      L.push(`→ OPPONENTS BID ${state.currentBidAmount}: they need ${oppGap} more. Try to prevent them!`);
    } else {
      L.push(`→ OPPONENTS BID ${state.currentBidAmount}: they already made it (${oppTrick + oppSing}). Minimize their surplus.`);
    }
  }
  L.push('');

  // ── Current trick ──
  if (state.currentTrick.cards.length === 0) {
    L.push('YOU ARE LEADING THIS TRICK — your card sets the lead suit.');
  } else {
    L.push(`CURRENT TRICK (lead: ${state.currentTrick.leadSeat}):`);
    for (const tc of state.currentTrick.cards) {
      const rel = tc.seat === seat ? 'you' : tc.seat === partner ? 'partner' : 'opp';
      L.push(`  ${tc.seat}(${rel}): ${cardStr(tc.card)} (${CARD_POINTS[tc.card.rank]}pts, power=${CARD_POWER[tc.card.rank]})`);
    }
    const winner = determineTrickWinner(
      { cards: state.currentTrick.cards, leadSeat: state.currentTrick.leadSeat },
      state.trumpSuit
    );
    const winTeam = SEAT_TEAM[winner.seat] === myTeam ? 'YOUR TEAM' : 'OPPONENTS';
    L.push(`  → Currently winning: ${winner.seat} (${winTeam})`);

    // How many players still to play after us
    const playedSeats = new Set(state.currentTrick.cards.map(tc => tc.seat));
    const remaining = SEAT_ORDER.filter(s => !playedSeats.has(s) && s !== seat);
    if (remaining.length > 0) {
      L.push(`  Still to play after you: ${remaining.join(', ')}`);
    }
  }
  L.push('');

  // ── My hand ──
  L.push(`YOUR HAND (${hand.length} cards):`);
  for (const suit of Object.values(Suit)) {
    const cards = tracker.myHandBySuit.get(suit)!;
    if (cards.length === 0) continue;
    const isTrump = suit === state.trumpSuit;
    const cardList = cards.map(c => `${c.rank}(${CARD_POINTS[c.rank]}pts,pw${CARD_POWER[c.rank]})`).join(', ');
    L.push(`  ${suit}${isTrump ? ' [TRUMP]' : ''}: ${cardList}`);
  }
  L.push('');

  // ── Card tracker: unseen ──
  L.push('UNSEEN CARDS (in opponents/partner hands):');
  for (const suit of Object.values(Suit)) {
    const unseen = tracker.unseenBySuit.get(suit)!;
    const isTrump = suit === state.trumpSuit;
    if (unseen.length === 0) {
      L.push(`  ${suit}${isTrump ? ' [T]' : ''}: all accounted for`);
      continue;
    }
    const list = unseen.map(c => {
      if (c.rank === 1) return '1(ACE!)';
      if (c.rank === 3) return '3(★!)';
      if (c.rank === 12) return '12(K)';
      if (c.rank === 11) return '11(H)';
      return `${c.rank}`;
    }).join(', ');
    L.push(`  ${suit}${isTrump ? ' [T]' : ''}: [${list}] — ${unseen.length} unseen`);
  }
  L.push('');

  // ── Known voids ──
  const voidLines: string[] = [];
  for (const [voidSeat, voidSuits] of knownVoids) {
    if (voidSeat === seat || voidSuits.size === 0) continue;
    const rel = voidSeat === partner ? 'partner' : 'opponent';
    for (const suit of voidSuits) {
      const consequence = suit === state.trumpSuit
        ? 'void in TRUMP — cannot cut!'
        : 'will trump or discard if this suit is led';
      voidLines.push(`  ${voidSeat}(${rel}): void in ${suit} — ${consequence}`);
    }
  }
  if (voidLines.length > 0) {
    L.push('KNOWN VOIDS (observed from play):');
    L.push(...voidLines);
    L.push('');
  }

  // ── Trick history ──
  if (state.completedTricks.length > 0) {
    L.push('TRICK HISTORY:');
    for (let i = 0; i < state.completedTricks.length; i++) {
      const trick = state.completedTricks[i];
      const winner = determineTrickWinner(trick, state.trumpSuit);
      const trickPts = calculateTrickPoints(trick);
      const winTeam = SEAT_TEAM[winner.seat] === myTeam ? 'us' : 'them';
      const plays = trick.cards.map(tc => {
        const rel = tc.seat === seat ? '→' : tc.seat === partner ? '♦' : '•';
        return `${rel}${tc.seat}:${cardStr(tc.card)}`;
      }).join(' ');
      L.push(`  T${i + 1}: ${plays} → ${winner.seat} wins ${trickPts}pts(${winTeam})`);
    }
    L.push('');
  }

  // ── Bidding inference (carried from round start) ──
  if (state.bids.length > 0) {
    const bidLines = analyzeBiddingHistory(state, seat);
    L.push(...bidLines);
    L.push('');
  }

  // ── Strategic warnings ──
  const warnings: string[] = [];

  for (const suit of Object.values(Suit)) {
    const unseen = tracker.unseenBySuit.get(suit)!;
    const myCards = tracker.myHandBySuit.get(suit)!;

    // Warn about leading 3 when ace is still out
    const unseenAce = unseen.some(c => c.rank === 1);
    const my3 = myCards.some(c => c.rank === 3);
    if (my3 && unseenAce && state.currentTrick.cards.length === 0) {
      warnings.push(`3 of ${suit} is VULNERABLE: ace of ${suit} is still unseen! Don't lead it.`);
    }

    // Warn about 3 being strongest now (ace already played)
    const myAce = myCards.some(c => c.rank === 1);
    const aceWasPlayed = tracker.played.has(`${suit}-1`);
    if (my3 && aceWasPlayed && !myAce) {
      warnings.push(`3 of ${suit} is NOW THE STRONGEST ${suit} card — ace was already played.`);
    }

    // Warn about opponent voids when leading
    if (state.currentTrick.cards.length === 0 && suit !== state.trumpSuit && myCards.length > 0) {
      for (const [voidSeat, voidSuits] of knownVoids) {
        if (SEAT_TEAM[voidSeat] !== myTeam && voidSuits.has(suit)) {
          warnings.push(`Leading ${suit} is RISKY: ${voidSeat}(opponent) is void — will trump!`);
        }
      }
    }
  }

  // Partner winning — dump low
  if (state.currentTrick.cards.length >= 1) {
    const winner = determineTrickWinner(
      { cards: state.currentTrick.cards, leadSeat: state.currentTrick.leadSeat },
      state.trumpSuit
    );
    if (SEAT_TEAM[winner.seat] === myTeam && winner.seat !== seat) {
      warnings.push('Partner is winning → play your LOWEST value card to save strong ones.');
    }
  }

  // Singing still possible
  if (!state.singingDone && state.trumpSuit && state.biddingTeam === myTeam) {
    const canStillSing = getSingableSuits(hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
    if (canStillSing.length > 0) {
      warnings.push(`You can still sing: ${canStillSing.join(', ')} — win a trick to trigger singing! Protect your king+horse.`);
    }
  }

  // Last trick bonus
  if (tricksRemaining === 1) {
    warnings.push('LAST TRICK: +10 bonus points to the winner!');
  }

  if (warnings.length > 0) {
    L.push('STRATEGIC ANALYSIS:');
    for (const w of warnings) L.push(`  • ${w}`);
    L.push('');
  }

  // ── Heuristic recommendation (from enhanced bot logic) ──
  const heuristicBest = chooseCard(state, seat, 'hard');
  if (heuristicBest) {
    L.push(`HEURISTIC RECOMMENDATION: ${cardStr(heuristicBest)} — This is the analytically optimal play. Only deviate if you have a strong strategic reason.`);
  }

  // ── Valid plays ──
  L.push(`VALID PLAYS: ${validPlays.map(c => `${cardStr(c)}(${CARD_POINTS[c.rank]}pts,pw${CARD_POWER[c.rank]})`).join(', ')}`);

  return L.join('\n');
}
