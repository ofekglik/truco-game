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
    bids: [],
    currentBidAmount: 0,
    currentBidWinner: null,
    biddingTeam: null,
    trumpSuit: null,
    capoType: CapoType.NONE,
    capoDeclarerSeat: null,
    cantes: [],
    singingDone: false,
    currentTrick: { cards: [], leadSeat: 'east' },
    completedTricks: [],
    trickNumber: 0,
    team1TricksWon: 0,
    team2TricksWon: 0,
    scores: { team1: 0, team2: 0 },
    roundHistory: [],
    roundNumber: 0,
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
  state.bids = [];
  state.currentBidAmount = 0;
  state.currentBidWinner = null;
  state.biddingTeam = null;
  state.trumpSuit = null;
  state.capoType = CapoType.NONE;
  state.capoDeclarerSeat = null;
  state.cantes = [];
  state.singingDone = false;
  state.currentTrick = { cards: [], leadSeat: firstPlayer };
  state.completedTricks = [];
  state.trickNumber = 0;
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
  if (amount !== 0 && amount < 70) return state;
  if (amount !== 0 && amount % 10 !== 0) return state; // Must be multiple of 10
  if (amount !== 0 && amount <= state.currentBidAmount) return state;
  if (amount > 230) return state;
  
  const bid: Bid = { seat, amount };
  state.bids.push(bid);
  
  if (amount > 0) {
    state.currentBidAmount = amount;
    state.currentBidWinner = seat;
    
    if (amount === 230) {
      // Bid capo
      state.capoType = CapoType.BID;
      state.capoDeclarerSeat = seat;
      state.biddingTeam = SEAT_TEAM[seat];
      state.phase = GamePhase.TRUMP_DECLARATION;
      state.currentTurnSeat = seat;
      state.lastMessage = `${state.players[seat]?.name} הכריז קאפו!`;
      return state;
    }
  }
  
  // Move to next non-passed player
  let nextSeat = getNextSeat(seat);
  let passCount = 0;
  
  while (passCount < 4) {
    // Check if this player already passed
    const playerBids = state.bids.filter(b => b.seat === nextSeat);
    const hasPassed = playerBids.some(b => b.amount === 0);
    const isCurrentWinner = nextSeat === state.currentBidWinner;
    
    if (!hasPassed && !isCurrentWinner) {
      state.currentTurnSeat = nextSeat;
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
    state.lastMessage = `${state.players[state.currentBidWinner]?.name} זכה בהצעה (${state.currentBidAmount}). בחר אטו.`;
  } else {
    // All passed - reshuffle
    state.dealerSeat = getNextSeat(state.dealerSeat);
    state.lastMessage = 'כולם עברו. ערבוב מחדש...';
    return startRound(state);
  }
  
  return state;
}

export function declareTrump(state: GameState, seat: SeatPosition, suit: Suit): GameState {
  if (state.phase !== GamePhase.TRUMP_DECLARATION) return state;
  if (state.currentTurnSeat !== seat) return state;
  
  state.trumpSuit = suit;
  
  // Check if singing is relevant (bid >= 80)
  if (state.currentBidAmount >= 80 || state.capoType !== CapoType.NONE) {
    state.phase = GamePhase.SINGING;
    // Start singing with the first player of the bidding team after dealer
    let singingSeat = getNextSeat(state.dealerSeat);
    // Find first bidding team member
    for (let i = 0; i < 4; i++) {
      if (SEAT_TEAM[singingSeat] === state.biddingTeam) break;
      singingSeat = getNextSeat(singingSeat);
    }
    state.currentTurnSeat = singingSeat;
    
    // Check if anyone can actually sing
    const canAnySing = checkAnySinging(state);
    if (!canAnySing) {
      state.singingDone = true;
      startTrickPhase(state);
    } else {
      state.lastMessage = `אטו: ${SUIT_NAMES_HE[suit]}. שלב שירה.`;
    }
  } else {
    startTrickPhase(state);
  }
  
  return state;
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

export function singCante(state: GameState, seat: SeatPosition, suit: Suit): GameState {
  if (state.phase !== GamePhase.SINGING) return state;
  if (!state.trumpSuit || !state.biddingTeam) return state;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return state;
  
  const player = state.players[seat];
  if (!player) return state;
  
  const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, seat, state.biddingTeam);
  if (!singable.includes(suit)) return state;
  
  const isTrump = suit === state.trumpSuit;
  const points = isTrump ? 40 : 20;
  
  state.cantes.push({ suit, isTrump, points, seat });
  state.lastMessage = `${player.name} שר ${SUIT_NAMES_HE[suit]}${isTrump ? ' (אטו)' : ''} — ${points} נקודות`;
  
  return state;
}

