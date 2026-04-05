#!/usr/bin/env tsx
/**
 * Bot Simulator — Headless game simulator for strategy analysis
 *
 * Runs N full games with 4 bots, logs every decision, flags bad plays,
 * and outputs aggregate statistics for strategy optimization.
 *
 * Usage: npx tsx server/src/bot/simulator.ts [games=10] [difficulty=hard] [targetScore=1000]
 */

import {
  GameState, GamePhase, SeatPosition, SEAT_ORDER, Card, Suit, Bid,
  Trick, TrickCard, CapoType, TeamId, SEAT_TEAM, CARD_POINTS, CARD_POWER,
  Rank, Cante
} from '../engine/types.js';
import { createDeck, shuffleDeck, dealCards } from '../engine/deck.js';
import { determineTrickWinner, calculateTrickPoints } from '../engine/scoring.js';
import { getValidPlays, getNextSeat } from '../engine/tricks.js';
import { getSingableSuits, canSingCante } from '../engine/singing.js';
import { chooseBid, chooseTrump, chooseSinging, chooseSingerChoice, chooseCard, BotDifficulty } from './strategy.js';
import { startRound, placeBid, declareTrump, singCante, chooseSinger as gameChooseSinger, doneSinging, playCard as gamePlayCard, resolveTrick, nextRound, createInitialState } from '../engine/game.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const NUM_GAMES = parseInt(process.argv[2] || '10', 10);
const DIFFICULTY = (process.argv[3] || 'hard') as BotDifficulty;
const TARGET_SCORE = parseInt(process.argv[4] || '1000', 10);
const VERBOSE = process.argv.includes('--verbose');

// ─── Logging Types ──────────────────────────────────────────────────────────

interface TrickLog {
  trickNumber: number;
  leadSeat: SeatPosition;
  cards: { seat: SeatPosition; card: string; points: number; wasForced: boolean; validOptions: number; allValid: string[] }[];
  winnerSeat: SeatPosition;
  trickPoints: number;
  flags: string[]; // e.g., "WASTE: south played 3-oros(10pts) while losing, had cheaper options"
}

interface RoundLog {
  roundNumber: number;
  dealerSeat: SeatPosition;
  hands: Record<SeatPosition, string[]>;
  bidWinner: SeatPosition | null;
  bidAmount: number;
  trumpSuit: Suit | null;
  cantes: { seat: SeatPosition; suit: Suit; points: number }[];
  tricks: TrickLog[];
  team1TrickPoints: number;
  team2TrickPoints: number;
  team1SingingPoints: number;
  team2SingingPoints: number;
  biddingTeamFell: boolean;
  flags: string[]; // round-level issues
}

interface GameLog {
  gameNumber: number;
  rounds: RoundLog[];
  finalScores: { team1: number; team2: number };
  winner: TeamId;
  totalRounds: number;
}

interface AggregateStats {
  gamesPlayed: number;
  team1Wins: number;
  team2Wins: number;
  avgRoundsPerGame: number;
  totalBadPlays: number;
  badPlaysByType: Record<string, number>;
  avgPointsWasted: number;
  forcedExpensivePlays: number;
  unnecessaryExpensivePlays: number;
  leadingIssues: number;
  followingIssues: number;
  biddingFalls: { team1: number; team2: number };
  totalRounds: number;
}

// ─── Simulator Core ─────────────────────────────────────────────────────────

function initGameState(): GameState {
  const state = createInitialState();
  state.targetScore = TARGET_SCORE;

  // Set up 4 bot players
  for (const seat of SEAT_ORDER) {
    state.players[seat] = {
      id: `bot-${seat}`,
      name: `Bot-${seat}`,
      seat,
      hand: [],
      connected: true,
      avatar: '',
    };
  }

  return state;
}

