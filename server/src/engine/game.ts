import {
  GameState, GamePhase, SeatPosition, SEAT_ORDER, Player, Card, Suit, Bid,
  Trick, TrickCard, CapoType, TeamId, SEAT_TEAM, Cante, RoundScore,
  ClientGameState, ValidActions, SUIT_NAMES_HE
} from './types.js';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { determineTrickWinner, calculateTrickPoints, getCardPoints } from './scoring.js';
import { getValidPlays, getNextSeat } from './tricks.js';
import { getSingableSuits } from './singing.js';

export function createInitialState(): GameState {
  return {
    phase: GamePhase.WAITING,
    players: { north: null, south: null, east: null, west: null },
    dealerSeat: 'south',
    currentTurnSeat: 'east',
    turnStartedAt: Date.now(),
    bids: [],
    currentBidAmount: 0,
    currentBidWinner: null,
    biddingTeam: null,
    trumpSuit: null,
    capoType: CapoType.NONE,
    capoDeclarerSeat: null,
    cantes: [],
    singingDone: false,
    singingAfterTrick: false,
    singingChoicePending: false,
    currentTrick: { cards: [], leadSeat: 'east' },
    completedTricks: [],
    trickNumber: 0,
    trickPendingResolution: false,
    team1TricksWon: 0,
    team2TricksWon: 0,
    scores: { team1: 0, team2: 0 },
    roundHistory: [],
    roundNumber: 0,
    targetScore: 1000,
    lastMessage: 'ממתינים לשחקנים...',
  };
}

export function startRound(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  const [hand1, hand2, hand3, hand4] = dealCards(deck);

  const seatHands: Record<SeatPosition, Card[]> = {
    south: hand1,
    east: hand2,
    north: hand3,
    west: hand4,
  };

  // Assign hands
  for (const seat of SEAT_ORDER) {
    if (state.players[seat]) {
      state.players[seat]!.hand = seatHands[seat];
    }
  }

  const firstPlayer = getNextSeat(state.dealerSeat);

  state.phase = GamePhase.CAPO_CHECK;
  state.currentTurnSeat = firstPlayer;
  state.turnStartedAt = Date.now();
  state.bids = [];
  state.currentBidAmount = 0;
  state.currentBidWinner = null;
  state.biddingTeam = null;
  state.trumpSuit = null;
  state.capoType = CapoType.NONE;
  state.capoDeclarerSeat = null;
  state.cantes = [];
  state.singingDone = false;
  state.singingAfterTrick = false;
  state.singingChoicePending = false;
  state.currentTrick = { cards: [], leadSeat: firstPlayer };
  state.completedTricks = [];
  state.trickNumber = 0;
  state.trickPendingResolution = false;
  state.team1TricksWon = 0;
  state.team2TricksWon = 0;
  state.roundNumber++;
  state.lastMessage = 'חלוקת קלפים...';

  // Check for technical capo
  const technicalCapo = checkTechnicalCapo(state);
  if (technicalCapo) {
    state.capoType = CapoType.TECHNICAL;
    state.capoDeclarerSeat = technicalCapo.seat;
    state.biddingTeam = SEAT_TEAM[technicalCapo.seat];
    state.phase = GamePhase.TRUMP_DECLARATION;
    state.currentTurnSeat = technicalCapo.seat;
    state.turnStartedAt = Date.now();
    state.lastMessage = `${state.players[technicalCapo.seat]?.name} מכריז קאפו טכני! (4 ${technicalCapo.type === 'kings' ? 'מלכים' : 'סוסים'})`;
    return state;
  }

  // No technical capo - go to bidding
  state.phase = GamePhase.BIDDING;
  state.lastMessage = `תור ${state.players[firstPlayer]?.name} להציע`;
  return state;
}

function checkTechnicalCapo(state: GameState): { seat: SeatPosition; type: 'kings' | 'horses' } | null {
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    if (!player) continue;
    
    const kings = player.hand.filter(c => c.rank === 12);
    if (kings.length === 4) return { seat, type: 'kings' };
    
    const horses = player.hand.filter(c => c.rank === 11);
    if (horses.length === 4) return { seat, type: 'horses' };
  }
  return null;
}

