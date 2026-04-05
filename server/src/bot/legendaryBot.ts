/**
 * Legendary Bot — Haiku LLM-powered bot player
 * Uses Anthropic's Claude Haiku API with rich precomputed context
 * (card tracking, void detection, point counting, strategic analysis)
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
import {
  buildBiddingContext, buildTrumpContext, buildSingerChoiceContext,
  buildSingingContext, buildTrickPlayContext
} from './contextEngine.js';

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

const GAME_RULES_PROMPT = `You are an expert player of "אטו" (Ato), a 4-player trick-taking card game.
40-card Spanish deck. Suits: oros, copas, espadas, bastos. Ranks: 1,2,3,4,5,6,7,10,11,12.
POINTS: 1=11, 3=10, 12=4, 11=3, 10=2, others=0. Total=120 trick + 10 last trick bonus = 130.
POWER (weak→strong): 2,4,5,6,7,10,11,12,3,1
TEAMS: south+north=team1, east+west=team2.

RULES:
- BIDDING: min 70, increments of 10, max 230 (capo). Match current bid = declaration (signals partner). Pass = out.
- TRUMP: bid winner declares trump suit.
- SINGING: after bidding team wins a trick, they can sing cante (king+horse of same suit). Trump cante=40pts, non-trump=20pts. Bid 80: max 20pts, no trump cante. Bid 90-99: max 40pts. Bid 100+: no cap.
- TRICK PLAY: must follow suit. Must overbeat lead suit (unless trump already played in trick). If void: must trump. Must overtrump if possible. Can't overtrump → free play.
- SCORING: bidding team total >= bid → they score bid amount. Otherwise opponents score bid amount.

CRITICAL CARD PLAY RULES (ranked by importance):
1. PARTNER WINNING → play your CHEAPEST card (lowest points: 0pts > 2pts > 3pts > 4pts > 10pts > 11pts).
2. CAN'T WIN → play your CHEAPEST card (lowest points). Never waste valuable cards on lost tricks.
3. CAN WIN → use the CHEAPEST winning card. Never use ace(11pts) if king(4pts) wins. Never use 3(10pts) if 12(4pts) wins.
4. LEADING → Lead aces of non-trump suits FIRST (guaranteed win, cash points).
5. NEVER lead 3 if the ace of that suit is still unseen — the ace WILL capture your 3 (10pts lost).
6. If ace was played, 3 is now strongest — lead it confidently.
7. AVOID leading into suits where opponents are void — they will trump you.
8. Save trumps for cutting (voiding in side suits, then trumping opponent leads).
9. When defending: deny the bidding team points. Every 10pts you save matters.
10. Protect king+horse pairs for singing.

Respond with ONLY the requested action in the exact format specified. No explanations.`;

// ─── Anthropic API Call ────────────────────────────────────────────────────

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds initial delay for rate limits
const MIN_CALL_INTERVAL_MS = 500; // Minimum 500ms between API calls to avoid rate limits
let lastCallTimestamp = 0;

async function callHaiku(systemPrompt: string, userPrompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Throttle: ensure minimum interval between calls
  const now = Date.now();
  const elapsed = now - lastCallTimestamp;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL_MS - elapsed));
  }
  lastCallTimestamp = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

    if (response.ok) {
      const data = await response.json() as AnthropicResponse;
      const text = data.content.find(c => c.type === 'text')?.text || '';
      return {
        text: text.trim(),
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      };
    }

    // Rate limited (429) or overloaded (529) — retry with exponential backoff
    if ((response.status === 429 || response.status === 529) && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('retry-after');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
      console.log(`[legendary] Rate limited (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    const errorText = await response.text();
    console.error(`[legendary] Haiku API error ${response.status}:`, errorText);
    throw new Error(`Haiku API error: ${response.status}`);
  }

  throw new Error('Haiku API: max retries exceeded');
}

// ─── Decision Functions ────────────────────────────────────────────────────

/** Parse a suit name from LLM response */
function parseSuit(text: string): Suit | null {
  const suitMap: Record<string, Suit> = {
    oros: Suit.OROS, copas: Suit.COPAS, espadas: Suit.ESPADAS, bastos: Suit.BASTOS,
  };
  const cleaned = text.toLowerCase().trim();
  return suitMap[cleaned] || null;
}

