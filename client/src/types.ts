// Re-export types that match the server
export enum Suit {
  OROS = 'oros',
  COPAS = 'copas',
  ESPADAS = 'espadas',
  BASTOS = 'bastos'
}

export const SUIT_NAMES_HE: Record<Suit, string> = {
  [Suit.OROS]: 'זהב',
  [Suit.COPAS]: 'כוסות',
  [Suit.ESPADAS]: 'חרבות',
  [Suit.BASTOS]: 'מקלות',
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.OROS]: '🪙',
  [Suit.COPAS]: '🏆',
  [Suit.ESPADAS]: '⚔️',
  [Suit.BASTOS]: '🪵',
};

export const SUIT_COLORS: Record<Suit, string> = {
  [Suit.OROS]: '#FFD700',
  [Suit.COPAS]: '#DC2626',
  [Suit.ESPADAS]: '#3B82F6',
  [Suit.BASTOS]: '#22C55E',
};

export const RANK_NAMES_HE: Record<number, string> = {
  1: 'אס',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  10: 'סוטה',
  11: 'סוס',
  12: 'מלך',
};

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export type SeatPosition = 'north' | 'south' | 'east' | 'west';
export type TeamId = 'team1' | 'team2';

export const SEAT_TEAM: Record<SeatPosition, TeamId> = {
  south: 'team1', north: 'team1',
  east: 'team2', west: 'team2',
};

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

export enum CapoType {
  NONE = 'none',
  TECHNICAL = 'technical',
  BID = 'bid',
}

export interface Bid {
  seat: SeatPosition;
  amount: number;
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

export interface ValidActions {
  canBid: boolean;
  canPass: boolean;
  minBid: number;
  canDeclareTrump: boolean;
  canSing: boolean;
  singableCantes: Suit[];
  playableCards: string[];
  canDeclareCapo: boolean;
}

export interface ClientGameState {
  phase: GamePhase;
  myHand: Card[];
  mySeat: SeatPosition;
  players: Record<SeatPosition, { name: string; cardCount: number; connected: boolean } | null>;
  dealerSeat: SeatPosition;
  currentTurnSeat: SeatPosition;
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

export const SEAT_NAMES_HE: Record<SeatPosition, string> = {
  south: 'דרום',
  north: 'צפון',
  east: 'מזרח',
  west: 'מערב',
};

export const CARD_POWER: Record<Rank, number> = {
  2: 0, 4: 1, 5: 2, 6: 3, 7: 4, 10: 5, 11: 6, 12: 7, 3: 8, 1: 9
};