export function doneSinging(state: GameState, seat: SeatPosition): GameState {
  if (state.phase !== GamePhase.SINGING) return state;
  if (SEAT_TEAM[seat] !== state.biddingTeam) return state;
  
  // Move to next bidding team member
  let nextSeat = getNextSeat(seat);
  for (let i = 0; i < 3; i++) {
    if (SEAT_TEAM[nextSeat] === state.biddingTeam && nextSeat !== seat) {
      const player = state.players[nextSeat];
      if (player && state.trumpSuit) {
        const singable = getSingableSuits(player.hand, state.trumpSuit, state.currentBidAmount, state.cantes, nextSeat, state.biddingTeam!);
        if (singable.length > 0) {
          state.currentTurnSeat = nextSeat;
          return state;
        }
      }
    }
    nextSeat = getNextSeat(nextSeat);
  }
  
  // No more singing
  state.singingDone = true;
  startTrickPhase(state);
  return state;
}

function startTrickPhase(state: GameState) {
  state.phase = GamePhase.TRICK_PLAY;
  state.trickNumber = 1;
  const firstPlayer = getNextSeat(state.dealerSeat);
  state.currentTurnSeat = firstPlayer;
  state.currentTrick = { cards: [], leadSeat: firstPlayer };
  state.lastMessage = `שלב לקיחה. תור ${state.players[firstPlayer]?.name}`;
}

export function playCard(state: GameState, seat: SeatPosition, cardId: string): GameState {
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
    // Trick complete
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
    
    // Next trick
    state.trickNumber++;
    state.currentTurnSeat = winner.seat;
    state.currentTrick = { cards: [], leadSeat: winner.seat };
  } else {
    state.currentTurnSeat = getNextSeat(seat);
    state.lastMessage = `תור ${state.players[state.currentTurnSeat]?.name}`;
  }
  
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
    
    if (firstTrickWinner && SEAT_TEAM[firstTrickWinner.seat] === capoTeam) {
      if (capoTeam === 'team1') { team1TrickPts = 230; team2TrickPts = 0; }
      else { team2TrickPts = 230; team1TrickPts = 0; }
      singingPoints.team1 = 0; singingPoints.team2 = 0;
    } else {
      if (capoTeam === 'team1') { team1TrickPts = 0; }
      else { team2TrickPts = 0; }
    }
    
    const roundScore: RoundScore = {
      team1TrickPoints: team1TrickPts,
      team2TrickPoints: team2TrickPts,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      team1Total: team1TrickPts,
      team2Total: team2TrickPts,
      biddingTeam: state.biddingTeam,
      bidAmount: 230,
      biddingTeamFell: firstTrickWinner ? SEAT_TEAM[firstTrickWinner.seat] !== capoTeam : true,
    };
    
    state.scores.team1 += roundScore.team1Total;
    state.scores.team2 += roundScore.team2Total;
    state.roundHistory.push(roundScore);
    state.lastMessage = roundScore.biddingTeamFell ? 'קאפו טכני נכשל!' : 'קאפו טכני הצליח! 230 נקודות!';
    return state;
  }
  
  if (state.capoType === CapoType.BID) {
    const capoTeam = state.biddingTeam!;
    const otherTeam = capoTeam === 'team1' ? 'team2' : 'team1';
    const otherWon = otherTeam === 'team1' ? state.team1TricksWon : state.team2TricksWon;
    
    if (otherWon === 0) {
      // Bid capo succeeded
      if (capoTeam === 'team1') { team1TrickPts = 230; team2TrickPts = 0; }
      else { team2TrickPts = 230; team1TrickPts = 0; }
    } else {
      // Bid capo failed
      if (capoTeam === 'team1') { team1TrickPts = 0; }
      else { team2TrickPts = 0; }
    }
    singingPoints.team1 = 0; singingPoints.team2 = 0;
    
    const roundScore: RoundScore = {
      team1TrickPoints: team1TrickPts,
      team2TrickPoints: team2TrickPts,
      team1SingingPoints: 0,
      team2SingingPoints: 0,
      team1Total: team1TrickPts,
      team2Total: team2TrickPts,
      biddingTeam: state.biddingTeam,
      bidAmount: 230,
      biddingTeamFell: otherWon > 0,
    };
    
    state.scores.team1 += roundScore.team1Total;
    state.scores.team2 += roundScore.team2Total;
    state.roundHistory.push(roundScore);
    state.lastMessage = roundScore.biddingTeamFell ? 'קאפו נכשל!' : 'קאפו הצליח! 230 נקודות!';
    return state;
  }
  
  // Normal scoring
  const team1Total = team1TrickPts + singingPoints.team1;
  const team2Total = team2TrickPts + singingPoints.team2;
  
  let biddingTeamFell = false;
  const bidTeam = state.biddingTeam!;
  const bidTeamTotal = bidTeam === 'team1' ? team1Total : team2Total;
  
  if (bidTeamTotal < state.currentBidAmount) {
    biddingTeamFell = true;
    // Bidding team scores 0
    if (bidTeam === 'team1') {
      const roundScore: RoundScore = {
        team1TrickPoints: team1TrickPts, team2TrickPoints: team2TrickPts,
        team1SingingPoints: singingPoints.team1, team2SingingPoints: singingPoints.team2,
        team1Total: 0, team2Total: team2Total,
        biddingTeam: bidTeam, bidAmount: state.currentBidAmount, biddingTeamFell: true,
      };
      state.scores.team2 += team2Total;
      state.roundHistory.push(roundScore);
    } else {
      const roundScore: RoundScore = {
        team1TrickPoints: team1TrickPts, team2TrickPoints: team2TrickPts,
        team1SingingPoints: singingPoints.team1, team2SingingPoints: singingPoints.team2,
        team1Total: team1Total, team2Total: 0,
        biddingTeam: bidTeam, bidAmount: state.currentBidAmount, biddingTeamFell: true,
      };
      state.scores.team1 += team1Total;
      state.roundHistory.push(roundScore);
    }
    state.lastMessage = `הקבוצה המציעה נפלה! (${bidTeamTotal}/${state.currentBidAmount})`;
  } else {
    const roundScore: RoundScore = {
      team1TrickPoints: team1TrickPts, team2TrickPoints: team2TrickPts,
      team1SingingPoints: singingPoints.team1, team2SingingPoints: singingPoints.team2,
      team1Total: team1Total, team2Total: team2Total,
      biddingTeam: bidTeam, bidAmount: state.currentBidAmount, biddingTeamFell: false,
    };
    state.scores.team1 += team1Total;
    state.scores.team2 += team2Total;
    state.roundHistory.push(roundScore);
    state.lastMessage = `סיום סיבוב. קבוצה 1: ${team1Total}, קבוצה 2: ${team2Total}`;
  }
  
  return state;
}

