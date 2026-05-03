import { Card, CardValue, Suit, PlayedCard, Room } from "../types";

export const VALUE_ORDER: CardValue[] = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
export const SUIT_ORDER: Suit[] = ["diamonds", "spades", "hearts", "clubs"];

export function createDeck(): Card[] {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const values: CardValue[] = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const value of values) deck.push({ value, suit });
  }
  return deck;
}

export function shuffle(deck: Card[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

export function getManilha(vira: Card): CardValue {
  const viraIndex = VALUE_ORDER.indexOf(vira.value);
  return VALUE_ORDER[(viraIndex + 1) % VALUE_ORDER.length];
}

export function determineWinner(playedCards: PlayedCard[], manilhaValue: CardValue): PlayedCard {
  let bestCard = playedCards[0];
  for (let i = 1; i < playedCards.length; i++) {
    const current = playedCards[i];
    const isCurrentManilha = current.card.value === manilhaValue;
    const isBestManilha = bestCard.card.value === manilhaValue;

    if (isCurrentManilha && !isBestManilha) {
      bestCard = current;
    } else if (isCurrentManilha && isBestManilha) {
      if (SUIT_ORDER.indexOf(current.card.suit) > SUIT_ORDER.indexOf(bestCard.card.suit)) {
        bestCard = current;
      }
    } else if (!isCurrentManilha && !isBestManilha) {
      if (VALUE_ORDER.indexOf(current.card.value) > VALUE_ORDER.indexOf(bestCard.card.value)) {
        bestCard = current;
      }
    }
  }
  return bestCard;
}

export function startNewRound(room: Room): void {
  const deck = createDeck();
  shuffle(deck);
  room.vira = deck.pop() || null;
  if (room.vira) {
    room.manilha = getManilha(room.vira);
  }
  room.roundPoints = 1;
  room.cardsOnTable = [];
  room.rounds = [];
  room.players.forEach(player => {
    player.cards = [deck.pop()!, deck.pop()!, deck.pop()!];
  });
}
