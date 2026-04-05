/**
 * Legendary Bot — Haiku LLM-powered bot player
 * Uses Anthropic's Claude Haiku API with pre-computed Monte Carlo results
 * to make intelligent game decisions.
 *
 * Security: API key and password stored as environment variables only.
 * Never exposed to clients.
 */

import {
  GameState, Card, Suit, SeatPosition, SEAT_ORDER, SEAT_TEAM, TeamId,
  CARD_POINTS, CARD_POWER, Rank, GamePhase, SUIT_NAMES_HE
} from '../engine/types.js';
import { getValidPlays } from '../engine/tricks.js';
import { getSingableSuits } from '../engine/singing.js';
import { chooseBid, chooseTrump, chooseSinging, chooseSingerChoice, chooseCard } from './strategy.js';

// ─── Cost Tracking (per-bot, per-seat) ─────────────────────────────────────

export interface BotCostEntry {
  seat: SeatPosition;
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD
  calls: number;
}

export interface RoomCostData {
  bots: Record<string, BotCostEntry>; // keyed by seat
  total: { inputTokens: number; outputTokens: number; cost: number; calls: number };
}

// Map<roomCode, RoomCostData>
const roomCosts = new Map<string, RoomCostData>();

// Haiku pricing (per million tokens)
const HAIKU_INPUT_COST = 0.25;   // $0.25 per 1M input tokens
const HAIKU_OUTPUT_COST = 1.25;  // $1.25 per 1M output tokens

export function getRoomCost(roomCode: string): RoomCostData {
  return roomCosts.get(roomCode) || {
    bots: {},
    total: { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 },
  };
}

export function resetRoomCost(roomCode: string): void {
  roomCosts.delete(roomCode);
}

