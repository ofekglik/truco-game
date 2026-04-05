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

// ─── Cost Tracking ─────────────────────────────────────────────────────────

interface CostEntry {
  inputTokens: number;
  outputTokens: number;
  cost: number; // USD
}

const roomCosts = new Map<string, CostEntry>();

// Haiku pricing (per million tokens)
const HAIKU_INPUT_COST = 0.25;   // $0.25 per 1M input tokens
const HAIKU_OUTPUT_COST = 1.25;  // $1.25 per 1M output tokens

export function getRoomCost(roomCode: string): CostEntry {
  return roomCosts.get(roomCode) || { inputTokens: 0, outputTokens: 0, cost: 0 };
}

export function resetRoomCost(roomCode: string): void {
  roomCosts.delete(roomCode);
}

function addCost(roomCode: string, inputTokens: number, outputTokens: number): CostEntry {
  const existing = getRoomCost(roomCode);
  const newInputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_COST;
  const newOutputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_COST;
  const updated: CostEntry = {
    inputTokens: existing.inputTokens + inputTokens,
    outputTokens: existing.outputTokens + outputTokens,
    cost: existing.cost + newInputCost + newOutputCost,
  };
  roomCosts.set(roomCode, updated);
  return updated;
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
1. BIDDING: Players bid on how many points their team will score. Minimum bid is 70, increments of 10. Pass (0) to drop out. Last bidder wins.
2. TRUMP DECLARATION: Bid winner declares trump suit.
3. SINGING: Bidding team members declare "cante" (king+horse of same suit). Trump cante = 40pts, non-trump = 20pts.
   - Bid 80: no trump singing allowed, max 20pts singing.
   - Bid 90-99: max 40pts singing.
   - Bid 100+: no singing cap.
4. TRICK PLAY: 10 tricks. Must follow lead suit. If can't follow, must play trump if possible. Must beat current highest card of led suit (overbeat rule). If trumping, must overtrump if possible.
5. SCORING: Bidding team must reach their bid amount (trick points + singing points). If they fall short, opponents get ALL points (trick + singing + bid amount).

STRATEGY TIPS:
- Aces (rank 1) are strongest and worth 11pts each — leading with them is often safe.
- 3s (rank 3) are second strongest and worth 10pts — powerful follow-up to aces.
- Voids (no cards in a suit) let you cut with trumps — very valuable.
- When partner is winning, dump your lowest card.
- When leading, lead from short non-trump suits to set up future cuts.
- Count points to know if you're on track to make the bid.

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
    const minBid = Math.max(state.currentBidAmount + 10, 70);

    const userPrompt = `${gameContext}

${mcAnalysis}

Current phase: BIDDING
Minimum bid: ${minBid} (increments of 10, max 230)
You can pass (respond with 0) or bid.

Based on your hand strength, the Monte Carlo analysis, and the bidding history, what should you bid?
Respond with ONLY a number (the bid amount, or 0 to pass).`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, result.inputTokens, result.outputTokens);

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
    addCost(roomCode, result.inputTokens, result.outputTokens);

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
    addCost(roomCode, result.inputTokens, result.outputTokens);

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