function cardStr(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function cardPts(card: Card): number {
  return CARD_POINTS[card.rank];
}

function getPartnerSeat(seat: SeatPosition): SeatPosition {
  const partners: Record<SeatPosition, SeatPosition> = {
    south: 'north', north: 'south', east: 'west', west: 'east',
  };
  return partners[seat];
}

/**
 * Analyze a card play for "badness" — identify irrational or suboptimal decisions
 */
function analyzePlay(
  card: Card,
  validPlays: Card[],
  trick: Trick,
  seat: SeatPosition,
  state: GameState
): { flags: string[]; wasForced: boolean; pointsWasted: number } {
  const flags: string[] = [];
  let pointsWasted = 0;

  // If only one valid play, it's forced
  if (validPlays.length === 1) {
    return { flags: [], wasForced: true, pointsWasted: 0 };
  }

  const myTeam = SEAT_TEAM[seat];
  const trumpSuit = state.trumpSuit;

  // Leading — analyze lead choice
  if (trick.cards.length === 0) {
    // Flag: leading a 3 when the ace of that suit hasn't been played yet
    const aceOfSuit = state.completedTricks.some(t =>
      t.cards.some(tc => tc.card.suit === card.suit && tc.card.rank === 1)
    );
    if (card.rank === 3 && !aceOfSuit && card.suit !== trumpSuit) {
      flags.push(`LEAD_3_ACE_OUT: Led ${cardStr(card)}(10pts) but ace of ${card.suit} still unseen — will likely lose it`);
      pointsWasted = 10;
    }

    // Flag: leading low trump early (wasting trump for cutting later)
    if (card.suit === trumpSuit && CARD_POWER[card.rank] < 5 && state.completedTricks.length < 5) {
      const nonTrumps = validPlays.filter(c => c.suit !== trumpSuit);
      if (nonTrumps.length > 0) {
        flags.push(`LEAD_LOW_TRUMP: Led ${cardStr(card)} as trump when non-trump options available — wastes cutting potential`);
      }
    }

    return { flags, wasForced: false, pointsWasted };
  }

  // Following — analyze follow/trump plays
  const currentWinner = determineTrickWinner({ cards: trick.cards, leadSeat: trick.leadSeat }, trumpSuit);
  const partnerIsWinning = SEAT_TEAM[currentWinner.seat] === myTeam;

  // Check if this card wins the trick
  const hypoTrick = { cards: [...trick.cards, { card, seat }], leadSeat: trick.leadSeat };
  const winnerAfter = determineTrickWinner(hypoTrick, trumpSuit);
  const iWin = winnerAfter.seat === seat;

  if (partnerIsWinning) {
    // Partner winning — should dump lowest
    const lowestValue = Math.min(...validPlays.map(c => CARD_POINTS[c.rank]));
    const lowestPower = Math.min(...validPlays.filter(c => CARD_POINTS[c.rank] === lowestValue).map(c => CARD_POWER[c.rank]));

    if (CARD_POINTS[card.rank] > lowestValue) {
      const waste = CARD_POINTS[card.rank] - lowestValue;
      flags.push(`PARTNER_WINNING_WASTE: Played ${cardStr(card)}(${cardPts(card)}pts) when partner winning, cheapest was ${lowestValue}pts — wasted ${waste}pts`);
      pointsWasted = waste;
    }
  } else {
    // Opponent winning
    if (!iWin) {
      // Can't win — should play lowest
      const lowestValue = Math.min(...validPlays.map(c => CARD_POINTS[c.rank]));
      if (CARD_POINTS[card.rank] > lowestValue) {
        const waste = CARD_POINTS[card.rank] - lowestValue;
        // Check if this is FORCED by overbeat rules
        const allSamePoints = validPlays.every(c => CARD_POINTS[c.rank] === CARD_POINTS[card.rank]);
        if (!allSamePoints) {
          flags.push(`LOSING_WASTE: Played ${cardStr(card)}(${cardPts(card)}pts) but can't win anyway, cheapest was ${lowestValue}pts — wasted ${waste}pts`);
          pointsWasted = waste;
        }
      }
    } else {
      // We win — check if we used the cheapest winning card
      const winningPlays = validPlays.filter(c => {
        const hypo = { cards: [...trick.cards, { card: c, seat }], leadSeat: trick.leadSeat };
        return determineTrickWinner(hypo, trumpSuit).seat === seat;
      });

      if (winningPlays.length > 1) {
        const cheapestWinner = winningPlays.sort((a, b) =>
          CARD_POINTS[a.rank] - CARD_POINTS[b.rank] || CARD_POWER[a.rank] - CARD_POWER[b.rank]
        )[0];

        if (CARD_POINTS[card.rank] > CARD_POINTS[cheapestWinner.rank]) {
          const waste = CARD_POINTS[card.rank] - CARD_POINTS[cheapestWinner.rank];
          flags.push(`EXPENSIVE_WIN: Won with ${cardStr(card)}(${cardPts(card)}pts) but could win with ${cardStr(cheapestWinner)}(${cardPts(cheapestWinner)}pts) — wasted ${waste}pts`);
          pointsWasted = waste;
        }
      }
    }
  }

  return { flags, wasForced: false, pointsWasted };
}

/**
 * Run a single complete game (multiple rounds until target score)
 */
function runGame(gameNumber: number): GameLog {
  let state = initGameState();
  const gameLog: GameLog = {
    gameNumber,
    rounds: [],
    finalScores: { team1: 0, team2: 0 },
    winner: 'team1',
    totalRounds: 0,
  };

  let safetyCounter = 0;
  const MAX_ROUNDS = 200; // prevent infinite loops

  while (state.scores.team1 < TARGET_SCORE && state.scores.team2 < TARGET_SCORE && safetyCounter < MAX_ROUNDS) {
    safetyCounter++;

    // Start round
    state = startRound(state);

    const roundLog: RoundLog = {
      roundNumber: state.roundNumber,
      dealerSeat: state.dealerSeat,
      hands: {} as Record<SeatPosition, string[]>,
      bidWinner: null,
      bidAmount: 0,
      trumpSuit: null,
      cantes: [],
      tricks: [],
      team1TrickPoints: 0,
      team2TrickPoints: 0,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      biddingTeamFell: false,
      flags: [],
    };

    // Save initial hands
    for (const seat of SEAT_ORDER) {
      roundLog.hands[seat] = state.players[seat]?.hand.map(cardStr) || [];
    }

    // Handle capo check → might skip directly to trump declaration
    if (state.phase === GamePhase.TRUMP_DECLARATION && state.capoType === CapoType.TECHNICAL) {
      // Technical capo — bot declares trump
      const trump = chooseTrump(state, state.currentTurnSeat, DIFFICULTY);
      state = declareTrump(state, state.currentTurnSeat, trump);
      roundLog.bidWinner = state.currentBidWinner;
      roundLog.bidAmount = 230;
      roundLog.trumpSuit = trump;
    }

    // Bidding phase
    let biddingLoops = 0;
    while (state.phase === GamePhase.BIDDING && biddingLoops < 100) {
      biddingLoops++;
      const seat = state.currentTurnSeat;
      const bid = chooseBid(state, seat, DIFFICULTY);

      if (bid === 0) {
        state = placeBid(state, seat, 0);
      } else {
        state = placeBid(state, seat, bid);
      }
    }

    // All passed → startRound was called recursively, skip to next iteration
    if (state.phase === GamePhase.BIDDING) {
      continue; // safety
    }

    // Trump declaration
    if (state.phase === GamePhase.TRUMP_DECLARATION) {
      const seat = state.currentTurnSeat;
      const trump = chooseTrump(state, seat, DIFFICULTY);
      state = declareTrump(state, seat, trump);
      roundLog.bidWinner = state.currentBidWinner;
      roundLog.bidAmount = state.currentBidAmount;
      roundLog.trumpSuit = trump;
    }

    // Trick play phase (10 tricks)
    let trickLoops = 0;
    while (state.phase === GamePhase.TRICK_PLAY && trickLoops < 50) {
      trickLoops++;
      const seat = state.currentTurnSeat;
      const player = state.players[seat];
      if (!player) break;

      const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
      if (validPlays.length === 0) break;

      const card = chooseCard(state, seat, DIFFICULTY);
      if (!card) break;

      // Analyze the play BEFORE executing it
      const analysis = analyzePlay(card, validPlays, state.currentTrick, seat, state);

      // Execute the play
      state = gamePlayCard(state, seat, card.id);

      // If trick is complete, resolve it
      if (state.trickPendingResolution) {
        const trick = state.currentTrick;
        const winner = determineTrickWinner(trick, state.trumpSuit);
        const pts = calculateTrickPoints(trick);

        const trickLog: TrickLog = {
          trickNumber: state.completedTricks.length + 1,
          leadSeat: trick.leadSeat,
          cards: trick.cards.map((tc, idx) => {
            // For the card that was just analyzed (last card), use our analysis
            // For previous cards in this trick, we need retrospective analysis
            const isAnalyzed = tc.card.id === card.id;
            return {
              seat: tc.seat,
              card: cardStr(tc.card),
              points: cardPts(tc.card),
              wasForced: isAnalyzed ? analysis.wasForced : false, // Only tracked for current play
              validOptions: isAnalyzed ? validPlays.length : 0,
              allValid: isAnalyzed ? validPlays.map(cardStr) : [],
            };
          }),
          winnerSeat: winner.seat,
          trickPoints: pts,
          flags: analysis.flags,
        };

        roundLog.tricks.push(trickLog);

        // Resolve the trick
        state = resolveTrick(state);

        // Handle singing after trick
        let singingLoops = 0;
        while (state.phase === GamePhase.SINGING && singingLoops < 10) {
          singingLoops++;

          if (state.singingChoicePending && state.currentBidWinner) {
            const choice = chooseSingerChoice(state, state.currentBidWinner, DIFFICULTY);
            state = gameChooseSinger(state, state.currentBidWinner, choice);
          } else {
            const singSeat = state.currentTurnSeat;
            const singChoice = chooseSinging(state, singSeat, DIFFICULTY);

            if (singChoice) {
              state = singCante(state, singSeat, singChoice);
              roundLog.cantes.push({
                seat: singSeat,
                suit: singChoice,
                points: singChoice === state.trumpSuit ? 40 : 20,
              });
            } else {
              state = doneSinging(state, singSeat);
            }
          }
        }
      }
    }

    // Build trick logs for this round from completed tricks (for tricks we didn't log inline)
    // The inline logging above captures the LAST card analysis; we'll enhance this

    // Round scoring
    if (state.phase === GamePhase.ROUND_SCORING || state.phase === GamePhase.GAME_OVER) {
      const lastRound = state.roundHistory[state.roundHistory.length - 1];
      if (lastRound) {
        roundLog.team1TrickPoints = lastRound.team1TrickPoints;
        roundLog.team2TrickPoints = lastRound.team2TrickPoints;
        roundLog.team1SingingPoints = lastRound.team1SingingPoints;
        roundLog.team2SingingPoints = lastRound.team2SingingPoints;
        roundLog.biddingTeamFell = lastRound.biddingTeamFell;

        if (lastRound.biddingTeamFell) {
          roundLog.flags.push(`BIDDING_FELL: Team ${lastRound.biddingTeam} bid ${lastRound.bidAmount} but fell`);
        }
      }

      gameLog.rounds.push(roundLog);

      if (state.phase === GamePhase.GAME_OVER) break;

      // Next round
      state = nextRound(state);
    }
  }

  gameLog.finalScores = { ...state.scores };
  gameLog.winner = state.scores.team1 >= TARGET_SCORE ? 'team1' : 'team2';
  gameLog.totalRounds = gameLog.rounds.length;

  return gameLog;
}

/**
 * Improved simulator that tracks EVERY card play in every trick
 */
function runGameV2(gameNumber: number): GameLog {
  let state = initGameState();
  const gameLog: GameLog = {
    gameNumber,
    rounds: [],
    finalScores: { team1: 0, team2: 0 },
    winner: 'team1',
    totalRounds: 0,
  };

  let safetyCounter = 0;
  const MAX_ROUNDS = 200;

  while (state.scores.team1 < TARGET_SCORE && state.scores.team2 < TARGET_SCORE && safetyCounter < MAX_ROUNDS) {
    safetyCounter++;

    state = startRound(state);

    // If phase went back to bidding due to all-pass reshuffle, this is handled by startRound internally
    // We need to check if we got back to a new round

    const roundLog: RoundLog = {
      roundNumber: state.roundNumber,
      dealerSeat: state.dealerSeat,
      hands: {} as Record<SeatPosition, string[]>,
      bidWinner: null,
      bidAmount: 0,
      trumpSuit: null,
      cantes: [],
      tricks: [],
      team1TrickPoints: 0,
      team2TrickPoints: 0,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      biddingTeamFell: false,
      flags: [],
    };

    for (const seat of SEAT_ORDER) {
      roundLog.hands[seat] = state.players[seat]?.hand.map(cardStr) || [];
    }

    // Handle technical capo
    if (state.phase === GamePhase.TRUMP_DECLARATION && state.capoType === CapoType.TECHNICAL) {
      const trump = chooseTrump(state, state.currentTurnSeat, DIFFICULTY);
      state = declareTrump(state, state.currentTurnSeat, trump);
      roundLog.bidWinner = state.currentBidWinner;
      roundLog.bidAmount = 230;
      roundLog.trumpSuit = trump;
    }

    // Bidding
    let biddingLoops = 0;
    while (state.phase === GamePhase.BIDDING && biddingLoops < 100) {
      biddingLoops++;
      const seat = state.currentTurnSeat;
      const bid = chooseBid(state, seat, DIFFICULTY);
      state = placeBid(state, seat, bid === 0 ? 0 : bid);
    }

    if (state.phase === GamePhase.BIDDING) continue;

    // Trump
    if (state.phase === GamePhase.TRUMP_DECLARATION) {
      const seat = state.currentTurnSeat;
      const trump = chooseTrump(state, seat, DIFFICULTY);
      state = declareTrump(state, seat, trump);
      roundLog.bidWinner = state.currentBidWinner;
      roundLog.bidAmount = state.currentBidAmount;
      roundLog.trumpSuit = trump;
    }

    // Trick play with per-card analysis
    let currentTrickLog: TrickLog | null = null;
    let overallTrickLoops = 0;

    while ((state.phase === GamePhase.TRICK_PLAY || state.phase === GamePhase.SINGING) && overallTrickLoops < 200) {
      overallTrickLoops++;

      // Handle singing
      if (state.phase === GamePhase.SINGING) {
        let singingLoops = 0;
        while (state.phase === GamePhase.SINGING && singingLoops < 10) {
          singingLoops++;
          if (state.singingChoicePending && state.currentBidWinner) {
            const choice = chooseSingerChoice(state, state.currentBidWinner, DIFFICULTY);
            state = gameChooseSinger(state, state.currentBidWinner, choice);
          } else {
            const singSeat = state.currentTurnSeat;
            const singChoice = chooseSinging(state, singSeat, DIFFICULTY);
            if (singChoice) {
              state = singCante(state, singSeat, singChoice);
              roundLog.cantes.push({
                seat: singSeat,
                suit: singChoice,
                points: singChoice === state.trumpSuit ? 40 : 20,
              });
            } else {
              state = doneSinging(state, singSeat);
            }
          }
        }
        continue;
      }

      if (state.phase !== GamePhase.TRICK_PLAY) break;

      const seat = state.currentTurnSeat;
      const player = state.players[seat];
      if (!player) break;

      // Start new trick log if needed
      if (state.currentTrick.cards.length === 0) {
        currentTrickLog = {
          trickNumber: state.completedTricks.length + 1,
          leadSeat: seat,
          cards: [],
          winnerSeat: seat, // placeholder
          trickPoints: 0,
          flags: [],
        };
      }

      const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
      if (validPlays.length === 0) break;

      const card = chooseCard(state, seat, DIFFICULTY);
      if (!card) break;

      // Analyze BEFORE playing
      const analysis = analyzePlay(card, validPlays, state.currentTrick, seat, state);

      if (currentTrickLog) {
        currentTrickLog.cards.push({
          seat,
          card: cardStr(card),
          points: cardPts(card),
          wasForced: analysis.wasForced,
          validOptions: validPlays.length,
          allValid: validPlays.map(cardStr),
        });
        currentTrickLog.flags.push(...analysis.flags);
      }

      // Execute
      state = gamePlayCard(state, seat, card.id);

      // Resolve trick if complete
      if (state.trickPendingResolution) {
        const trick = state.currentTrick;
        const winner = determineTrickWinner(trick, state.trumpSuit);
        const pts = calculateTrickPoints(trick);

        if (currentTrickLog) {
          currentTrickLog.winnerSeat = winner.seat;
          currentTrickLog.trickPoints = pts;
          roundLog.tricks.push(currentTrickLog);
          currentTrickLog = null;
        }

        state = resolveTrick(state);
      }
    }

    // Scoring
    if (state.phase === GamePhase.ROUND_SCORING || state.phase === GamePhase.GAME_OVER) {
      const lastRound = state.roundHistory[state.roundHistory.length - 1];
      if (lastRound) {
        roundLog.team1TrickPoints = lastRound.team1TrickPoints;
        roundLog.team2TrickPoints = lastRound.team2TrickPoints;
        roundLog.team1SingingPoints = lastRound.team1SingingPoints;
        roundLog.team2SingingPoints = lastRound.team2SingingPoints;
        roundLog.biddingTeamFell = lastRound.biddingTeamFell;

        if (lastRound.biddingTeamFell) {
          roundLog.flags.push(`BIDDING_FELL: Team ${lastRound.biddingTeam} bid ${lastRound.bidAmount} but fell (${lastRound.biddingTeam === 'team1' ? lastRound.team1TrickPoints + lastRound.team1SingingPoints : lastRound.team2TrickPoints + lastRound.team2SingingPoints}/${lastRound.bidAmount})`);
        }
      }

      gameLog.rounds.push(roundLog);

      if (state.phase === GamePhase.GAME_OVER) break;
      state = nextRound(state);
    }
  }

  gameLog.finalScores = { ...state.scores };
  gameLog.winner = state.scores.team1 >= TARGET_SCORE ? 'team1' : 'team2';
  gameLog.totalRounds = gameLog.rounds.length;

  return gameLog;
}

// ─── Analysis & Reporting ───────────────────────────────────────────────────

function aggregateStats(games: GameLog[]): AggregateStats {
  const stats: AggregateStats = {
    gamesPlayed: games.length,
    team1Wins: 0,
    team2Wins: 0,
    avgRoundsPerGame: 0,
    totalBadPlays: 0,
    badPlaysByType: {},
    avgPointsWasted: 0,
    forcedExpensivePlays: 0,
    unnecessaryExpensivePlays: 0,
    leadingIssues: 0,
    followingIssues: 0,
    biddingFalls: { team1: 0, team2: 0 },
    totalRounds: 0,
  };

  let totalPointsWasted = 0;
  let totalRounds = 0;

  for (const game of games) {
    if (game.winner === 'team1') stats.team1Wins++;
    else stats.team2Wins++;

    totalRounds += game.totalRounds;

    for (const round of game.rounds) {
      if (round.biddingTeamFell) {
        // Figure out which team fell from flags
        for (const flag of round.flags) {
          if (flag.includes('team1')) stats.biddingFalls.team1++;
          else if (flag.includes('team2')) stats.biddingFalls.team2++;
        }
      }

      for (const trick of round.tricks) {
        for (const flag of trick.flags) {
          stats.totalBadPlays++;

          // Categorize
          const type = flag.split(':')[0];
          stats.badPlaysByType[type] = (stats.badPlaysByType[type] || 0) + 1;

          if (type.startsWith('LEAD_')) stats.leadingIssues++;
          else stats.followingIssues++;

          // Extract points wasted from flag text
          const wastedMatch = flag.match(/wasted (\d+)pts/);
          if (wastedMatch) {
            totalPointsWasted += parseInt(wastedMatch[1], 10);
          }
        }

        // Count forced expensive plays
        for (const cardLog of trick.cards) {
          if (cardLog.wasForced && cardLog.points >= 10) {
            stats.forcedExpensivePlays++;
          }
          if (!cardLog.wasForced && cardLog.points >= 10 && cardLog.validOptions > 1) {
            // Check if there was a cheaper option
            // This is approximate — a proper check needs the full trick context
          }
        }
      }
    }
  }

  stats.totalRounds = totalRounds;
  stats.avgRoundsPerGame = totalRounds / games.length;
  stats.avgPointsWasted = totalPointsWasted / games.length;

  return stats;
}

function printDetailedGame(game: GameLog): void {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`GAME ${game.gameNumber} — ${game.totalRounds} rounds — Winner: ${game.winner}`);
  console.log(`Final: Team1=${game.finalScores.team1} | Team2=${game.finalScores.team2}`);
  console.log('═'.repeat(80));

  for (const round of game.rounds) {
    // Only print rounds with issues or if verbose
    const hasIssues = round.tricks.some(t => t.flags.length > 0) || round.flags.length > 0;
    if (!hasIssues && !VERBOSE) continue;

    console.log(`\n── Round ${round.roundNumber} ──`);
    console.log(`  Dealer: ${round.dealerSeat} | Bid: ${round.bidAmount} by ${round.bidWinner} | Trump: ${round.trumpSuit}`);
    if (round.cantes.length > 0) {
      console.log(`  Cantes: ${round.cantes.map(c => `${c.seat}:${c.suit}(${c.points}pts)`).join(', ')}`);
    }
    console.log(`  Points: T1=${round.team1TrickPoints}+${round.team1SingingPoints}sing | T2=${round.team2TrickPoints}+${round.team2SingingPoints}sing`);

    for (const flag of round.flags) {
      console.log(`  ⚠️  ${flag}`);
    }

    for (const trick of round.tricks) {
      if (trick.flags.length === 0 && !VERBOSE) continue;

      console.log(`  Trick ${trick.trickNumber}: ${trick.cards.map(c =>
        `${c.seat}:${c.card}(${c.points}pts${c.wasForced ? ',FORCED' : ''}${c.validOptions > 1 ? `,${c.validOptions}opts` : ''})`
      ).join(' → ')} → Winner: ${trick.winnerSeat} (${trick.trickPoints}pts)`);

      for (const flag of trick.flags) {
        console.log(`    🔴 ${flag}`);
      }

      // Show valid options for flagged plays
      if (trick.flags.length > 0 && VERBOSE) {
        for (const c of trick.cards) {
          if (c.allValid.length > 1) {
            console.log(`       ${c.seat} options: [${c.allValid.join(', ')}]`);
          }
        }
      }
    }
  }
}

