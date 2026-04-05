#!/usr/bin/env tsx
/**
 * LLM Bot Simulator — Runs games with Haiku-powered legendary bots
 *
 * Compares LLM decisions against optimal heuristic play to identify
 * where the context engineering fails and the LLM makes mistakes.
 *
 * Usage: npx tsx server/src/bot/llmSimulator.ts [rounds=3]
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import {
  GameState, GamePhase, SeatPosition, SEAT_ORDER, Card, Suit,
  CapoType, TeamId, SEAT_TEAM, CARD_POINTS, CARD_POWER, Rank
} from '../engine/types.js';
import { createDeck, shuffleDeck, dealCards } from '../engine/deck.js';
import { determineTrickWinner, calculateTrickPoints } from '../engine/scoring.js';
import { getValidPlays, getNextSeat } from '../engine/tricks.js';
import { getSingableSuits, canSingCante } from '../engine/singing.js';
import { chooseBid, chooseTrump, chooseSinging, chooseSingerChoice, chooseCard } from './strategy.js';
import {
  legendaryChooseBid, legendaryChooseTrump, legendaryChooseSinging,
  legendaryChooseSingerChoice, legendaryChooseCard, getRoomCost
} from './legendaryBot.js';
import {
  startRound, placeBid, declareTrump, singCante,
  chooseSinger as gameChooseSinger, doneSinging,
  playCard as gamePlayCard, resolveTrick, nextRound, createInitialState
} from '../engine/game.js';

const args = process.argv.slice(2);
const MIXED_MODE = args.includes('--mixed');
const numArg = args.find(a => !a.startsWith('--'));
const NUM_ROUNDS = parseInt(numArg || '3', 10);
const ROOM_CODE = 'sim-llm';
const LLM_SEAT: SeatPosition = 'south'; // In mixed mode, only this seat uses LLM

function isLLMSeat(seat: SeatPosition): boolean {
  return MIXED_MODE ? seat === LLM_SEAT : true;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DecisionComparison {
  phase: string;
  seat: SeatPosition;
  trickNumber: number;
  llmChoice: string;
  heuristicChoice: string;
  match: boolean;
  llmWasCorrect: boolean | null; // null = can't determine
  context: string;
  validOptions: string[];
  pointsAtStake: number;
}

interface RoundAnalysis {
  roundNumber: number;
  decisions: DecisionComparison[];
  bidding: { llmBid: number; heuristicBid: number; seat: SeatPosition }[];
  trumpChoice: { llm: Suit | null; heuristic: Suit | null } | null;
  team1TrickPoints: number;
  team2TrickPoints: number;
  biddingTeamFell: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cardStr(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function initGameState(): GameState {
  const state = createInitialState();
  state.targetScore = 10000; // High target so we control round count

  for (const seat of SEAT_ORDER) {
    const isLLM = isLLMSeat(seat);
    state.players[seat] = {
      id: `${isLLM ? 'llm' : 'hard'}-bot-${seat}`,
      name: isLLM ? `LLM-${seat}` : `Hard-${seat}`,
      seat,
      hand: [],
      connected: true,
      avatar: '',
    };
  }

  return state;
}

// ─── Main Simulation ────────────────────────────────────────────────────────

async function runLLMRound(state: GameState, roundNum: number): Promise<{ state: GameState; analysis: RoundAnalysis }> {
  state = startRound(state);

  const analysis: RoundAnalysis = {
    roundNumber: roundNum,
    decisions: [],
    bidding: [],
    trumpChoice: null,
    team1TrickPoints: 0,
    team2TrickPoints: 0,
    biddingTeamFell: false,
  };

  console.log(`\n── Round ${roundNum} ──`);
  console.log(`  Dealer: ${state.dealerSeat}`);
  for (const seat of SEAT_ORDER) {
    const hand = state.players[seat]?.hand.map(cardStr).join(', ');
    console.log(`  ${seat}: [${hand}]`);
  }

  // Handle technical capo
  if (state.phase === GamePhase.TRUMP_DECLARATION && state.capoType === CapoType.TECHNICAL) {
    const seat = state.currentTurnSeat;
    if (isLLMSeat(seat)) {
      const llmTrump = await legendaryChooseTrump(state, seat, ROOM_CODE);
      const heuristicTrump = chooseTrump(state, seat, 'hard');
      console.log(`  Technical capo by ${seat}: LLM trump=${llmTrump}, Heuristic trump=${heuristicTrump}`);
      state = declareTrump(state, seat, llmTrump);
      analysis.trumpChoice = { llm: llmTrump, heuristic: heuristicTrump };
    } else {
      const trump = chooseTrump(state, seat, 'hard');
      console.log(`  Technical capo by ${seat}: Heuristic trump=${trump}`);
      state = declareTrump(state, seat, trump);
    }
  }

  // Bidding
  let biddingLoops = 0;
  while (state.phase === GamePhase.BIDDING && biddingLoops < 30) {
    biddingLoops++;
    const seat = state.currentTurnSeat;

    let actualBid: number;
    const heuristicBid = chooseBid(state, seat, 'hard');

    if (isLLMSeat(seat)) {
      const llmBid = await legendaryChooseBid(state, seat, ROOM_CODE);
      actualBid = llmBid;
      analysis.bidding.push({ llmBid, heuristicBid, seat });
      if (llmBid !== heuristicBid) {
        console.log(`  BID ${seat}: LLM=${llmBid}, Heuristic=${heuristicBid} ← DIFFERENT`);
      }
    } else {
      actualBid = heuristicBid;
      analysis.bidding.push({ llmBid: heuristicBid, heuristicBid, seat });
    }

    state = placeBid(state, seat, actualBid === 0 ? 0 : actualBid);
  }

  if (state.phase === GamePhase.BIDDING) {
    return { state, analysis };
  }

  console.log(`  Bid winner: ${state.currentBidWinner} at ${state.currentBidAmount}`);

  // Trump
  if (state.phase === GamePhase.TRUMP_DECLARATION) {
    const seat = state.currentTurnSeat;
    if (isLLMSeat(seat)) {
      const llmTrump = await legendaryChooseTrump(state, seat, ROOM_CODE);
      const heuristicTrump = chooseTrump(state, seat, 'hard');
      analysis.trumpChoice = { llm: llmTrump, heuristic: heuristicTrump };
      if (llmTrump !== heuristicTrump) {
        console.log(`  TRUMP ${seat}: LLM=${llmTrump}, Heuristic=${heuristicTrump} ← DIFFERENT`);
      } else {
        console.log(`  Trump: ${llmTrump}`);
      }
      state = declareTrump(state, seat, llmTrump);
    } else {
      const trump = chooseTrump(state, seat, 'hard');
      console.log(`  Trump: ${trump}`);
      state = declareTrump(state, seat, trump);
    }
  }

  // Trick play
  let overallLoops = 0;
  while ((state.phase === GamePhase.TRICK_PLAY || state.phase === GamePhase.SINGING) && overallLoops < 200) {
    overallLoops++;

    // Handle singing
    if (state.phase === GamePhase.SINGING) {
      let singingLoops = 0;
      while (state.phase === GamePhase.SINGING && singingLoops < 10) {
        singingLoops++;
        if (state.singingChoicePending && state.currentBidWinner) {
          const bidWinner = state.currentBidWinner;
          if (isLLMSeat(bidWinner)) {
            const llmChoice = await legendaryChooseSingerChoice(state, bidWinner, ROOM_CODE);
            state = gameChooseSinger(state, bidWinner, llmChoice);
          } else {
            const choice = chooseSingerChoice(state, bidWinner, 'hard');
            state = gameChooseSinger(state, bidWinner, choice);
          }
        } else {
          const singSeat = state.currentTurnSeat;
          if (isLLMSeat(singSeat)) {
            const llmSing = await legendaryChooseSinging(state, singSeat, ROOM_CODE);
            if (llmSing) {
              console.log(`  SING ${singSeat}: ${llmSing} (${llmSing === state.trumpSuit ? 40 : 20}pts)`);
              state = singCante(state, singSeat, llmSing);
            } else {
              state = doneSinging(state, singSeat);
            }
          } else {
            const hSing = chooseSinging(state, singSeat, 'hard');
            if (hSing) {
              console.log(`  SING ${singSeat}: ${hSing} (${hSing === state.trumpSuit ? 40 : 20}pts)`);
              state = singCante(state, singSeat, hSing);
            } else {
              state = doneSinging(state, singSeat);
            }
          }
        }
      }
      continue;
    }

    if (state.phase !== GamePhase.TRICK_PLAY) break;

    const seat = state.currentTurnSeat;
    const player = state.players[seat];
    if (!player) break;

    const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
    if (validPlays.length === 0) break;

    // Compare LLM vs heuristic decision
    let llmCard: Card | null = null;
    let heuristicCard: Card | null = null;

    if (validPlays.length === 1) {
      llmCard = validPlays[0];
      heuristicCard = validPlays[0];
    } else if (isLLMSeat(seat)) {
      llmCard = await legendaryChooseCard(state, seat, ROOM_CODE);
      heuristicCard = chooseCard(state, seat, 'hard');
    } else {
      // Non-LLM seat: use heuristic for both
      heuristicCard = chooseCard(state, seat, 'hard');
      llmCard = heuristicCard;
    }

    if (!llmCard) break;

    const trickNum = state.completedTricks.length + 1;
    const isLeading = state.currentTrick.cards.length === 0;

    // Analyze the decision
    const currentWinner = state.currentTrick.cards.length > 0
      ? determineTrickWinner({ cards: state.currentTrick.cards, leadSeat: state.currentTrick.leadSeat }, state.trumpSuit)
      : null;
    const partnerSeat = SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 2) % 4];
    const partnerWinning = currentWinner ? SEAT_TEAM[currentWinner.seat] === SEAT_TEAM[seat] : false;

    let context = isLeading
      ? 'LEADING'
      : `FOLLOWING (${partnerWinning ? 'partner winning' : 'opponent winning'})`;

    // Calculate trick points at stake
    const trickPtsSoFar = state.currentTrick.cards.reduce((s, tc) => s + CARD_POINTS[tc.card.rank], 0);

    const match = llmCard.id === heuristicCard?.id;
    let llmWasCorrect: boolean | null = null;

    // Simple correctness check
    if (!match && heuristicCard) {
      if (partnerWinning && !isLeading) {
        // Partner winning → should play lowest
        llmWasCorrect = CARD_POINTS[llmCard.rank] <= CARD_POINTS[heuristicCard.rank];
      } else if (!isLeading && !partnerWinning) {
        // Opponent winning → check if LLM played cheapest winner or lowest loser
        const llmWins = (() => {
          const hypo = { cards: [...state.currentTrick.cards, { card: llmCard, seat }], leadSeat: state.currentTrick.leadSeat };
          return determineTrickWinner(hypo, state.trumpSuit).seat === seat;
        })();
        const heuristicWins = (() => {
          const hypo = { cards: [...state.currentTrick.cards, { card: heuristicCard!, seat }], leadSeat: state.currentTrick.leadSeat };
          return determineTrickWinner(hypo, state.trumpSuit).seat === seat;
        })();

        if (llmWins === heuristicWins) {
          // Both win or both lose — cheaper is better
          llmWasCorrect = CARD_POINTS[llmCard.rank] <= CARD_POINTS[heuristicCard.rank];
        } else if (llmWins && !heuristicWins) {
          llmWasCorrect = null; // LLM won but heuristic didn't — could be good or bad depending on future
        } else {
          llmWasCorrect = null; // Heuristic won but LLM didn't
        }
      }
    }

    const comparison: DecisionComparison = {
      phase: 'TRICK_PLAY',
      seat,
      trickNumber: trickNum,
      llmChoice: cardStr(llmCard),
      heuristicChoice: heuristicCard ? cardStr(heuristicCard) : 'none',
      match,
      llmWasCorrect: match ? true : llmWasCorrect,
      context,
      validOptions: validPlays.map(cardStr),
      pointsAtStake: trickPtsSoFar + CARD_POINTS[llmCard.rank],
    };

    analysis.decisions.push(comparison);

    if (!match) {
      const correctStr = llmWasCorrect === true ? '✅' : llmWasCorrect === false ? '❌' : '❓';
      console.log(`  T${trickNum} ${seat} ${context}: LLM=${cardStr(llmCard)}(${CARD_POINTS[llmCard.rank]}pts) vs H=${heuristicCard ? cardStr(heuristicCard) : '?'}(${heuristicCard ? CARD_POINTS[heuristicCard.rank] : '?'}pts) ${correctStr} [${validPlays.map(cardStr).join(',')}]`);
    }

    // Execute the LLM's decision
    state = gamePlayCard(state, seat, llmCard.id);

    if (state.trickPendingResolution) {
      const trick = state.currentTrick;
      const winner = determineTrickWinner(trick, state.trumpSuit);
      const pts = calculateTrickPoints(trick);
      state = resolveTrick(state);
    }
  }

  // Scoring
  if (state.phase === GamePhase.ROUND_SCORING || state.phase === GamePhase.GAME_OVER) {
    const lastRound = state.roundHistory[state.roundHistory.length - 1];
    if (lastRound) {
      analysis.team1TrickPoints = lastRound.team1TrickPoints;
      analysis.team2TrickPoints = lastRound.team2TrickPoints;
      analysis.biddingTeamFell = lastRound.biddingTeamFell;

      console.log(`  Result: T1=${lastRound.team1TrickPoints}+${lastRound.team1SingingPoints}sing T2=${lastRound.team2TrickPoints}+${lastRound.team2SingingPoints}sing${lastRound.biddingTeamFell ? ' FELL!' : ''}`);
    }
  }

  return { state, analysis };
}

// ─── Analysis Report ────────────────────────────────────────────────────────

function printAnalysis(rounds: RoundAnalysis[]): void {
  console.log(`\n${'═'.repeat(80)}`);
  console.log('LLM vs HEURISTIC ANALYSIS');
  console.log('═'.repeat(80));

  let totalDecisions = 0;
  let matchingDecisions = 0;
  let llmCorrect = 0;
  let llmWrong = 0;
  let llmUnclear = 0;
  let totalPointsDiff = 0;

  const mistakeCategories: Record<string, { count: number; examples: string[] }> = {};

  for (const round of rounds) {
    for (const d of round.decisions) {
      totalDecisions++;
      if (d.match) {
        matchingDecisions++;
      } else {
        if (d.llmWasCorrect === true) llmCorrect++;
        else if (d.llmWasCorrect === false) {
          llmWrong++;

          // Categorize the mistake
          const category = d.context;
          if (!mistakeCategories[category]) mistakeCategories[category] = { count: 0, examples: [] };
          mistakeCategories[category].count++;
          if (mistakeCategories[category].examples.length < 3) {
            mistakeCategories[category].examples.push(
              `T${d.trickNumber} ${d.seat}: played ${d.llmChoice} instead of ${d.heuristicChoice} from [${d.validOptions.join(',')}]`
            );
          }
        } else {
          llmUnclear++;
        }
      }
    }
  }

  const disagreements = totalDecisions - matchingDecisions;
  console.log(`\nTotal card decisions: ${totalDecisions}`);
  console.log(`Matching decisions: ${matchingDecisions} (${(matchingDecisions/totalDecisions*100).toFixed(1)}%)`);
  console.log(`Disagreements: ${disagreements} (${(disagreements/totalDecisions*100).toFixed(1)}%)`);
  if (disagreements > 0) {
    console.log(`  LLM was correct: ${llmCorrect} (${(llmCorrect/disagreements*100).toFixed(1)}%)`);
    console.log(`  LLM was wrong: ${llmWrong} (${(llmWrong/disagreements*100).toFixed(1)}%)`);
    console.log(`  Unclear: ${llmUnclear} (${(llmUnclear/disagreements*100).toFixed(1)}%)`);
  }

  console.log('\nMistake categories:');
  for (const [category, data] of Object.entries(mistakeCategories).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${category}: ${data.count} mistakes`);
    for (const ex of data.examples) {
      console.log(`    - ${ex}`);
    }
  }

  // Bidding analysis
  let biddingDisagreements = 0;
  let llmOverbid = 0;
  let llmUnderbid = 0;
  for (const round of rounds) {
    for (const b of round.bidding) {
      if (b.llmBid !== b.heuristicBid) {
        biddingDisagreements++;
        if (b.llmBid > b.heuristicBid) llmOverbid++;
        else llmUnderbid++;
      }
    }
  }
  console.log(`\nBidding disagreements: ${biddingDisagreements}`);
  if (biddingDisagreements > 0) {
    console.log(`  LLM overbid: ${llmOverbid}, underbid: ${llmUnderbid}`);
  }

  // Trump disagreements
  let trumpDisagreements = 0;
  for (const round of rounds) {
    if (round.trumpChoice && round.trumpChoice.llm !== round.trumpChoice.heuristic) {
      trumpDisagreements++;
    }
  }
  console.log(`Trump disagreements: ${trumpDisagreements}/${rounds.length}`);

  // Cost
  const cost = getRoomCost(ROOM_CODE);
  console.log(`\nAPI Cost: $${cost.total.cost.toFixed(4)} (${cost.total.calls} calls, ${cost.total.inputTokens} input tokens, ${cost.total.outputTokens} output tokens)`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set. This simulator requires API access.');
    console.error('Set it with: export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }

  const modeLabel = MIXED_MODE
    ? `MIXED MODE — ${LLM_SEAT} = LLM (Haiku), others = Hard Heuristic`
    : 'ALL LLM MODE — all 4 seats use Haiku API';
  console.log(`\n🤖 LLM Bot Simulator — ${NUM_ROUNDS} rounds`);
  console.log(`   ${modeLabel}`);
  console.log('─'.repeat(80));

  let state = initGameState();
  const allAnalysis: RoundAnalysis[] = [];

  for (let i = 0; i < NUM_ROUNDS; i++) {
    const result = await runLLMRound(state, i + 1);
    state = result.state;
    allAnalysis.push(result.analysis);

    if (state.phase === GamePhase.ROUND_SCORING) {
      state = nextRound(state);
    }
  }

  printAnalysis(allAnalysis);
}

main().catch(console.error);
