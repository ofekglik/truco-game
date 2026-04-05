/**
 * Bot Player System
 * Creates virtual players that auto-join rooms and play valid moves.
 * Uses strategy.ts for difficulty-based decision making.
 * Uses legendaryBot.ts for LLM-powered legendary difficulty.
 */

import { GameState, GamePhase, SeatPosition, SEAT_ORDER, SEAT_TEAM, Suit } from '../engine/types.js';
import {
  placeBid, declareTrump, singCante, doneSinging, chooseSinger, playCard, nextRound
} from '../engine/game.js';
import { Room } from '../rooms/roomManager.js';
import {
  BotDifficulty,
  chooseBid,
  chooseTrump,
  chooseSinging,
  chooseSingerChoice,
  chooseCard
} from './strategy.js';
import {
  legendaryChooseBid,
  legendaryChooseTrump,
  legendaryChooseSinging,
  legendaryChooseSingerChoice,
  legendaryChooseCard,
} from './legendaryBot.js';

export type FullBotDifficulty = BotDifficulty | 'legendary';

const BOT_NAMES: Record<FullBotDifficulty, string[]> = {
  easy: ['בוט קל 🟢', 'בוט קל 🌱', 'בוט קל 🍀'],
  medium: ['בוט בינוני 🟡', 'בוט בינוני ⚡', 'בוט בינוני 🔥'],
  hard: ['בוט קשה 🔴', 'בוט קשה 🧠', 'בוט קשה 💀'],
  legendary: ['בוט אגדי 🌟', 'בוט אגדי 👑', 'בוט אגדי 💎'],
};

const BOT_AVATARS: Record<FullBotDifficulty, string[]> = {
  easy: ['🤖', '🦾', '🧩'],
  medium: ['🤖', '🦾', '🧩'],
  hard: ['🤖', '🦾', '🧩'],
  legendary: ['🌟', '👑', '💎'],
};

export interface BotInstance {
  seat: SeatPosition;
  name: string;
  avatar: string;
  difficulty: FullBotDifficulty;
}

const roomBots = new Map<string, BotInstance[]>();

/**
 * Add bot players to fill empty seats in a room.
 * Returns the bots that were added.
 */