function printStats(stats: AggregateStats): void {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('AGGREGATE STATISTICS');
  console.log('═'.repeat(80));
  console.log(`Games: ${stats.gamesPlayed} | Difficulty: ${DIFFICULTY} | Target: ${TARGET_SCORE}`);
  console.log(`Team1 wins: ${stats.team1Wins} (${(stats.team1Wins/stats.gamesPlayed*100).toFixed(1)}%) | Team2 wins: ${stats.team2Wins} (${(stats.team2Wins/stats.gamesPlayed*100).toFixed(1)}%)`);
  console.log(`Avg rounds/game: ${stats.avgRoundsPerGame.toFixed(1)} | Total rounds: ${stats.totalRounds}`);
  console.log();
  console.log(`Total bad plays: ${stats.totalBadPlays} (${(stats.totalBadPlays/stats.totalRounds).toFixed(1)} per round)`);
  console.log(`Avg points wasted/game: ${stats.avgPointsWasted.toFixed(1)}`);
  console.log(`Leading issues: ${stats.leadingIssues} | Following issues: ${stats.followingIssues}`);
  console.log(`Forced expensive plays (10+ pts, no choice): ${stats.forcedExpensivePlays}`);
  console.log();
  console.log('Bad plays by type:');
  for (const [type, count] of Object.entries(stats.badPlaysByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count} (${(count/stats.totalRounds).toFixed(2)} per round)`);
  }
  console.log();
  console.log(`Bidding falls: Team1=${stats.biddingFalls.team1} | Team2=${stats.biddingFalls.team2}`);
  console.log(`Fall rate: ${((stats.biddingFalls.team1 + stats.biddingFalls.team2) / stats.totalRounds * 100).toFixed(1)}%`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎮 Bot Simulator — ${NUM_GAMES} games, difficulty: ${DIFFICULTY}, target: ${TARGET_SCORE}`);
  console.log('─'.repeat(80));

  const games: GameLog[] = [];

  for (let i = 0; i < NUM_GAMES; i++) {
    process.stdout.write(`\rRunning game ${i + 1}/${NUM_GAMES}...`);
    const game = runGameV2(i + 1);
    games.push(game);
  }

  console.log(`\rCompleted ${NUM_GAMES} games.${' '.repeat(40)}`);

  // Print detailed view of first 3 games (or all if verbose)
  const detailCount = VERBOSE ? games.length : Math.min(3, games.length);
  for (let i = 0; i < detailCount; i++) {
    printDetailedGame(games[i]);
  }

  // Aggregate stats
  const stats = aggregateStats(games);
  printStats(stats);

  // Print worst games (most bad plays)
  console.log('\n── Worst Games (most bad plays) ──');
  const sorted = [...games].sort((a, b) => {
    const aBad = a.rounds.reduce((sum, r) => sum + r.tricks.reduce((s, t) => s + t.flags.length, 0), 0);
    const bBad = b.rounds.reduce((sum, r) => sum + r.tricks.reduce((s, t) => s + t.flags.length, 0), 0);
    return bBad - aBad;
  });

  for (let i = 0; i < Math.min(3, sorted.length); i++) {
    const g = sorted[i];
    const badCount = g.rounds.reduce((sum, r) => sum + r.tricks.reduce((s, t) => s + t.flags.length, 0), 0);
    console.log(`  Game ${g.gameNumber}: ${badCount} bad plays, ${g.totalRounds} rounds, winner=${g.winner} (${g.finalScores.team1}-${g.finalScores.team2})`);
  }
}

main().catch(console.error);
