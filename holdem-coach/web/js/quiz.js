import { card } from "./cards.js";
import { HAND_CATEGORIES, evaluateFive, categoryTitle } from "./hand-evaluator.js";

export const QUIZ_KINDS = [
  { id: "identifyHand", title: "Identify the Hand", detail: "Name the best five-card category" },
  { id: "startingHands", title: "Starting Hands", detail: "Pick the stronger preflop hand" },
  { id: "potOdds", title: "Pot Odds", detail: "Should you call with this price?" },
  { id: "streetDecision", title: "Street Decisions", detail: "Choose the better action" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function identifyHandQuestion() {
  const templates = [
    () => [card(14, "spades"), card(13, "spades"), card(12, "spades"), card(11, "spades"), card(10, "spades")],
    () => [card(9, "hearts"), card(8, "hearts"), card(7, "hearts"), card(6, "hearts"), card(5, "hearts")],
    () => [card(14, "spades"), card(14, "hearts"), card(14, "clubs"), card(14, "diamonds"), card(2, "clubs")],
    () => [card(13, "spades"), card(13, "hearts"), card(13, "clubs"), card(4, "diamonds"), card(4, "clubs")],
    () => [card(14, "spades"), card(11, "spades"), card(9, "spades"), card(6, "spades"), card(3, "spades")],
    () => [card(10, "clubs"), card(9, "hearts"), card(8, "spades"), card(7, "diamonds"), card(6, "clubs")],
    () => [card(12, "hearts"), card(12, "clubs"), card(12, "diamonds"), card(14, "spades"), card(5, "clubs")],
    () => [card(11, "spades"), card(11, "hearts"), card(8, "clubs"), card(8, "diamonds"), card(14, "clubs")],
    () => [card(14, "spades"), card(14, "diamonds"), card(13, "clubs"), card(9, "hearts"), card(4, "spades")],
    () => [card(14, "clubs"), card(13, "diamonds"), card(11, "spades"), card(9, "hearts"), card(3, "clubs")],
  ];
  const cards = pick(templates)();
  const evaluated = evaluateFive(cards);
  const correct = categoryTitle(evaluated.categoryId);
  const wrong = shuffle(HAND_CATEGORIES.filter((c) => c.id !== evaluated.categoryId))
    .slice(0, 3)
    .map((c) => c.title);
  const choices = shuffle([...wrong, correct]);
  return {
    prompt: "What is the best hand?",
    detail: "Five-card showdown",
    cards,
    choices,
    correctIndex: choices.indexOf(correct),
    explanation: `Best category: ${correct}. ${HAND_CATEGORIES.find((c) => c.id === evaluated.categoryId).blurb}`,
  };
}

const STARTING = [
  { label: "A♠ A♥", cards: [card(14, "spades"), card(14, "hearts")], strength: 100 },
  { label: "K♦ K♣", cards: [card(13, "diamonds"), card(13, "clubs")], strength: 95 },
  { label: "Q♠ Q♥", cards: [card(12, "spades"), card(12, "hearts")], strength: 90 },
  { label: "A♠ K♠", cards: [card(14, "spades"), card(13, "spades")], strength: 88 },
  { label: "A♥ K♦", cards: [card(14, "hearts"), card(13, "diamonds")], strength: 84 },
  { label: "J♣ J♦", cards: [card(11, "clubs"), card(11, "diamonds")], strength: 86 },
  { label: "T♠ T♥", cards: [card(10, "spades"), card(10, "hearts")], strength: 80 },
  { label: "A♣ Q♣", cards: [card(14, "clubs"), card(12, "clubs")], strength: 78 },
  { label: "9♠ 9♦", cards: [card(9, "spades"), card(9, "diamonds")], strength: 74 },
  { label: "7♥ 6♥", cards: [card(7, "hearts"), card(6, "hearts")], strength: 55 },
  { label: "K♠ 9♦", cards: [card(13, "spades"), card(9, "diamonds")], strength: 48 },
  { label: "J♥ 3♣", cards: [card(11, "hearts"), card(3, "clubs")], strength: 20 },
  { label: "8♦ 2♠", cards: [card(8, "diamonds"), card(2, "spades")], strength: 10 },
  { label: "5♣ 4♣", cards: [card(5, "clubs"), card(4, "clubs")], strength: 50 },
];

function startingHandQuestion() {
  const [a, b] = shuffle(STARTING).slice(0, 2);
  const strongerIsA = a.strength >= b.strength;
  const winner = strongerIsA ? a.label : b.label;
  const loser = strongerIsA ? b.label : a.label;
  return {
    prompt: "Which hand is stronger to open (late position)?",
    detail: "Assume a full-ring cash game and no prior raises.",
    cards: [...a.cards, ...b.cards],
    choices: [a.label, b.label],
    correctIndex: strongerIsA ? 0 : 1,
    explanation: `${winner} ranks above ${loser} for a late-position open in this training chart.`,
  };
}

function potOddsQuestion() {
  const pot = pick([60, 80, 100, 120, 150]);
  const call = pick([10, 15, 20, 25, 30]);
  const outs = pick([4, 8, 9, 12, 15]);
  const equity = outs * 2;
  const needed = (100 * call) / (pot + call);
  const shouldCall = equity >= needed;
  return {
    prompt: `Pot $${pot}. Call $${call}. You have ~${outs} outs (~${equity}% next card). What do you do?`,
    detail: `Break-even equity ≈ ${needed.toFixed(1)}%. Rule of thumb: outs × 2% for one street.`,
    cards: [],
    choices: ["Call", "Fold"],
    correctIndex: shouldCall ? 0 : 1,
    explanation: shouldCall
      ? `Your ~${equity}% equity clears the ${needed.toFixed(1)}% ask — calling is +EV on pot odds alone.`
      : `You need ~${needed.toFixed(1)}% but only have ~${equity}% — folding is correct on pot odds alone.`,
  };
}

function streetDecisionQuestion() {
  return pick([
    {
      prompt: "You hold A♠ K♣ on the button. Folded to you. Action?",
      detail: "Preflop, full ring cash game.",
      cards: [card(14, "spades"), card(13, "clubs")],
      choices: ["Fold", "Call (limp)", "Raise"],
      correctIndex: 2,
      explanation: "AK on the button is a clear open-raise for value and initiative.",
    },
    {
      prompt: "You flop a flush draw (9 outs) on the button. Pot is mid-sized; villain bets small. Prefer?",
      detail: "Deep stacked, heads-up.",
      cards: [],
      choices: ["Auto-fold", "Call or raise with plan", "Move all-in blindly every time"],
      correctIndex: 1,
      explanation: "With position and a strong draw, calling or raising can both be fine — don’t default to giving up or spewing.",
    },
    {
      prompt: "You have 7♠ 2♦ under the gun. Correct default?",
      detail: "Preflop, early position.",
      cards: [card(7, "spades"), card(2, "diamonds")],
      choices: ["Raise", "Call", "Fold"],
      correctIndex: 2,
      explanation: "72o is the classic trash hand. Fold early — position and hand quality both work against you.",
    },
    {
      prompt: "River: you have top pair weak kicker, villain barrels large into a wet board. Best default?",
      detail: "Training focus: pot control vs hero-calls.",
      cards: [],
      choices: ["Snap-call every time", "Consider fold; asking price is steep", "Bluff-raise without a story"],
      correctIndex: 1,
      explanation: "Large river bets on wet boards often represent stronger value. Marginal one-pair hands are folds more often than heroes.",
    },
    {
      prompt: "You flop top set. Dry board. Prefer?",
      detail: "Heads-up, deep stacks.",
      cards: [],
      choices: ["Check hoping they bluff forever", "Bet for value / protection", "Fold to any raise"],
      correctIndex: 1,
      explanation: "Sets are strong value hands — build the pot while worse hands can call.",
    },
  ]);
}

export function makeQuiz(kindId, count = 8) {
  const makers = {
    identifyHand: identifyHandQuestion,
    startingHands: startingHandQuestion,
    potOdds: potOddsQuestion,
    streetDecision: streetDecisionQuestion,
  };
  const make = makers[kindId];
  return Array.from({ length: count }, () => make());
}