export function placeBid(state: GameState, seat: SeatPosition, amount: number): GameState {
  if (state.phase !== GamePhase.BIDDING) return state;
  if (state.currentTurnSeat !== seat) return state;
  if (!Number.isInteger(amount)) return state; // Must be integer
  if (amount !== 0 && amount < 70) return state;
  if (amount !== 0 && amount % 10 !== 0) return state; // Must be multiple of 10
  if (amount !== 0 && amount < state.currentBidAmount) return state;
  if (amount > 230) return state;

  const bid: Bid = { seat, amount };
  state.bids.push(bid);

  if (amount > 0) {
    // Only update bid winner if this is a HIGHER bid (first to bid highest wins)
    if (amount > state.currentBidAmount || state.currentBidWinner === null) {
      state.currentBidAmount = amount;
      state.currentBidWinner = seat;
    }
    // If amount === currentBidAmount, it's a declaration bid — recorded but doesn't change winner

    if (amount === 230) {
      // Bid capo
      state.capoType = CapoType.BID;
      state.capoDeclarerSeat = seat;
      state.biddingTeam = SEAT_TEAM[seat];
      state.phase = GamePhase.TRUMP_DECLARATION;
      state.currentTurnSeat = seat;
      state.turnStartedAt = Date.now();
      state.lastMessage = `${state.players[seat]?.name} הכריז קאפו!`;
      return state;
    }
  }

  // Move to next non-passed player
  let nextSeat = getNextSeat(seat);
  let passCount = 0;

  while (passCount < 4) {
    // Check if this player already passed or declared
    const playerBids = state.bids.filter(b => b.seat === nextSeat);
    const hasPassed = playerBids.some(b => b.amount === 0);
    const isCurrentWinner = nextSeat === state.currentBidWinner;
    // A player who declared (bid == current amount but isn't the winner) is done bidding
    const hasDeclared = !isCurrentWinner && playerBids.some(
      b => b.amount > 0 && b.amount === state.currentBidAmount
    );

    if (!hasPassed && !isCurrentWinner && !hasDeclared) {
      state.currentTurnSeat = nextSeat;
      state.turnStartedAt = Date.now();
      state.lastMessage = `תור ${state.players[nextSeat]?.name} להציע`;
      return state;
    }

    nextSeat = getNextSeat(nextSeat);
    passCount++;
  }

  // Everyone else passed
  if (state.currentBidWinner) {
    // We have a winner
    state.biddingTeam = SEAT_TEAM[state.currentBidWinner];
    state.phase = GamePhase.TRUMP_DECLARATION;
    state.currentTurnSeat = state.currentBidWinner;
    state.turnStartedAt = Date.now();
    state.lastMessage = `${state.players[state.currentBidWinner]?.name} זכה בהצעה (${state.currentBidAmount}). בחר אטו.`;
  } else {
    // All passed - reshuffle (limit to 10 reshuffles to prevent infinite recursion)
    state.dealerSeat = getNextSeat(state.dealerSeat);
    state.lastMessage = 'כולם עברו. ערבוב מחדש...';
    if (state.roundNumber > 100) {
      // Safety: too many reshuffles, force a bid
      state.currentBidAmount = 70;
      state.currentBidWinner = getNextSeat(state.dealerSeat);
      state.biddingTeam = SEAT_TEAM[state.currentBidWinner];
      state.phase = GamePhase.TRUMP_DECLARATION;
      state.currentTurnSeat = state.currentBidWinner;
      state.lastMessage = 'הכפייה: חייבים להתחיל!';
      return state;
    }
    return startRound(state);
  }

  return state;
}

export function declareTrump(state: GameState, seat: SeatPosition, suit: Suit): GameState {
  if (state.phase !== GamePhase.TRUMP_DECLARATION) return state;
  if (state.currentTurnSeat !== seat) return state;

  state.trumpSuit = suit;
  state.lastMessage = `אטו: ${SUIT_NAMES_HE[suit]}.`;

  // After trump is declared, go directly to trick play
  startTrickPhase(state);

  return state;
}