export function addBotsToRoom(room: Room, difficulty: FullBotDifficulty = 'medium'): BotInstance[] {
  const bots: BotInstance[] = [];
  let botIdx = 0;
  const names = BOT_NAMES[difficulty];
  const avatars = BOT_AVATARS[difficulty];

  for (const seat of SEAT_ORDER) {
    if (!room.state.players[seat] && botIdx < names.length) {
      const bot: BotInstance = {
        seat,
        name: names[botIdx],
        avatar: avatars[botIdx],
        difficulty,
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

  // Merge with any existing bots (in case some seats were already filled)
  const existing = roomBots.get(room.code) || [];
  roomBots.set(room.code, [...existing, ...bots]);
  return bots;
}

/**
 * Add a single bot to a specific seat.
 * Returns the bot if added, null if seat is occupied.
 */
export function addBotToSeat(room: Room, seat: SeatPosition, difficulty: FullBotDifficulty = 'medium'): BotInstance | null {
  if (room.state.players[seat]) return null; // seat occupied

  const existing = roomBots.get(room.code) || [];
  const botIdx = existing.length;
  const names = BOT_NAMES[difficulty];
  const avatars = BOT_AVATARS[difficulty];

  const bot: BotInstance = {
    seat,
    name: names[botIdx % names.length],
    avatar: avatars[botIdx % avatars.length],
    difficulty,
  };

  room.state.players[seat] = {
    id: `bot-${seat}-${Date.now()}`,
    name: bot.name,
    seat,
    hand: [],
    connected: true,
    avatar: bot.avatar,
  };

  const fakeSid = `bot-${seat}-${Date.now()}`;
  room.socketToSeat.set(fakeSid, seat);
  room.seatToSocket.set(seat, fakeSid);

  roomBots.set(room.code, [...existing, bot]);
  return bot;
}

/**
 * Remove a single bot from a specific seat.
 * Returns true if a bot was removed.
 */
export function removeBotFromSeat(room: Room, seat: SeatPosition): boolean {
  const bots = roomBots.get(room.code);
  if (!bots) return false;

  const botIndex = bots.findIndex(b => b.seat === seat);
  if (botIndex === -1) return false;

  // Remove from game state
  room.state.players[seat] = null;

  // Remove from socket maps
  const entriesToRemove: string[] = [];
  for (const [sid, s] of room.socketToSeat.entries()) {
    if (s === seat && sid.startsWith('bot-')) entriesToRemove.push(sid);
  }
  for (const sid of entriesToRemove) {
    room.socketToSeat.delete(sid);
  }
  room.seatToSocket.delete(seat);

  // Remove from bots list
  bots.splice(botIndex, 1);
  if (bots.length === 0) roomBots.delete(room.code);
  else roomBots.set(room.code, bots);

  return true;
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
 * Check if a seat is a legendary bot
 */
export function isLegendaryBotSeat(roomCode: string, seat: SeatPosition): boolean {
  const bots = roomBots.get(roomCode);
  if (!bots) return false;
  const bot = bots.find(b => b.seat === seat);
  return bot?.difficulty === 'legendary';
}

/**
 * Get the difficulty of a bot at a given seat
 */
function getBotDifficulty(roomCode: string, seat: SeatPosition): FullBotDifficulty {
  const bots = roomBots.get(roomCode);
  if (!bots) return 'medium';
  const bot = bots.find(b => b.seat === seat);
  return bot?.difficulty || 'medium';
}

/**
 * Check if room has any legendary bots
 */
export function roomHasLegendaryBots(roomCode: string): boolean {
  const bots = roomBots.get(roomCode);
  if (!bots) return false;
  return bots.some(b => b.difficulty === 'legendary');
}

/**
 * Execute bot turn (sync — for non-legendary bots).
 * Returns true if a bot acted (caller should broadcast state).
 */
export function executeBotTurn(room: Room): boolean {
  const state = room.state;
  const currentSeat = state.currentTurnSeat;

  if (!isBotSeat(room.code, currentSeat)) return false;

  // Legendary bots use the async path
  if (isLegendaryBotSeat(room.code, currentSeat)) return false;

  const player = state.players[currentSeat];
  if (!player) return false;

  const difficulty = getBotDifficulty(room.code, currentSeat) as BotDifficulty;

  switch (state.phase) {
    case GamePhase.BIDDING:
      return botBid(state, currentSeat, difficulty);

    case GamePhase.TRUMP_DECLARATION:
      return botDeclareTrump(state, currentSeat, difficulty);

    case GamePhase.SINGING:
      return botSing(state, currentSeat, difficulty);

    case GamePhase.TRICK_PLAY:
      return botPlayCard(state, currentSeat, difficulty);

    case GamePhase.ROUND_SCORING:
      nextRound(state);
      return true;

    default:
      return false;
  }
}

/**
 * Execute legendary bot turn (async — calls LLM API).
 * Returns true if a bot acted.
 */
export async function executeLegendaryBotTurn(room: Room): Promise<boolean> {
  const state = room.state;
  const currentSeat = state.currentTurnSeat;

  if (!isLegendaryBotSeat(room.code, currentSeat)) return false;

  const player = state.players[currentSeat];
  if (!player) return false;

  switch (state.phase) {
    case GamePhase.BIDDING: {
      const amount = await legendaryChooseBid(state, currentSeat, room.code);
      placeBid(state, currentSeat, amount);
      return true;
    }

    case GamePhase.TRUMP_DECLARATION: {
      const suit = await legendaryChooseTrump(state, currentSeat, room.code);
      declareTrump(state, currentSeat, suit);
      return true;
    }

    case GamePhase.SINGING: {
      const suit = await legendaryChooseSinging(state, currentSeat, room.code);
      if (suit) {
        singCante(state, currentSeat, suit);
      } else {
        doneSinging(state, currentSeat);
      }
      return true;
    }

    case GamePhase.TRICK_PLAY: {
      const card = await legendaryChooseCard(state, currentSeat, room.code);
      if (!card) {
        console.log(`[legendary] WARNING: No valid card for ${currentSeat}`);
        return false;
      }
      playCard(state, currentSeat, card.id);
      return true;
    }

    case GamePhase.ROUND_SCORING:
      nextRound(state);
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

  const difficulty = getBotDifficulty(room.code, buyer);
  if (difficulty === 'legendary') {
    // For legendary, still use hard heuristic (fast, no API call needed)
    const choice = chooseSingerChoice(state, buyer, 'hard');
    chooseSinger(state, buyer, choice);
  } else {
    const choice = chooseSingerChoice(state, buyer, difficulty as BotDifficulty);
    chooseSinger(state, buyer, choice);
  }
  return true;
}

function botBid(state: GameState, seat: SeatPosition, difficulty: BotDifficulty): boolean {
  const amount = chooseBid(state, seat, difficulty);
  placeBid(state, seat, amount);
  return true;
}

function botDeclareTrump(state: GameState, seat: SeatPosition, difficulty: BotDifficulty): boolean {
  const suit = chooseTrump(state, seat, difficulty);
  declareTrump(state, seat, suit);
  return true;
}

function botSing(state: GameState, seat: SeatPosition, difficulty: BotDifficulty): boolean {
  const suit = chooseSinging(state, seat, difficulty);
  if (suit) {
    singCante(state, seat, suit);
    return true;
  }
  doneSinging(state, seat);
  return true;
}

function botPlayCard(state: GameState, seat: SeatPosition, difficulty: BotDifficulty): boolean {
  const card = chooseCard(state, seat, difficulty);
  if (!card) {
    console.log(`[bot] WARNING: No valid card for ${seat}, hand has ${state.players[seat]?.hand.length} cards`);
    return false;
  }
  playCard(state, seat, card.id);
  return true;
}

/**
 * Remove bots from a room (cleanup)
 */
export function removeBotsFromRoom(roomCode: string): void {
  roomBots.delete(roomCode);
}
