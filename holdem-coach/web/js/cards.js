export const SUITS = [
  { id: "clubs", symbol: "♣", red: false },
  { id: "diamonds", symbol: "♦", red: true },
  { id: "hearts", symbol: "♥", red: true },
  { id: "spades", symbol: "♠", red: false },
];

export const RANKS = [
  { id: 2, symbol: "2", name: "2" },
  { id: 3, symbol: "3", name: "3" },
  { id: 4, symbol: "4", name: "4" },
  { id: 5, symbol: "5", name: "5" },
  { id: 6, symbol: "6", name: "6" },
  { id: 7, symbol: "7", name: "7" },
  { id: 8, symbol: "8", name: "8" },
  { id: 9, symbol: "9", name: "9" },
  { id: 10, symbol: "T", name: "10" },
  { id: 11, symbol: "J", name: "Jack" },
  { id: 12, symbol: "Q", name: "Queen" },
  { id: 13, symbol: "K", name: "King" },
  { id: 14, symbol: "A", name: "Ace" },
];

export function card(rankId, suitId) {
  const rank = RANKS.find((r) => r.id === rankId);
  const suit = SUITS.find((s) => s.id === suitId);
  return {
    id: `${rank.symbol}${suit.symbol}`,
    rank: rank.id,
    rankSymbol: rank.symbol,
    suit: suit.id,
    suitSymbol: suit.symbol,
    red: suit.red,
  };
}

export function cardsHtml(cards) {
  if (!cards?.length) return "";
  return `<div class="cards-row">${cards
    .map(
      (c) => `
      <div class="playing-card ${c.red ? "red" : ""}" aria-label="${c.rankSymbol} of ${c.suit}">
        <span class="rank">${c.rankSymbol}</span>
        <span class="suit">${c.suitSymbol}</span>
      </div>`
    )
    .join("")}</div>`;
}