function getTeammate(seat: SeatPosition): SeatPosition {
  const teammates: Record<SeatPosition, SeatPosition> = {
    south: 'north', north: 'south', east: 'west', west: 'east',
  };
  return teammates[seat];
}

function canSeatSing(state: GameState, seat: SeatPosition): boolean {
  if (!state.trumpSuit || !state.biddingTeam) return false;
  const player = state.players[seat];
  if (!player) return false;
  const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
  return singable.length > 0;
}

function checkAnySinging(state: GameState): boolean {
  if (!state.trumpSuit || !state.biddingTeam) return false;
  for (const seat of SEAT_ORDER) {
    if (SEAT_TEAM[seat] !== state.biddingTeam) continue;
    const player = state.players[seat];
    if (!player) continue;
    const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
    if (singable.length > 0) return true;
  }
  return false;
}

function checkAnySingingForTeam(state: GameState, team: TeamId): boolean {
  if (!state.trumpSuit) return false;
  for (const seat of SEAT_ORDER) {
    if (SEAT_TEAM[seat] !== team) continue;
    const player = state.players[seat];
    if (!player) continue;
    const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, team);
    if (singable.length > 0) return true;
  }
  return false;
}

export function singCante(state: GameState, seat: SeatPosition, suit: Suit): GameState {
  if (state.phase !== GamePhase.SINGING) return state;
  if (!state.trumpSuit || !state.biddingTeam) return state;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return state;
  if (state.singingChoicePending) return state; // must choose singer first

  const player = state.players[seat];
  if (!player) return state;

  const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
  if (!singable.includes(suit)) return state;

  const isTrump = suit === state.trumpSuit;
  const points = isTrump ? 40 : 20;

  state.cantes.push({ suit, isTrump, points, seat });
  state.lastMessage = `${player.name} שר ${SUIT_NAMES_HE[suit]}${isTrump ? ' (אטו)' : ''} — ${points} נקודות`;

  // One suit per trick win — auto finish singing after one cante
  if (state.singingAfterTrick) {
    return finishSingingAfterTrick(state);
  }

  return state;
}

export function chooseSinger(state: GameState, seat: SeatPosition, choice: 'self' | 'partner'): GameState {
  if (state.phase !== GamePhase.SINGING) return state;
  if (!state.singingChoicePending) return state;
  if (!state.currentBidWinner) return state;
  // Only the buyer can make this choice
  if (seat !== state.currentBidWinner) return state;

  state.singingChoicePending = false;

  const buyerSeat = state.currentBidWinner;
  const partnerSeat = getTeammate(buyerSeat);
  const singerSeat = choice === 'self' ? buyerSeat : partnerSeat;

  state.currentTurnSeat = singerSeat;
  state.turnStartedAt = Date.now();
  state.lastMessage = `${state.players[singerSeat]?.name} שר!`;

  return state;
}

function finishSingingAfterTrick(state: GameState): GameState {
  state.singingDone = true;
  state.singingAfterTrick = false;
  state.singingChoicePending = false;
  state.phase = GamePhase.TRICK_PLAY;
  const lastTrick = state.completedTricks[state.completedTricks.length - 1];
  if (lastTrick && lastTrick.winnerSeat) {
    state.trickNumber++;
    state.currentTurnSeat = lastTrick.winnerSeat;
    state.turnStartedAt = Date.now();
    state.currentTrick = { cards: [], leadSeat: lastTrick.winnerSeat };
  }
  return state;
}

export function doneSinging(state: GameState, seat: SeatPosition): GameState {
  if (state.phase !== GamePhase.SINGING) return state;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return state;
  if (state.singingChoicePending) return state; // Must choose singer first
  // Only the current turn singer can skip
  if (state.currentTurnSeat !== seat) return state;

  // If singing after a trick win, one suit only — done means skip singing
  if (state.singingAfterTrick) {
    return finishSingingAfterTrick(state);
  }

  // Initial singing (before first trick) — move to next bidding team member
  let nextSeat = getNextSeat(seat);
  for (let i = 0; i < 3; i++) {
    if (SEAT_TEAM[nextSeat] === state.biddingTeam && nextSeat !== seat) {
      const player = state.players[nextSeat];
      if (player && state.trumpSuit) {
        const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, nextSeat, state.biddingTeam!);
        if (singable.length > 0) {
          state.currentTurnSeat = nextSeat;
          state.turnStartedAt = Date.now();
          return state;
        }
      }
    }
    nextSeat = getNextSeat(nextSeat);
  }

  // No more singing
  state.singingDone = true;

  return state;
}