function addCost(roomCode: string, seat: SeatPosition, inputTokens: number, outputTokens: number): RoomCostData {
  const data = getRoomCost(roomCode);
  const callCost = (inputTokens / 1_000_000) * HAIKU_INPUT_COST + (outputTokens / 1_000_000) * HAIKU_OUTPUT_COST;

  // Per-bot entry
  const existing = data.bots[seat] || { seat, inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
  existing.inputTokens += inputTokens;
  existing.outputTokens += outputTokens;
  existing.cost += callCost;
  existing.calls += 1;
  data.bots[seat] = existing;

  // Room total
  data.total.inputTokens += inputTokens;
  data.total.outputTokens += outputTokens;
  data.total.cost += callCost;
  data.total.calls += 1;

  roomCosts.set(roomCode, data);
  return data;
}

// ─── Password Validation ───────────────────────────────────────────────────

export function validateLegendaryPassword(password: string): boolean {
  const expected = process.env.LEGENDARY_BOT_PASSWORD;
  if (!expected) return false;
  // Constant-time comparison to prevent timing attacks
  if (password.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < password.length; i++) {
    result |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

export function isLegendaryEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.LEGENDARY_BOT_PASSWORD;
}

// ─── Game Rules System Prompt ──────────────────────────────────────────────

const GAME_RULES_PROMPT = `You are an expert player of "אטו" (Ato), a 4-player trick-taking card game played with a 40-card Spanish deck (suits: oros/זהב, copas/קופז, espadas/ספדה, bastos/שחור; ranks: 1,2,3,4,5,6,7,10,11,12).

CARD VALUES (points): 1=11pts, 3=10pts, 12=4pts, 11=3pts, 10=2pts. Others=0pts.
Total deck points: 120 + 10 (last trick bonus) = 130.

CARD POWER (weakest→strongest): 2,4,5,6,7,10,11,12,3,1

TEAMS: south+north = team1, east+west = team2

GAME FLOW:
1. BIDDING: Players bid how many points their team will score. Minimum bid 70, increments of 10, max 230 (capo).
   - You can BID HIGHER than the current bid to become the new bid winner.
   - You can MATCH the current bid as a "declaration" to signal your partner — this does NOT make you the bid winner; the first player to bid that amount keeps the lead.
   - You can PASS (0) to drop out permanently for this round.
   - Bidding continues until all but the bid winner have passed.
2. TRUMP DECLARATION: The bid winner declares the trump suit.
3. SINGING: The bid winner chooses who sings first (self or partner). Bidding team members declare "cante" if they hold king (12) + horse (11) of the same suit. Trump cante = 40pts, non-trump cante = 20pts.
   - Bid exactly 80: no trump singing, max 20pts total (one non-trump cante only).
   - Bid 90-99: max 40pts total singing (trump and non-trump allowed).
   - Bid 100+: no singing cap.
   After singing is done, trick play begins.
4. TRICK PLAY: 10 tricks of 4 cards each.
   - MUST FOLLOW lead suit if you have cards of that suit.
   - OVERBEAT RULE: If following suit, you must play a card that beats the current highest card of the lead suit — UNLESS trump has already been played in this trick, in which case you just follow suit without needing to beat.
   - If you can't follow lead suit and have trump cards: you MUST play a trump card.
   - OVERTRUMP RULE: If trump is already in the trick, you must play a HIGHER trump if possible. If you cannot beat the existing trump, you may play ANY card from your hand (free play).
   - If you can't follow suit and have no trumps: play any card (free play).
   - Last trick of the round awards a 10-point bonus to the winning team.
5. SCORING: Only the bid amount matters for the score.
   - If the bidding team's total (trick points + singing points) >= their bid: the bidding team scores the bid amount. The opposing team scores 0.
   - If the bidding team falls short: the OPPOSING team scores the bid amount. The bidding team scores 0.
   - Game continues until a team reaches the target score.

STRATEGY TIPS:
- Aces (rank 1) are the strongest card and worth 11pts — leading with them is often safe.
- 3s (rank 3) are second strongest and worth 10pts — powerful follow-up to aces.
- Voids (no cards in a suit) let you cut with trumps — very valuable.
- When your partner is winning the trick, dump your lowest-value card to save strong cards.
- When leading, lead aces from short non-trump suits first (cash points before opponents can cut).
- Count points to know if your team is on track to make the bid.
- Declaration bids (matching current bid) can signal to your partner that you have a strong hand at that level.

You must respond with ONLY the requested action in the exact format specified. No explanations.`;

// ─── State Serialization ───────────────────────────────────────────────────

function suitName(suit: Suit): string {
  return SUIT_NAMES_HE[suit];
}

function cardStr(card: Card): string {
  return `${card.rank}-${suitName(card.suit)}`;
}

function serializeGameState(state: GameState, seat: SeatPosition): string {
  const player = state.players[seat];
  if (!player) return 'ERROR: no player';
  const myTeam = SEAT_TEAM[seat];
  const partner = myTeam === 'team1'
    ? (seat === 'south' ? 'north' : 'south')
    : (seat === 'east' ? 'west' : 'east');

  const lines: string[] = [];
  lines.push(`You are sitting at: ${seat} (${myTeam})`);
  lines.push(`Your partner: ${partner}`);
  lines.push(`Trump suit: ${state.trumpSuit ? suitName(state.trumpSuit) : 'not declared yet'}`);
  lines.push(`Round: ${state.roundNumber}, Trick: ${state.trickNumber}/10`);
  lines.push(`Scores — team1: ${state.scores.team1}, team2: ${state.scores.team2} (target: ${state.targetScore})`);
  lines.push(`Current bid: ${state.currentBidAmount} by ${state.currentBidWinner || 'none'} (${state.biddingTeam || 'none'})`);
  lines.push(`Your hand: ${player.hand.map(cardStr).join(', ')}`);

  // Singing info
  if (state.cantes.length > 0) {
    lines.push(`Cantes declared: ${state.cantes.map(c => `${suitName(c.suit)}${c.isTrump ? '(trump)' : ''} = ${c.points}pts by ${c.seat}`).join(', ')}`);
  }

  // Current trick
  if (state.currentTrick.cards.length > 0) {
    lines.push(`Current trick (lead: ${state.currentTrick.leadSeat}): ${state.currentTrick.cards.map(tc => `${tc.seat}: ${cardStr(tc.card)}`).join(' → ')}`);
  } else if (state.phase === GamePhase.TRICK_PLAY) {
    lines.push(`You are leading this trick.`);
  }

  // Completed tricks summary
  if (state.completedTricks.length > 0) {
    const team1Pts = state.completedTricks.reduce((sum, t) => {
      const winner = t.winnerSeat;
      if (winner && SEAT_TEAM[winner] === 'team1') {
        return sum + t.cards.reduce((s, tc) => s + CARD_POINTS[tc.card.rank], 0);
      }
      return sum;
    }, 0);
    const team2Pts = state.completedTricks.reduce((sum, t) => {
      const winner = t.winnerSeat;
      if (winner && SEAT_TEAM[winner] === 'team2') {
        return sum + t.cards.reduce((s, tc) => s + CARD_POINTS[tc.card.rank], 0);
      }
      return sum;
    }, 0);
    lines.push(`Trick points so far — team1: ${team1Pts}, team2: ${team2Pts}`);
  }

  // Bidding history
  if (state.phase === GamePhase.BIDDING && state.bids.length > 0) {
    lines.push(`Bidding history: ${state.bids.map(b => `${b.seat}: ${b.amount || 'pass'}`).join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Monte Carlo Pre-computation ───────────────────────────────────────────

interface MCResult {
  cardId: string;
  cardStr: string;
  avgPoints: number;
  winRate: number;
}

function precomputeMCForCards(
  validPlays: Card[], state: GameState, seat: SeatPosition
): string {
  // Import and use the hard-mode Monte Carlo internally
  // We'll replicate a lightweight version here to get scores
  const results = validPlays.map(card => ({
    cardId: card.id,
    cardStr: cardStr(card),
    note: `${CARD_POINTS[card.rank]}pts, power ${CARD_POWER[card.rank]}`,
  }));

  // Use the hard chooseCard to get the MC-recommended card
  const mcBest = chooseCard(state, seat, 'hard');

  return `Valid plays with analysis:\n${results.map(r =>
    `  - ${r.cardStr} (${r.note})${mcBest && r.cardId === mcBest.id ? ' ★ Monte Carlo recommends' : ''}`
  ).join('\n')}`;
}

function precomputeMCForBid(state: GameState, seat: SeatPosition): string {
  const hardBid = chooseBid(state, seat, 'hard');
  const medBid = chooseBid(state, seat, 'medium');
  return `Monte Carlo analysis: hard-mode suggests bid ${hardBid || 'pass'}, medium-mode suggests bid ${medBid || 'pass'}`;
}

function precomputeMCForTrump(state: GameState, seat: SeatPosition): string {
  const hardTrump = chooseTrump(state, seat, 'hard');
  const medTrump = chooseTrump(state, seat, 'medium');
  return `Monte Carlo analysis: hard-mode suggests ${suitName(hardTrump)}, medium-mode suggests ${suitName(medTrump)}`;
}

// ─── Anthropic API Call ────────────────────────────────────────────────────

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

async function callHaiku(systemPrompt: string, userPrompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[legendary] Haiku API error ${response.status}:`, errorText);
    throw new Error(`Haiku API error: ${response.status}`);
  }

  const data = await response.json() as AnthropicResponse;
  const text = data.content.find(c => c.type === 'text')?.text || '';
  return {
    text: text.trim(),
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

// ─── Decision Functions ────────────────────────────────────────────────────

/**
 * Legendary bot: choose bid using LLM
 * Falls back to hard-mode strategy on API failure
 */
export async function legendaryChooseBid(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<number> {
  try {
    const gameContext = serializeGameState(state, seat);
    const mcAnalysis = precomputeMCForBid(state, seat);
    const minBid = Math.max(state.currentBidAmount, 70);
    const minHigherBid = Math.max(state.currentBidAmount + 10, 70);

    const userPrompt = `${gameContext}

${mcAnalysis}

Current phase: BIDDING
Current highest bid: ${state.currentBidAmount} by ${state.currentBidWinner || 'nobody'}
You can:
- PASS (respond with 0)
- BID ${state.currentBidAmount > 0 ? state.currentBidAmount : 70} to declare (match current bid, signals strength to partner but does NOT make you the winner)
- BID ${minHigherBid}+ to become the new bid winner (increments of 10, max 230)

Based on your hand strength, the Monte Carlo analysis, and the bidding history, what should you bid?
Respond with ONLY a number (the bid amount, or 0 to pass).`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const parsed = parseInt(result.text.replace(/[^0-9]/g, ''), 10);
    if (isNaN(parsed)) return chooseBid(state, seat, 'hard');
    if (parsed === 0) return 0;
    if (parsed < minBid || parsed > 230 || parsed % 10 !== 0) return chooseBid(state, seat, 'hard');
    return parsed;
  } catch (err) {
    console.error('[legendary] Bid fallback to hard:', err);
    return chooseBid(state, seat, 'hard');
  }
}

/**
 * Legendary bot: choose trump using LLM
 */
export async function legendaryChooseTrump(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<Suit> {
  try {
    const gameContext = serializeGameState(state, seat);
    const mcAnalysis = precomputeMCForTrump(state, seat);
    const player = state.players[seat];
    if (!player) return chooseTrump(state, seat, 'hard');

    // Count cards per suit for the prompt
    const suitCounts = Object.values(Suit).map(s => {
      const cards = player.hand.filter(c => c.suit === s);
      return `${suitName(s)}: ${cards.length} cards (${cards.map(c => c.rank).join(',')})`;
    }).join('\n  ');

    const userPrompt = `${gameContext}

${mcAnalysis}

Current phase: TRUMP DECLARATION — you won the bid!
Your suit distribution:
  ${suitCounts}

Which suit should be trump? Consider: longest suit, high cards in suit, cante potential (king+horse), voids in other suits.
Respond with ONLY the suit name in English: oros, copas, espadas, or bastos`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const suitStr = result.text.toLowerCase().trim();
    const suitMap: Record<string, Suit> = {
      oros: Suit.OROS, copas: Suit.COPAS, espadas: Suit.ESPADAS, bastos: Suit.BASTOS,
    };
    return suitMap[suitStr] || chooseTrump(state, seat, 'hard');
  } catch (err) {
    console.error('[legendary] Trump fallback to hard:', err);
    return chooseTrump(state, seat, 'hard');
  }
}

/**
 * Legendary bot: choose singing using LLM
 */
export async function legendaryChooseSinging(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<Suit | null> {
  // Singing is mechanical — if you have king+horse, you sing. Use hard strategy.
  // No need to waste API calls on this.
  return chooseSinging(state, seat, 'hard');
}

/**
 * Legendary bot: choose singer (self/partner) using LLM
 */
export async function legendaryChooseSingerChoice(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<'self' | 'partner'> {
  // Simple decision, use hard strategy
  return chooseSingerChoice(state, seat, 'hard');
}

/**
 * Legendary bot: choose card to play using LLM + Monte Carlo
 */
export async function legendaryChooseCard(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<Card | null> {
  const player = state.players[seat];
  if (!player) return null;

  const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
  if (validPlays.length === 0) return null;
  if (validPlays.length === 1) return validPlays[0]; // No choice needed, save API call

  try {
    const gameContext = serializeGameState(state, seat);
    const mcAnalysis = precomputeMCForCards(validPlays, state, seat);

    const userPrompt = `${gameContext}

${mcAnalysis}

Current phase: TRICK PLAY
${state.currentTrick.cards.length === 0
  ? 'You are LEADING this trick. Choose wisely — your card sets the lead suit.'
  : `You are FOLLOWING. Lead suit: ${suitName(state.currentTrick.cards[0].card.suit)}`}

Consider: Monte Carlo recommendation, card points at stake, partner position, trump conservation.
Which card should you play?
Respond with ONLY the card in format: rank-suit (e.g. "1-oros" for ace of oros). Use English suit names.`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    // Parse response like "1-oros" or "3-copas"
    const match = result.text.match(/(\d+)\s*[-–]\s*(oros|copas|espadas|bastos)/i);
    if (match) {
      const rank = parseInt(match[1], 10);
      const suit = match[2].toLowerCase();
      const found = validPlays.find(c => c.rank === rank && c.suit === suit);
      if (found) return found;
    }

    // Try matching just the card id format
    const idMatch = result.text.match(/(oros|copas|espadas|bastos)-(\d+)/i);
    if (idMatch) {
      const suit = idMatch[1].toLowerCase();
      const rank = parseInt(idMatch[2], 10);
      const found = validPlays.find(c => c.rank === rank && c.suit === suit);
      if (found) return found;
    }

    console.log(`[legendary] Could not parse card response: "${result.text}", falling back to MC`);
    return chooseCard(state, seat, 'hard');
  } catch (err) {
    console.error('[legendary] Card fallback to hard:', err);
    return chooseCard(state, seat, 'hard');
  }
}
