export const HAND_CATEGORIES = [
  { id: 1, title: "High Card", blurb: "No pair — highest card wins." },
  { id: 2, title: "One Pair", blurb: "Two cards of the same rank." },
  { id: 3, title: "Two Pair", blurb: "Two different pairs." },
  { id: 4, title: "Three of a Kind", blurb: "Three cards of the same rank." },
  { id: 5, title: "Straight", blurb: "Five cards in sequence, mixed suits." },
  { id: 6, title: "Flush", blurb: "Five cards of the same suit." },
  { id: 7, title: "Full House", blurb: "Three of a kind plus a pair." },
  { id: 8, title: "Four of a Kind", blurb: "Four cards of the same rank." },
  { id: 9, title: "Straight Flush", blurb: "Five in sequence, same suit." },
  { id: 10, title: "Royal Flush", blurb: "A-K-Q-J-T, all the same suit." },
];

function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  function rec(start, path) {
    if (path.length === k) {
      out.push(path.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      path.push(arr[i]);
      rec(i + 1, path);
      path.pop();
    }
  }
  rec(0, []);
  return out;
}

function straightHigh(ranksDesc) {
  const uniq = [...new Set(ranksDesc)].sort((a, b) => b - a);
  if (uniq.length !== 5) return null;
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
    return 5;
  }
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  return null;
}

function rankGroups(ranks) {
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  return [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
}

export function evaluateFive(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const highStraight = straightHigh(ranks);
  const groups = rankGroups(ranks);

  if (isFlush && highStraight != null) {
    if (highStraight === 14) return { categoryId: 10, tiebreakers: [highStraight] };
    return { categoryId: 9, tiebreakers: [highStraight] };
  }

  const quad = groups.find((g) => g.count === 4);
  if (quad) {
    const kicker = groups.find((g) => g.count === 1).rank;
    return { categoryId: 8, tiebreakers: [quad.rank, kicker] };
  }

  const trips = groups.find((g) => g.count === 3);
  const pair = groups.find((g) => g.count === 2);
  if (trips && pair) {
    return { categoryId: 7, tiebreakers: [trips.rank, pair.rank] };
  }

  if (isFlush) return { categoryId: 6, tiebreakers: ranks };
  if (highStraight != null) return { categoryId: 5, tiebreakers: [highStraight] };

  if (trips) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.rank);
    return { categoryId: 4, tiebreakers: [trips.rank, ...kickers] };
  }

  const pairs = groups.filter((g) => g.count === 2).map((g) => g.rank);
  if (pairs.length === 2) {
    const kicker = groups.find((g) => g.count === 1).rank;
    return { categoryId: 3, tiebreakers: [...pairs, kicker] };
  }
  if (pairs.length === 1) {
    const kickers = groups.filter((g) => g.count === 1).map((g) => g.rank);
    return { categoryId: 2, tiebreakers: [pairs[0], ...kickers] };
  }

  return { categoryId: 1, tiebreakers: ranks };
}

function isBetter(a, b) {
  if (a.categoryId !== b.categoryId) return a.categoryId > b.categoryId;
  for (let i = 0; i < a.tiebreakers.length; i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i] > b.tiebreakers[i];
  }
  return false;
}

export function bestHand(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error("Need 5–7 cards");
  let best = null;
  for (const five of combinations(cards, 5)) {
    const ev = evaluateFive(five);
    if (!best || isBetter(ev, best)) best = ev;
  }
  return best;
}

export function categoryTitle(id) {
  return HAND_CATEGORIES.find((c) => c.id === id)?.title || "Unknown";
}
