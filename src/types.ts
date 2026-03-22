export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardValue = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  value: CardValue;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  team: 1 | 2;
  cards: Card[];
  ready: boolean;
}

export interface PlayedCard {
  playerId: string;
  playerName: string;
  team: 1 | 2;
  card: Card;
}

export interface Room {
  id: string;
  players: Player[];
  gameState: 'waiting' | 'playing' | 'finished';
  currentTurn: number;
  scores: { team1: number; team2: number };
  roundPoints: number;
  cardsOnTable: PlayedCard[];
  manilha: CardValue | null;
  vira: Card | null;
  rounds: (1 | 2)[];
}