/** Parse a card (rank-suit) from LLM response, validating against valid plays */
function parseCard(text: string, validPlays: Card[]): Card | null {
  // Strip quotes, asterisks, backticks, and extra whitespace
  const cleaned = text.replace(/[`*"'""'']/g, '').trim();

  // Try "rank-suit" format (e.g., "1-oros", "3-copas") — match anywhere in text
  // Support all dash types: hyphen, en-dash, em-dash, minus sign
  const match = cleaned.match(/(\d+)\s*[-–—−]\s*(oros|copas|espadas|bastos)/i);
  if (match) {
    const rank = parseInt(match[1], 10);
    const suit = match[2].toLowerCase();
    const found = validPlays.find(c => c.rank === rank && c.suit === suit);
    if (found) return found;
  }

  // Try "suit-rank" format (e.g., "oros-1")
  const idMatch = cleaned.match(/(oros|copas|espadas|bastos)\s*[-–—−]\s*(\d+)/i);
  if (idMatch) {
    const suit = idMatch[1].toLowerCase();
    const rank = parseInt(idMatch[2], 10);
    const found = validPlays.find(c => c.rank === rank && c.suit === suit);
    if (found) return found;
  }

  // Try bare "rank suit" without dash (e.g., "1 oros", "ace of oros")
  const spaceMatch = cleaned.match(/(\d+)\s+(oros|copas|espadas|bastos)/i);
  if (spaceMatch) {
    const rank = parseInt(spaceMatch[1], 10);
    const suit = spaceMatch[2].toLowerCase();
    const found = validPlays.find(c => c.rank === rank && c.suit === suit);
    if (found) return found;
  }

  // Last resort: try matching any valid play's rank+suit anywhere in the text
  for (const card of validPlays) {
    if (cleaned.toLowerCase().includes(`${card.rank}`) && cleaned.toLowerCase().includes(card.suit)) {
      return card;
    }
  }

  return null;
}

/**
 * Legendary bot: choose bid using LLM with rich context.
 * Context includes: hand analysis, suit strengths, singing potential, bidding math, MC analysis.
 * Falls back to hard-mode strategy on API failure.
 */
export async function legendaryChooseBid(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<number> {
  try {
    const context = buildBiddingContext(state, seat);
    const minBid = Math.max(state.currentBidAmount, 70);
    const minHigherBid = Math.max(state.currentBidAmount + 10, 70);

    const userPrompt = `${context}

PHASE: BIDDING
Current highest bid: ${state.currentBidAmount} by ${state.currentBidWinner || 'nobody'}
Your options:
- 0 = PASS (drop out of bidding)
- ${state.currentBidAmount > 0 ? state.currentBidAmount : 70} = DECLARATION (match current bid to signal partner — does NOT make you the winner)
- ${minHigherBid}+ = BID HIGHER to become bid winner (increments of 10, max 230)

Think about:
1. COUNT your expected points: aces win ~11pts each. 3s with their ace = safe 10pts. 12s=4pts, 11s=3pts, 10s=2pts.
2. Singing potential adds guaranteed points (trump cante=40, non-trump=20).
3. Your partner typically contributes ~15-25 points.
4. With 3+ aces or 2 aces + singing, bid 80-90. With 1 ace + singing, consider 70-80.
5. With 0-1 aces and no singing potential, PASS.
6. NEVER bid above 100 unless you have 3+ aces AND singing potential.
7. Total available points are only 130. Even a great hand rarely earns more than 110.
8. If partner already bid, they have strength — a declaration shows support.

Respond with ONLY a number (bid amount, or 0 to pass).`;

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
 * Legendary bot: choose trump using LLM with rich context.
 * Context includes: per-suit analysis with pros/cons, singing math, MC analysis.
 */
export async function legendaryChooseTrump(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<Suit> {
  try {
    const context = buildTrumpContext(state, seat);

    const userPrompt = `${context}

Choose the BEST trump suit. Consider:
1. Length (more trumps = more control)
2. High cards (ace, 3 in trump are dominant)
3. Cante potential (king+horse in trump = 40pts singing!)
4. Voids in OTHER suits (let you cut with trump)
5. Math: how many trick points do you need after singing?

Respond with ONLY the suit name: oros, copas, espadas, or bastos`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const suit = parseSuit(result.text);
    return suit || chooseTrump(state, seat, 'hard');
  } catch (err) {
    console.error('[legendary] Trump fallback to hard:', err);
    return chooseTrump(state, seat, 'hard');
  }
}

/**
 * Legendary bot: choose which suit to sing.
 * If only one option, no API call needed. If multiple, uses LLM to pick.
 * Prefers trump cante (40pts) over non-trump (20pts) — but the LLM can reason about caps.
 */
export async function legendaryChooseSinging(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<Suit | null> {
  const player = state.players[seat];
  if (!player || !state.trumpSuit || !state.biddingTeam) return null;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return null;

  const singable = getSingableSuits(
    player.hand, state.trumpSuit, state.currentBidAmount,
    state.cantes, seat, state.biddingTeam
  );
  if (singable.length === 0) return null;
  if (singable.length === 1) return singable[0]; // Only one option, no need for LLM

  // Multiple options — use LLM to decide (e.g., trump 40pts vs non-trump 20pts with caps)
  try {
    const context = buildSingingContext(state, seat);
    const userPrompt = `${context}

Which cante should you sing NOW?
Remember: trump cante = 40pts, non-trump = 20pts. Singing caps may limit future singing.
Respond with ONLY the suit name: ${singable.join(', ')}`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const suit = parseSuit(result.text);
    if (suit && singable.includes(suit)) return suit;
    // Fallback: prefer trump
    return chooseSinging(state, seat, 'hard');
  } catch (err) {
    console.error('[legendary] Singing fallback to hard:', err);
    return chooseSinging(state, seat, 'hard');
  }
}

/**
 * Legendary bot: choose singer (self or partner) using LLM.
 * This is a strategic decision: the LLM reasons about which cante is more valuable,
 * whether it's protected (ace in hand), and singing cap constraints.
 */
export async function legendaryChooseSingerChoice(
  state: GameState, seat: SeatPosition, roomCode: string
): Promise<'self' | 'partner'> {
  try {
    const context = buildSingerChoiceContext(state, seat);
    if (!context) return chooseSingerChoice(state, seat, 'hard');

    const userPrompt = `${context}

Who should sing first: "self" or "partner"?
Respond with ONLY one word: self or partner`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const cleaned = result.text.toLowerCase().trim();
    if (cleaned === 'self' || cleaned === 'partner') return cleaned;
    return chooseSingerChoice(state, seat, 'hard');
  } catch (err) {
    console.error('[legendary] Singer choice fallback to hard:', err);
    return chooseSingerChoice(state, seat, 'hard');
  }
}

/**
 * Legendary bot: choose card to play using LLM with full game context.
 * Context includes: card tracking, void detection, point counting,
 * trick history, strategic warnings, and MC recommendation.
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
    const context = buildTrickPlayContext(state, seat);

    const validPlayStrs = validPlays.map(c => `${c.rank}-${c.suit}`).join(', ');
    const userPrompt = `${context}

${state.currentTrick.cards.length === 0
  ? 'You are LEADING. Your card sets the lead suit for everyone.'
  : `You are FOLLOWING. Lead suit: ${state.currentTrick.cards[0].card.suit}`}

YOUR VALID PLAYS: ${validPlayStrs}
You MUST choose one of the cards listed above. No other card is legal.

Use the card tracker, void info, trick history, and strategic warnings above.
Choose the BEST card considering points at stake, position, and remaining tricks.

Respond with ONLY the card: rank-suit (e.g. "1-oros" for ace of oros)`;

    const result = await callHaiku(GAME_RULES_PROMPT, userPrompt);
    addCost(roomCode, seat, result.inputTokens, result.outputTokens);

    const card = parseCard(result.text, validPlays);
    if (card) return card;

    // Check if it parsed a valid format but the card isn't in valid plays
    const cleaned = result.text.replace(/[`*"'""'']/g, '').trim();
    const anyCardMatch = cleaned.match(/(\d+)\s*[-–—−]\s*(oros|copas|espadas|bastos)/i);
    if (anyCardMatch) {
      console.log(`[legendary] LLM chose ${anyCardMatch[1]}-${anyCardMatch[2]} but it's not in valid plays [${validPlays.map(c => `${c.rank}-${c.suit}`).join(',')}], falling back to heuristic`);
    } else {
      console.log(`[legendary] Could not parse card response: "${result.text}", falling back to heuristic`);
    }
    return chooseCard(state, seat, 'hard');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[legendary] Card API error (falling back to heuristic): ${msg}`);
    return chooseCard(state, seat, 'hard');
  }
}