function startTrickPhase(state: GameState) {
  state.phase = GamePhase.TRICK_PLAY;
  state.trickNumber = 1;
  const firstPlayer = getNextSeat(state.dealerSeat);
  state.currentTurnSeat = firstPlayer;
  state.turnStartedAt = Date.now();
  state.currentTrick = { cards: [], leadSeat: firstPlayer };
  state.lastMessage = `שלב לקיחה. תור ${state.players[firstPlayer]?.name}`;
}

export function playCard(state: GameState, seat: SeatPosition, cardId: string): GameState {
  if (state.trickPendingResolution) {
    console.log(`[playCard] REJECTED: trick pending resolution. seat=${seat}, cardId=${cardId}`);
    return state;
  }
  if (state.phase !== GamePhase.TRICK_PLAY) {
    console.log(`[playCard] REJECTED: phase is ${state.phase}, not TRICK_PLAY. seat=${seat}, cardId=${cardId}`);
    return state;
  }
  if (state.currentTurnSeat !== seat) {
    console.log(`[playCard] REJECTED: not ${seat}'s turn, current turn is ${state.currentTurnSeat}. cardId=${cardId}`);
    return state;
  }

  const player = state.players[seat];
  if (!player) return state;

  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    console.log(`[playCard] REJECTED: card ${cardId} not in ${seat}'s hand. Hand: ${player.hand.map(c=>c.id).join(',')}`);
    return state;
  }

  const card = player.hand[cardIndex];

  // Validate the play
  const validPlays = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
  console.log(`[playCard] seat=${seat}, card=${cardId}, validPlays=[${validPlays.map(c=>c.id).join(',')}], trickCards=[${state.currentTrick.cards.map(tc=>`${tc.seat}:${tc.card.id}`).join(',')}], trump=${state.trumpSuit}`);

  if (!validPlays.some(c => c.id === cardId)) {
    // Safety fallback: if valid plays returned empty or doesn't include ANY hand card, allow the play
    const handIds = new Set(player.hand.map(c => c.id));
    const anyValidInHand = validPlays.some(c => handIds.has(c.id));
    if (!anyValidInHand) {
      console.log(`[playCard] WARNING: getValidPlays returned no cards in hand! Allowing play as fallback.`);
    } else {
      console.log(`[playCard] REJECTED: ${cardId} not in valid plays`);
      return state;
    }
  }
  
  // Play the card
  player.hand.splice(cardIndex, 1);
  state.currentTrick.cards.push({ card, seat });
  
  if (state.currentTrick.cards.length === 4) {
    // Trick complete — mark pending, don't resolve yet (server will delay for display)
    state.trickPendingResolution = true;
  } else {
    state.currentTurnSeat = getNextSeat(seat);
    state.turnStartedAt = Date.now();
    state.lastMessage = `תור ${state.players[state.currentTurnSeat]?.name}`;
  }
  
  return state;
}

