/**
 * Bot Player System
 * Creates virtual players that auto-join rooms and play valid moves.
 * Activated via /api/bots?room=CODE or when DEV_MODE=true.
 */

import { GameState, GamePhase, SeatPosition, SEAT_ORDER, SEAT_TEAM, Suit } from '../engine/types.js';
import {
  placeBid, declareTrump, singCante, doneSinging, chooseSinger, playCard, resolveTrick, startRound
} from '../engine/game.js';
import { getValidPlays } from '../engine/tricks.js';
import { getSingableSuits } from '../engine/singing.js';
import { Room } from '../rooms/roomManager.js';

const BOT_NAMES = ['בוט אלפא', 'בוט בטא', 'בוט גמא'];
const BOT_AVATARS = ['🤖', '🦾', '🧠'];

interface BotInstance {
  seat: SeatPosition;
  name: string;
  avatar: string;
}

const roomBots = new Map<string, BotInstance[]>();

/**
 * Add bot players to fill empty seats in a room.
 * Returns the bots that were added.
 */
export function addBotsToRoom(room: Room): BotInstance[] {
  const bots: BotInstance[] = [];
  let botIdx = 0;

  for (const seat of SEAT_ORDER) {
    if (!room.state.players[seat] && botIdx < BOT_NAMES.length) {
      const bot: BotInstance = {
        seat,
        name: BOT_NAMES[botIdx],
        avatar: BOT_AVATARS[botIdx],
      };

      room.state.players[seat] = {
        id: `bot-${seat}-${Date.now()}`,
        name: bot.name,
        seat,
        hand: [],
        connected: true,
        avatar: bot.avatar,
      };

      // Add to socket maps with fake socket IDs
      const fakeSid = `bot-${seat}-${Date.now()}`;
      room.socketToSeat.set(fakeSid, seat);
      room.seatToSocket.set(seat, fakeSid);

      bots.push(bot);
      botIdx++;
    }
  }

  roomBots.set(room.code, bots);
  return bots;
}

/**
 * Check if a seat is a bot
 */
export function isBotSeat(roomCode: string, seat: SeatPosition): boolean {
  const bots = roomBots.get(roomCode);
  if (!bots) return false;
  return bots.some(b => b.seat === seat);
}

/**
 * Execute bot turn if it's a bot's turn.
 * Returns true if a bot acted (caller should broadcast state).
 */
export function executeBotTurn(room: Room): boolean {
  const state = room.state;
  const currentSeat = state.currentTurnSeat;

  if (!isBotSeat(room.code, currentSeat)) return false;

  const player = state.players[currentSeat];
  if (!player) return false;

  switch (state.phase) {
    case GamePhase.BIDDING:
      return botBid(state, currentSeat);

    case GamePhase.TRUMP_DECLARATION:
      return botDeclareTrump(state, currentSeat);

    case GamePhase.SINGING:
      return botSing(state, currentSeat, room.code);

    case GamePhase.TRICK_PLAY:
      return botPlayCard(state, currentSeat);

    case GamePhase.ROUND_SCORING:
      // Auto-advance to next round
      startRound(state);
      return true;

    default:
      return false;
  }
}

/**
 * Handle singing choice if the buyer is a bot
 */
export function executeBotSingingChoice(room: Room): boolean {
  const state = room.state;
  if (!state.singingChoicePending) return false;

  const buyer = state.currentBidWinner;
  if (!buyer || !isBotSeat(room.code, buyer)) return false;

  // Bot always chooses to sing itself
  chooseSinger(state, buyer, 'self');
  return true;
}

function botBid(state: GameState, seat: SeatPosition): boolean {
  // Simple strategy: bid if hand looks strong, else pass
  const player = state.players[seat]!;
  const hand = player.hand;

  // Count high cards (aces and 3s)
  const highCards = hand.filter(c => c.rank === 1 || c.rank === 3).length;

  // Bid if we have 3+ high cards and current bid is low
  if (highCards >= 3 && state.currentBidAmount < 90) {
    const bidAmount = Math.max(state.currentBidAmount + 10, 70);
    if (bidAmount <= 100) {
      placeBid(state, seat, bidAmount);
      return true;
    }
  }

  // Otherwise pass
  placeBid(state, seat, 0);
  return true;
}

function botDeclareTrump(state: GameState, seat: SeatPosition): boolean {
  const player = state.players[seat]!;
  const hand = player.hand;

  // Count cards per suit, pick the suit with most cards
  const suitCounts: Record<string, number> = {};
  for (const suit of Object.values(Suit)) {
    suitCounts[suit] = hand.filter(c => c.suit === suit).length;
  }

  const bestSuit = Object.entries(suitCounts)
    .sort((a, b) => b[1] - a[1])[0][0] as Suit;

  declareTrump(state, seat, bestSuit);
  return true;
}

function botSing(state: GameState, seat: SeatPosition, roomCode: string): boolean {
  const player = state.players[seat]!;

  // Check if we can sing
  if (state.biddingTeam && SEAT_TEAM[seat] === state.biddingTeam) {
    const singable = getSingableSuits(
      player.hand,
      state.trumpSuit!,
      state.currentBidAmount,
      state.cantes,
      seat,
      state.biddingTeam
    );

    if (singable.length > 0) {
      singCante(state, seat, singable[0]);
      return true;
    }
  }

  // Done singing
  doneSinging(state, seat);
  return true;
}

function botPlayCard(state: GameState, seat: SeatPosition): boolean {
  const player = state.players[seat]!;
  const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);

  if (validPlays.length === 0) return false;

  // Pick a random valid card
  const card = validPlays[Math.floor(Math.random() * validPlays.length)];
  playCard(state, seat, card.id);
  return true;
}

/**
 * Remove bots from a room (cleanup)
 */
export function removeBotsFromRoom(roomCode: string): void {
  roomBots.delete(roomCode);
}
