// === SHARED TYPES FOR TRUCO CARD GAME ===

export enum Suit {
  OROS = 'oros',     // זהב - Coins
  COPAS = 'copas',   // כוסות - Cups
  ESPADAS = 'espadas', // חרבות - Swords
  BASTOS = 'bastos'  // מקלות - Clubs
}

export const SUIT_NAMES_HE: Record<Suit, string> = {
  [Suit.OROS]: 'זהב',
  [Suit.COPAS]: 'קופז',
  [Suit.ESPADAS]: 'ספדה',
  [Suit.BASTOS]: 'שחור',
};

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export type Rank = typeof RANKS[number];

export const CARD_POINTS: Record<Rank, number> = {
  1: 11, 2: 0, 3: 10, 4: 0, 5: 0, 6: 0, 7: 0, 10: 2, 11: 3, 12: 4
};

// Trump power order (higher index = stronger)
export const CARD_POWER: Record<Rank, number> = {
  2: 0, 4: 1, 5: 2, 6: 3, 7: 4, 10: 5, 11: 6, 12: 7, 3: 8, 1: 9
};

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g., "oros-1"
}

export type SeatPosition = 'north' | 'south' | 'east' | 'west';
export const SEAT_ORDER: SeatPosition[] = ['south', 'east', 'north', 'west'];
// Teams: south+north vs east+west
export type TeamId = 'team1' | 'team2';

export const SEAT_TEAM: Record<SeatPosition, TeamId> = {
  south: 'team1',
  north: 'team1',
  east: 'team2',
  west: 'team2',
};

export interface Player {
  id: string;        // socket id
  name: string;
  seat: SeatPosition;
  hand: Card[];
  connected: boolean;
  avatar: string;
  supabaseUserId?: string; // authenticated user's Supabase UUID (undefined for guests)
}

export enum GamePhase {
  WAITING = 'waiting',
  DEALING = 'dealing',
  CAPO_CHECK = 'capo_check',
  BIDDING = 'bidding',
  TRUMP_DECLARATION = 'trump_declaration',
  SINGING = 'singing',
  TRICK_PLAY = 'trick_play',
  ROUND_SCORING = 'round_scoring',
  GAME_OVER = 'game_over',
}

export interface Bid {
  seat: SeatPosition;
  amount: number; // 0 = pass
}

export interface TrickCard {
  card: Card;
  seat: SeatPosition;
}

export interface Trick {
  cards: TrickCard[];
  leadSeat: SeatPosition;
  winnerSeat?: SeatPosition;
}

export interface Cante {
  suit: Suit;
  isTrump: boolean;
  points: number;
  seat: SeatPosition;
}

export enum CapoType {
  NONE = 'none',
  TECHNICAL = 'technical', // 4 kings or 4 horses
  BID = 'bid',             // bid 230
}

export interface RoundScore {
  team1TrickPoints: number;
  team2TrickPoints: number;
  team1SingingPoints: number;
  team2SingingPoints: number;
  team1Total: number;
  team2Total: number;
  biddingTeam: TeamId | null;
  bidAmount: number;
  biddingTeamFell: boolean;
}

export interface GameState {
  phase: GamePhase;
  players: Record<SeatPosition, Player | null>;
  dealerSeat: SeatPosition;
  currentTurnSeat: SeatPosition;
  turnStartedAt: number;

  // Bidding
  bids: Bid[];
  currentBidAmount: number;
  currentBidWinner: SeatPosition | null;
  biddingTeam: TeamId | null;

  // Trump
  trumpSuit: Suit | null;

  // Capo
  capoType: CapoType;
  capoDeclarerSeat: SeatPosition | null;

  // Singing
  cantes: Cante[];
  singingDone: boolean;
  singingAfterTrick: boolean; // flag for when singing happens after a trick win

  // Tricks
  currentTrick: Trick;
  completedTricks: Trick[];
  trickNumber: number;
  trickPendingResolution: boolean;
  team1TricksWon: number;
  team2TricksWon: number;

  // Scoring
  scores: { team1: number; team2: number };
  roundHistory: RoundScore[];
  roundNumber: number;
  targetScore: number; // target score to win the game

  // Messages
  lastMessage: string;
}

// Client view - what each player sees (no other players' hands)
export interface ClientGameState {
  phase: GamePhase;
  myHand: Card[];
  mySeat: SeatPosition;
  players: Record<SeatPosition, { name: string; cardCount: number; connected: boolean; avatar: string } | null>;
  dealerSeat: SeatPosition;
  currentTurnSeat: SeatPosition;
  turnStartedAt: number;
  bids: Bid[];
  currentBidAmount: number;
  currentBidWinner: SeatPosition | null;
  biddingTeam: TeamId | null;
  trumpSuit: Suit | null;
  capoType: CapoType;
  capoDeclarerSeat: SeatPosition | null;
  cantes: Cante[];
  singingDone: boolean;
  currentTrick: Trick;
  completedTricks: Trick[];
  trickNumber: number;
  team1TricksWon: number;
  team2TricksWon: number;
  scores: { team1: number; team2: number };
  roundHistory: RoundScore[];
  roundNumber: number;
  targetScore: number;
  roomSettings: { targetScore: number };
  lastMessage: string;
  validActions: ValidActions;
}

export interface ValidActions {
  canBid: boolean;
  canPass: boolean;
  minBid: number;
  canDeclareTrump: boolean;
  canSing: boolean;
  singableCantes: Suit[];
  playableCards: string[]; // card ids
  canDeclareCapo: boolean;
}

// Socket events
export interface ServerToClientEvents {
  gameState: (state: ClientGameState) => void;
  roomJoined: (data: { roomCode: string; seat: SeatPosition; playerName: string }) => void;
  roomError: (message: string) => void;
  playerJoined: (data: { seat: SeatPosition; name: string }) => void;
  playerLeft: (data: { seat: SeatPosition }) => void;
  roomClosed: () => void;
  turnTimeout: (data: { seat: SeatPosition }) => void;
}

export interface ClientToServerEvents {
  createRoom: (playerName: string) => void;
  joinRoom: (data: { roomCode: string; playerName: string }) => void;
  startGame: () => void;
  placeBid: (amount: number) => void;
  passBid: () => void;
  declareTrump: (suit: Suit) => void;
  singCante: (suit: Suit) => void;
  doneSinging: () => void;
  playCard: (cardId: string) => void;
  nextRound: () => void;
  swapSeat: (targetSeat: SeatPosition) => void;
  updateSettings: (settings: { targetScore: number }) => void;
  leaveRoom: () => void;
}