export function resolveTrick(state: GameState): GameState {
  state.trickPendingResolution = false;

  const winner = determineTrickWinner(state.currentTrick, state.trumpSuit);
  state.currentTrick.winnerSeat = winner.seat;
  state.completedTricks.push({ ...state.currentTrick });

  const winnerTeam = SEAT_TEAM[winner.seat];
  if (winnerTeam === 'team1') state.team1TricksWon++;
  else state.team2TricksWon++;

  state.lastMessage = `${state.players[winner.seat]?.name} לקח את הלקיחה`;

  // Check for technical capo - only need first trick
  if (state.capoType === CapoType.TECHNICAL && state.completedTricks.length === 1) {
    return endRound(state);
  }

  // Check for bid capo - if they lost a trick, end
  if (state.capoType === CapoType.BID) {
    const capoTeam = state.biddingTeam!;
    const otherTeam = capoTeam === 'team1' ? 'team2' : 'team1';
    const otherWon = otherTeam === 'team1' ? state.team1TricksWon : state.team2TricksWon;
    if (otherWon > 0) {
      return endRound(state);
    }
  }

  // Check if all tricks played
  if (state.completedTricks.length === 10) {
    return endRound(state);
  }

  // Check if winner is on bidding team and can sing (one sing per trick win)
  if (state.biddingTeam && winnerTeam === state.biddingTeam && state.trumpSuit && state.currentBidWinner) {
    const buyerSeat = state.currentBidWinner;
    const partnerSeat = getTeammate(buyerSeat);
    const buyerCanSing = canSeatSing(state, buyerSeat);
    const partnerCanSing = canSeatSing(state, partnerSeat);

    if (buyerCanSing || partnerCanSing) {
      state.phase = GamePhase.SINGING;
      state.singingAfterTrick = true;

      if (buyerCanSing && partnerCanSing) {
        // Both can sing — buyer must choose who sings
        state.singingChoicePending = true;
        state.currentTurnSeat = buyerSeat;
        state.lastMessage = `${state.players[buyerSeat]?.name} בוחר מי שר`;
        return state;
      } else if (buyerCanSing) {
        // Only buyer can sing — go directly to buyer
        state.currentTurnSeat = buyerSeat;
        state.lastMessage = `${state.players[buyerSeat]?.name} יכול לשיר!`;
        return state;
      } else {
        // Only partner can sing — go directly to partner
        state.currentTurnSeat = partnerSeat;
        state.lastMessage = `${state.players[partnerSeat]?.name} יכול לשיר!`;
        return state;
      }
    }
  }

  // Next trick
  state.trickNumber++;
  state.currentTurnSeat = winner.seat;
  state.turnStartedAt = Date.now();
  state.currentTrick = { cards: [], leadSeat: winner.seat };

  return state;
}

