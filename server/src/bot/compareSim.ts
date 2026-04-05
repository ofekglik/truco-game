#!/usr/bin/env tsx
/**
 * Comparative Bot Simulator — Tests each difficulty against itself
 * to measure relative strength via fall rate, points wasted, and game metrics.
 */

import {
  GameState, GamePhase, SeatPosition, SEAT_ORDER, Card, Suit,
  CapoType, TeamId, SEAT_TEAM, CARD_POINTS, CARD_POWER, Rank
} from '../engine/types.js';
import { determineTrickWinner, calculateTrickPoints } from '../engine/scoring.js';
import { getValidPlays, getNextSeat } from '../engine/tricks.js';
import { getSingableSuits, canSingCante } from '../engine/singing.js';
import { chooseBid, chooseTrump, chooseSinging, chooseSingerChoice, chooseCard, BotDifficulty } from './strategy.js';
import {
  startRound, placeBid, declareTrump, singCante,
  chooseSinger as gameChooseSinger, doneSinging,
  playCard as gamePlayCard, resolveTrick, nextRound, createInitialState
} from '../engine/game.js';

const GAMES_PER_LEVEL = 30;
const TARGET = 1000;

function initState(): GameState {
  const state = createInitialState();
  state.targetScore = TARGET;
  for (const seat of SEAT_ORDER) {
    state.players[seat] = {
      id: `bot-${seat}`, name: `Bot-${seat}`, seat, hand: [], connected: true, avatar: '',
    };
  }
  return state;
}

function runGame(difficulty: BotDifficulty): { rounds: number; falls: number; winner: TeamId; scores: { team1: number; team2: number } } {
  let state = initState();
  let falls = 0;
  let safety = 0;

  while (state.scores.team1 < TARGET && state.scores.team2 < TARGET && safety < 200) {
    safety++;
    state = startRound(state);

    // Technical capo
    if (state.phase === GamePhase.TRUMP_DECLARATION && state.capoType === CapoType.TECHNICAL) {
      const trump = chooseTrump(state, state.currentTurnSeat, difficulty);
      state = declareTrump(state, state.currentTurnSeat, trump);
    }

    // Bidding
    let bl = 0;
    while (state.phase === GamePhase.BIDDING && bl < 100) {
      bl++;
      const seat = state.currentTurnSeat;
      const bid = chooseBid(state, seat, difficulty);
      state = placeBid(state, seat, bid === 0 ? 0 : bid);
    }
    if (state.phase === GamePhase.BIDDING) continue;

    // Trump
    if (state.phase === GamePhase.TRUMP_DECLARATION) {
      state = declareTrump(state, state.currentTurnSeat, chooseTrump(state, state.currentTurnSeat, difficulty));
    }

    // Play
    let loops = 0;
    while ((state.phase === GamePhase.TRICK_PLAY || state.phase === GamePhase.SINGING) && loops < 200) {
      loops++;
      if (state.phase === GamePhase.SINGING) {
        let sl = 0;
        while (state.phase === GamePhase.SINGING && sl < 10) {
          sl++;
          if (state.singingChoicePending && state.currentBidWinner) {
            state = gameChooseSinger(state, state.currentBidWinner, chooseSingerChoice(state, state.currentBidWinner, difficulty));
          } else {
            const s = chooseSinging(state, state.currentTurnSeat, difficulty);
            if (s) state = singCante(state, state.currentTurnSeat, s);
            else state = doneSinging(state, state.currentTurnSeat);
          }
        }
        continue;
      }
      if (state.phase !== GamePhase.TRICK_PLAY) break;
      const seat = state.currentTurnSeat;
      const card = chooseCard(state, seat, difficulty);
      if (!card) break;
      state = gamePlayCard(state, seat, card.id);
      if (state.trickPendingResolution) state = resolveTrick(state);
    }

    if (state.phase === GamePhase.ROUND_SCORING || state.phase === GamePhase.GAME_OVER) {
      const lr = state.roundHistory[state.roundHistory.length - 1];
      if (lr?.biddingTeamFell) falls++;
      if (state.phase === GamePhase.GAME_OVER) break;
      state = nextRound(state);
    }
  }

  return {
    rounds: state.roundHistory.length,
    falls,
    winner: state.scores.team1 >= TARGET ? 'team1' : 'team2',
    scores: { ...state.scores },
  };
}

async function main() {
  console.log(`\n📊 Comparative Bot Simulation — ${GAMES_PER_LEVEL} games per difficulty, target ${TARGET}`);
  console.log('═'.repeat(70));

  for (const diff of ['easy', 'medium', 'hard'] as BotDifficulty[]) {
    let totalRounds = 0;
    let totalFalls = 0;
    let totalGames = 0;
    const scores: number[] = [];

    for (let i = 0; i < GAMES_PER_LEVEL; i++) {
      const result = runGame(diff);
      totalRounds += result.rounds;
      totalFalls += result.falls;
      totalGames++;
      scores.push(Math.max(result.scores.team1, result.scores.team2));
    }

    const avgRounds = totalRounds / totalGames;
    const fallRate = totalFalls / totalRounds;
    const avgWinScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    console.log(`\n${diff.toUpperCase()}:`);
    console.log(`  Avg rounds/game: ${avgRounds.toFixed(1)}`);
    console.log(`  Fall rate: ${(fallRate * 100).toFixed(1)}%`);
    console.log(`  Total falls: ${totalFalls}/${totalRounds} rounds`);
    console.log(`  Avg winning score: ${avgWinScore.toFixed(0)}`);
  }
}

main().catch(console.error);
