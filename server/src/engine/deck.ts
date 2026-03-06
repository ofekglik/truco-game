import { Card, Suit, RANKS, Rank } from './types.js';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of Object.values(Suit)) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[]): [Card[], Card[], Card[], Card[]] {
  return [
    deck.slice(0, 10),
    deck.slice(10, 20),
    deck.slice(20, 30),
    deck.slice(30, 40),
  ];
}