export function nextRound(state: GameState): GameState {
  state.dealerSeat = getNextSeat(state.dealerSeat);
  return startRound(state);
}

export function getClientState(state: GameState, seat: SeatPosition): ClientGameState {
  const player = state.players[seat];
  const validActions = getValidActions(state, seat);
  
  const players: ClientGameState['players'] = {} as any;
  for (const s of SEAT_ORDER) {
    const p = state.players[s];
    players[s] = p ? { name: p.name, cardCount: p.hand.length, connected: p.connected } : null;
  }
  
  return {
    phase: state.phase,
    myHand: player?.hand || [],
    mySeat: seat,
    players,
    dealerSeat: state.dealerSeat,
    currentTurnSeat: state.currentTurnSeat,
    bids: state.bids,
    currentBidAmount: state.currentBidAmount,
    currentBidWinner: state.currentBidWinner,
    biddingTeam: state.biddingTeam,
    trumpSuit: state.trumpSuit,
    capoType: state.capoType,
    capoDeclarerSeat: state.capoDeclarerSeat,
    cantes: state.cantes,
    singingDone: state.singingDone,
    currentTrick: state.currentTrick,
    completedTricks: state.completedTricks,
    trickNumber: state.trickNumber,
    team1TricksWon: state.team1TricksWon,
    team2TricksWon: state.team2TricksWon,
    scores: state.scores,
    roundHistory: state.roundHistory,
    roundNumber: state.roundNumber,
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
    playableCards: [],
    canDeclareCapo: false,
  };
  
  const player = state.players[seat];
  if (!player) return actions;
  
  if (state.phase === GamePhase.BIDDING && state.currentTurnSeat === seat) {
    actions.canBid = true;
    actions.canPass = true;
    actions.minBid = Math.max(70, state.currentBidAmount + 10); // increments of 10
    actions.canDeclareCapo = true;
  }
  
  if (state.phase === GamePhase.TRUMP_DECLARATION && state.currentTurnSeat === seat) {
    actions.canDeclareTrump = true;
  }
  
  if (state.phase === GamePhase.SINGING && state.biddingTeam && SEAT_TEAM[seat] === state.biddingTeam) {
    const singable = getSingableSuits(
      player.hand, state.trumpSuit!, state.currentBidAmount, state.cantes, seat, state.biddingTeam
    );
    actions.canSing = singable.length > 0;
    actions.singableCantes = singable;
  }
  
  if (state.phase === GamePhase.TRICK_PLAY && state.currentTurnSeat === seat) {
    const valid = getValidPlays(player.hand, state.currentTrick, state.trumpSuit);
    actions.playableCards = valid.map(c => c.id);
  }
  
  return actions;
}