function endRound(state: GameState): GameState {
  state.phase = GamePhase.ROUND_SCORING;

  const singingPoints = { team1: 0, team2: 0 };
  for (const cante of state.cantes) {
    const team = SEAT_TEAM[cante.seat];
    singingPoints[team] += cante.points;
  }

  let team1TrickPts = 0;
  let team2TrickPts = 0;

  for (let i = 0; i < state.completedTricks.length; i++) {
    const trick = state.completedTricks[i];
    const winner = determineTrickWinner(trick, state.trumpSuit);
    const pts = calculateTrickPoints(trick);
    const lastTrickBonus = (i === state.completedTricks.length - 1 && state.completedTricks.length === 10) ? 10 : 0;

    if (SEAT_TEAM[winner.seat] === 'team1') {
      team1TrickPts += pts + lastTrickBonus;
    } else {
      team2TrickPts += pts + lastTrickBonus;
    }
  }

  // Handle capo scoring
  if (state.capoType === CapoType.TECHNICAL) {
    const capoTeam = state.biddingTeam!;
    const firstTrickWinner = state.completedTricks[0] ? determineTrickWinner(state.completedTricks[0], state.trumpSuit) : null;
    const capoSucceeded = firstTrickWinner && SEAT_TEAM[firstTrickWinner.seat] === capoTeam;

    if (capoSucceeded) {
      // Capo succeeded: bidding team gets 230, other team gets 0
      if (capoTeam === 'team1') {
        state.scores.team1 += 230;
      } else {
        state.scores.team2 += 230;
      }
    } else {
      // Capo failed: other team gets 230, bidding team gets 0
      if (capoTeam === 'team1') {
        state.scores.team2 += 230;
      } else {
        state.scores.team1 += 230;
      }
    }

    const roundScore: RoundScore = {
      team1TrickPoints: team1TrickPts,
      team2TrickPoints: team2TrickPts,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      team1Total: capoTeam === 'team1' && capoSucceeded ? 230 : (capoTeam === 'team2' ? 0 : 230),
      team2Total: capoTeam === 'team2' && capoSucceeded ? 230 : (capoTeam === 'team1' ? 0 : 230),
      biddingTeam: state.biddingTeam,
      bidAmount: 230,
      biddingTeamFell: !capoSucceeded,
    };

    state.roundHistory.push(roundScore);
    state.lastMessage = capoSucceeded ? 'קאפו טכני הצליח! 230 נקודות!' : 'קאפו טכני נכשל!';

    // Check if any team reached target score
    if (state.scores.team1 >= state.targetScore || state.scores.team2 >= state.targetScore) {
      state.phase = GamePhase.GAME_OVER;
    }

    return state;
  }

  if (state.capoType === CapoType.BID) {
    const capoTeam = state.biddingTeam!;
    const otherTeam = capoTeam === 'team1' ? 'team2' : 'team1';
    const otherWon = otherTeam === 'team1' ? state.team1TricksWon : state.team2TricksWon;
    const capoSucceeded = otherWon === 0;

    if (capoSucceeded) {
      // Bid capo succeeded: bidding team gets 230, other team gets 0
      if (capoTeam === 'team1') {
        state.scores.team1 += 230;
      } else {
        state.scores.team2 += 230;
      }
    } else {
      // Bid capo failed: other team gets 230, bidding team gets 0
      if (capoTeam === 'team1') {
        state.scores.team2 += 230;
      } else {
        state.scores.team1 += 230;
      }
    }

    const roundScore: RoundScore = {
      team1TrickPoints: team1TrickPts,
      team2TrickPoints: team2TrickPts,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      team1Total: capoTeam === 'team1' && capoSucceeded ? 230 : (capoTeam === 'team2' ? 0 : 230),
      team2Total: capoTeam === 'team2' && capoSucceeded ? 230 : (capoTeam === 'team1' ? 0 : 230),
      biddingTeam: state.biddingTeam,
      bidAmount: 230,
      biddingTeamFell: !capoSucceeded,
    };

    state.roundHistory.push(roundScore);
    state.lastMessage = capoSucceeded ? 'קאפו הצליח! 230 נקודות!' : 'קאפו נכשל!';

    // Check if any team reached target score
    if (state.scores.team1 >= state.targetScore || state.scores.team2 >= state.targetScore) {
      state.phase = GamePhase.GAME_OVER;
    }

    return state;
  }

  // Normal scoring
  const team1Total = team1TrickPts + singingPoints.team1;
  const team2Total = team2TrickPts + singingPoints.team2;

  let team1FinalScore = 0;
  let team2FinalScore = 0;

  const bidTeam = state.biddingTeam!;
  const bidTeamTotal = bidTeam === 'team1' ? team1Total : team2Total;
  const biddingTeamFell = bidTeamTotal < state.currentBidAmount;

  if (biddingTeamFell) {
    // Bidding team fell: other team scores the bid amount
    if (bidTeam === 'team1') {
      team2FinalScore = state.currentBidAmount;
      state.scores.team2 += team2FinalScore;
    } else {
      team1FinalScore = state.currentBidAmount;
      state.scores.team1 += team1FinalScore;
    }
  } else {
    // Bidding team succeeded: bidding team scores the bid amount, other team scores 0
    if (bidTeam === 'team1') {
      team1FinalScore = state.currentBidAmount;
      state.scores.team1 += team1FinalScore;
    } else {
      team2FinalScore = state.currentBidAmount;
      state.scores.team2 += team2FinalScore;
    }
  }

  const roundScore: RoundScore = {
    team1TrickPoints: team1TrickPts,
    team2TrickPoints: team2TrickPts,
    team1SingingPoints: singingPoints.team1,
    team2SingingPoints: singingPoints.team2,
    team1Total: team1FinalScore,
    team2Total: team2FinalScore,
    biddingTeam: bidTeam,
    bidAmount: state.currentBidAmount,
    biddingTeamFell,
  };

  state.roundHistory.push(roundScore);

  if (biddingTeamFell) {
    state.lastMessage = `הקבוצה המציעה נפלה! (${bidTeamTotal}/${state.currentBidAmount})`;
  } else {
    state.lastMessage = `סיום סיבוב. קבוצה 1: ${team1FinalScore}, קבוצה 2: ${team2FinalScore}`;
  }

  // Check if any team reached target score
  if (state.scores.team1 >= state.targetScore || state.scores.team2 >= state.targetScore) {
    state.phase = GamePhase.GAME_OVER;
  }

  return state;
}

export function nextRound(state: GameState): GameState {
  // Only allow next round from scoring or game over phases
  if (state.phase !== GamePhase.ROUND_SCORING && state.phase !== GamePhase.GAME_OVER) {
    console.log(`[nextRound] REJECTED: phase is ${state.phase}, expected ROUND_SCORING or GAME_OVER`);
    return state;
  }
  state.dealerSeat = getNextSeat(state.dealerSeat);
  return startRound(state);
}

export function getClientState(state: GameState, seat: SeatPosition): ClientGameState {
  const player = state.players[seat];
  const validActions = getValidActions(state, seat);

  const players: ClientGameState['players'] = {} as any;
  for (const s of SEAT_ORDER) {
    const p = state.players[s];
    players[s] = p ? { name: p.name, cardCount: p.hand.length, connected: p.connected, avatar: p.avatar } : null;
  }

  return {
    phase: state.phase,
    myHand: player?.hand || [],
    mySeat: seat,
    players,
    dealerSeat: state.dealerSeat,
    currentTurnSeat: state.currentTurnSeat,
    turnStartedAt: state.turnStartedAt,
    bids: state.bids,
    currentBidAmount: state.currentBidAmount,
    currentBidWinner: state.currentBidWinner,
    biddingTeam: state.biddingTeam,
    trumpSuit: state.trumpSuit,
    capoType: state.capoType,
    capoDeclarerSeat: state.capoDeclarerSeat,
    cantes: state.cantes,
    singingDone: state.singingDone,
    singingChoicePending: state.singingChoicePending,
    currentTrick: state.currentTrick,
    completedTricks: state.completedTricks,
    trickNumber: state.trickNumber,
    team1TricksWon: state.team1TricksWon,
    team2TricksWon: state.team2TricksWon,
    scores: state.scores,
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
    roomSettings: { targetScore: state.targetScore },
    lastMessage: state.lastMessage,
    validActions,
  };
}

function getValidActions(state: GameState, seat: SeatPosition): ValidActions {
  const actions: ValidActions = {
    canBid: false,
    canPass: false,
    minBid: 70,
    canDeclareTrump: false,
    canSing: false,
    singableCantes: [],
    canChooseSinger: false,
    playableCards: [],
    canDeclareCapo: false,
  };

  const player = state.players[seat];
  if (!player) return actions;

  if (state.phase === GamePhase.BIDDING && state.currentTurnSeat === seat) {
    actions.canBid = true;
    actions.canPass = true;
    actions.minBid = Math.max(70, state.currentBidAmount); // can match current bid (declaration) or go higher
    actions.canDeclareCapo = true;
  }

  if (state.phase === GamePhase.TRUMP_DECLARATION && state.currentTurnSeat === seat) {
    actions.canDeclareTrump = true;
  }

  if (state.phase === GamePhase.SINGING && state.biddingTeam && SEAT_TEAM[seat] === state.biddingTeam) {
    if (state.singingChoicePending) {
      // Buyer must choose who sings
      if (seat === state.currentBidWinner) {
        actions.canChooseSinger = true;
      }
    } else if (state.singingAfterTrick || state.currentTurnSeat === seat) {
      const singable = getSingableSuits(
        player.hand, state.trumpSuit!, state.currentBidAmount, state.cantes, seat, state.biddingTeam
      );
      actions.canSing = singable.length > 0;
      actions.singableCantes = singable;
    }
  }

  if (state.phase === GamePhase.TRICK_PLAY && state.currentTurnSeat === seat) {
    const valid = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
    actions.playableCards = valid.map(c => c.id);
  }

  return actions;
}
