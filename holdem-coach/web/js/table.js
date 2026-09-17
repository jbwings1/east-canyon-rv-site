import { card, SUITS, RANKS } from "./cards.js";
import { bestHand, categoryTitle } from "./hand-evaluator.js";

const BOT_NAMES = ["River", "Oakley", "Bluff", "Canyon"];
const SMALL_BLIND = 5;
const BIG_BLIND = 10;
const START_STACK = 1000;
const MIN_RAISE = BIG_BLIND;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(card(rank.id, suit.id));
    }
  }
  return shuffle(deck);
}

function compareHands(a, b) {
  if (a.categoryId !== b.categoryId) return a.categoryId - b.categoryId;
  for (let i = 0; i < a.tiebreakers.length; i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i] - b.tiebreakers[i];
  }
  return 0;
}

function holeStrength(cards) {
  if (!cards || cards.length < 2) return 0;
  const [a, b] = [...cards].sort((x, y) => y.rank - x.rank);
  const paired = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = a.rank - b.rank;
  let score = a.rank * 2 + b.rank;
  if (paired) score += 40 + a.rank;
  if (suited) score += 8;
  if (gap === 1) score += 10;
  else if (gap === 2) score += 5;
  if (a.rank >= 14 && b.rank >= 12) score += 12;
  if (a.rank === 14 && b.rank <= 9 && !suited) score -= 8;
  return score;
}

function postflopStrength(hole, board) {
  if (!hole?.length) return { score: 0, categoryId: 0, title: "—" };
  if (board.length < 3) {
    const s = holeStrength(hole);
    return { score: s, categoryId: 0, title: "Preflop" };
  }
  const ev = bestHand([...hole, ...board]);
  const score = ev.categoryId * 20 + (ev.tiebreakers[0] || 0);
  return { score, categoryId: ev.categoryId, title: categoryTitle(ev.categoryId) };
}

function coachForHero(game, action) {
  const hero = game.players[game.heroIndex];
  const board = game.board;
  const pot = game.pot;
  const toCall = Math.max(0, game.currentBet - hero.bet);
  const strength = postflopStrength(hero.hole, board);
  const tips = [];

  if (game.street === "preflop") {
    const s = holeStrength(hero.hole);
    if (action === "fold" && s >= 70) tips.push("That starting hand is usually strong enough to continue.");
    else if (action === "fold" && s < 45) tips.push("Solid fold — trash hands drain chips.");
    else if (action === "raise" && s < 50) tips.push("Raising light can work, but you’re playing a weak starting hand.");
    else if ((action === "call" || action === "check") && s >= 80) tips.push("Strong hand — raising for value is often better than calling.");
    else if (action === "raise" && s >= 75) tips.push("Good aggression with a premium-ish hand.");
    else tips.push("Preflop: position and hand quality drive most of the edge.");
  } else {
    if (toCall > 0 && (action === "call" || action === "raise")) {
      const need = (100 * toCall) / (pot + toCall);
      tips.push(`Pot odds: you needed ~${need.toFixed(0)}% equity to call $${toCall} into $${pot}.`);
    }
    if (strength.categoryId >= 4 && (action === "check" || action === "call")) {
      tips.push(`You have ${strength.title} — consider betting/raising for value.`);
    } else if (strength.categoryId <= 1 && action === "raise") {
      tips.push("Bluffing is fine sometimes, but this board leaves you with a weak made hand.");
    } else if (strength.categoryId >= 2) {
      tips.push(`Your best hand so far: ${strength.title}.`);
    }
  }

  if (!tips.length) tips.push("Keep tracking pot size, your hand category, and who is still in.");
  return tips.join(" ");
}

export function createTableGame() {
  const players = [
    { id: "hero", name: "You", isHero: true, stack: START_STACK },
    ...BOT_NAMES.map((name, i) => ({
      id: `bot-${i}`,
      name,
      isHero: false,
      stack: START_STACK,
    })),
  ];

  const game = {
    players,
    heroIndex: 0,
    dealerIndex: 0,
    street: "idle",
    board: [],
    pot: 0,
    currentBet: 0,
    minRaise: MIN_RAISE,
    deck: [],
    actingIndex: null,
    handNumber: 0,
    log: [],
    coachTip: "Sit down for an automated 5-handed cash game. Four bots act on their own — you play every decision.",
    lastResult: null,
    waitingForHero: false,
    busy: false,
  };

  function resetHandFlags() {
    for (const p of game.players) {
      p.hole = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.handResult = null;
    }
    game.board = [];
    game.pot = 0;
    game.currentBet = 0;
    game.minRaise = MIN_RAISE;
    game.deck = freshDeck();
    game.log = [];
    game.lastResult = null;
    game.waitingForHero = false;
  }

  function activePlayers() {
    return game.players.filter((p) => !p.folded && p.stack + p.bet > 0);
  }

  function livePlayers() {
    return game.players.filter((p) => !p.folded);
  }

  function nextOccupied(from) {
    for (let i = 1; i <= game.players.length; i++) {
      const idx = (from + i) % game.players.length;
      const p = game.players[idx];
      if (!p.folded && !p.allIn && p.stack > 0) return idx;
    }
    return null;
  }

  function addLog(msg) {
    game.log.unshift(msg);
    game.log = game.log.slice(0, 8);
  }

  function postBlind(idx, amount, label) {
    const p = game.players[idx];
    const pay = Math.min(amount, p.stack);
    p.stack -= pay;
    p.bet += pay;
    game.pot += pay;
    if (p.stack === 0) p.allIn = true;
    addLog(`${p.name} posts ${label} $${pay}`);
  }

  function dealHole() {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < game.players.length; i++) {
        const idx = (game.dealerIndex + 1 + i) % game.players.length;
        game.players[idx].hole.push(game.deck.pop());
      }
    }
  }

  function dealBoard(n) {
    game.deck.pop(); // burn
    for (let i = 0; i < n; i++) game.board.push(game.deck.pop());
  }

  function bettingComplete() {
    const contenders = livePlayers().filter((p) => !p.allIn || p.bet === game.currentBet);
    const needAct = livePlayers().filter((p) => !p.allIn && p.stack > 0);
    if (needAct.length <= 1 && livePlayers().every((p) => p.bet === game.currentBet || p.allIn || p.folded)) {
      return needAct.length === 0 || needAct.every((p) => p.acted && p.bet === game.currentBet);
    }
    return needAct.every((p) => p.acted && (p.bet === game.currentBet || p.allIn));
  }

  function clearStreetBets() {
    for (const p of game.players) {
      p.bet = 0;
      p.acted = false;
    }
    game.currentBet = 0;
    game.minRaise = BIG_BLIND;
  }

  function startStreet(street) {
    game.street = street;
    clearStreetBets();
    if (street === "flop") {
      dealBoard(3);
      addLog("Flop dealt");
    } else if (street === "turn") {
      dealBoard(1);
      addLog("Turn dealt");
    } else if (street === "river") {
      dealBoard(1);
      addLog("River dealt");
    }

    if (livePlayers().filter((p) => !p.allIn && p.stack > 0).length <= 1) {
      return advanceAfterBetting();
    }

    game.actingIndex = nextOccupied(game.dealerIndex);
    return continueAction();
  }

  function advanceAfterBetting() {
    if (livePlayers().length === 1) {
      return finishHand();
    }
    if (game.street === "preflop") return startStreet("flop");
    if (game.street === "flop") return startStreet("turn");
    if (game.street === "turn") return startStreet("river");
    return finishHand();
  }

  function finishHand() {
    game.street = "showdown";
    game.actingIndex = null;
    game.waitingForHero = false;
    const alive = livePlayers();

    if (alive.length === 1) {
      const winner = alive[0];
      winner.stack += game.pot;
      game.lastResult = {
        winners: [winner.name],
        amount: game.pot,
        reason: "Everyone else folded",
        showCards: false,
      };
      addLog(`${winner.name} wins $${game.pot}`);
      game.coachTip =
        winner.isHero
          ? "You took it down without a showdown — pressure worked."
          : "Hand over. Next time, look for spots to apply pressure earlier.";
      game.pot = 0;
      game.busy = false;
      return "done";
    }

    for (const p of alive) {
      p.handResult = bestHand([...p.hole, ...game.board]);
    }
    alive.sort((a, b) => compareHands(b.handResult, a.handResult));
    const best = alive[0].handResult;
    const winners = alive.filter((p) => compareHands(p.handResult, best) === 0);
    const share = Math.floor(game.pot / winners.length);
    for (const w of winners) w.stack += share;
    const leftover = game.pot - share * winners.length;
    if (leftover) winners[0].stack += leftover;

    game.lastResult = {
      winners: winners.map((w) => w.name),
      amount: game.pot,
      reason: winners.map((w) => `${w.name}: ${categoryTitle(w.handResult.categoryId)}`).join(" · "),
      showCards: true,
    };
    addLog(`${winners.map((w) => w.name).join(" & ")} win $${game.pot}`);

    const hero = game.players[game.heroIndex];
    if (winners.some((w) => w.isHero)) {
      game.coachTip = `Nice — you won with ${categoryTitle(hero.handResult.categoryId)}.`;
    } else if (!hero.folded && hero.handResult) {
      game.coachTip = `Showdown: you had ${categoryTitle(hero.handResult.categoryId)}. Winner: ${game.lastResult.reason}.`;
    } else {
      game.coachTip = `Showdown: ${game.lastResult.reason}.`;
    }
    game.pot = 0;
    game.busy = false;
    return "done";
  }

  function applyAction(playerIndex, action, raiseTo) {
    const p = game.players[playerIndex];
    const toCall = Math.max(0, game.currentBet - p.bet);

    if (action === "fold") {
      p.folded = true;
      p.acted = true;
      addLog(`${p.name} folds`);
      if (p.isHero) game.coachTip = coachForHero(game, "fold");
      return;
    }

    if (action === "check") {
      p.acted = true;
      addLog(`${p.name} checks`);
      if (p.isHero) game.coachTip = coachForHero(game, "check");
      return;
    }

    if (action === "call") {
      const pay = Math.min(toCall, p.stack);
      p.stack -= pay;
      p.bet += pay;
      game.pot += pay;
      if (p.stack === 0) p.allIn = true;
      p.acted = true;
      addLog(toCall === 0 ? `${p.name} checks` : `${p.name} calls $${pay}`);
      if (p.isHero) game.coachTip = coachForHero(game, toCall === 0 ? "check" : "call");
      return;
    }

    if (action === "raise") {
      const target = raiseTo ?? game.currentBet + Math.max(game.minRaise, BIG_BLIND);
      const need = Math.max(0, target - p.bet);
      const pay = Math.min(need, p.stack);
      const newBet = p.bet + pay;
      const raiseSize = newBet - game.currentBet;
      if (raiseSize > 0) {
        game.minRaise = Math.max(game.minRaise, raiseSize);
        for (const other of game.players) {
          if (other !== p && !other.folded && !other.allIn) other.acted = false;
        }
      }
      p.stack -= pay;
      p.bet = newBet;
      game.pot += pay;
      game.currentBet = Math.max(game.currentBet, newBet);
      if (p.stack === 0) p.allIn = true;
      p.acted = true;
      addLog(`${p.name} raises to $${p.bet}`);
      if (p.isHero) game.coachTip = coachForHero(game, "raise");
    }
  }

  function botDecide(p) {
    const toCall = Math.max(0, game.currentBet - p.bet);
    const strength =
      game.street === "preflop"
        ? holeStrength(p.hole)
        : postflopStrength(p.hole, game.board).score;
    const potOddsOk = toCall === 0 || strength > 35 + (toCall / Math.max(game.pot, 1)) * 40;
    const roll = Math.random();

    if (toCall === 0) {
      if (strength >= 85 && roll < 0.7) return { action: "raise" };
      if (strength >= 60 && roll < 0.45) return { action: "raise" };
      return { action: "check" };
    }

    if (strength < 40 && !potOddsOk) return { action: "fold" };
    if (strength >= 90 && roll < 0.65) return { action: "raise" };
    if (strength >= 70 && roll < 0.35) return { action: "raise" };
    if (potOddsOk || strength >= 50) return { action: "call" };
    return { action: "fold" };
  }

  function continueAction() {
    if (livePlayers().length === 1) return finishHand();
    if (bettingComplete()) return advanceAfterBetting();

    const idx = game.actingIndex;
    if (idx == null) return advanceAfterBetting();
    const p = game.players[idx];

    if (p.folded || p.allIn || p.stack === 0) {
      game.actingIndex = nextOccupied(idx);
      return continueAction();
    }

    if (p.isHero) {
      game.waitingForHero = true;
      game.busy = false;
      return "hero";
    }

    game.waitingForHero = false;
    game.busy = true;
    return "bot";
  }

  function startHand() {
    const withChips = game.players.filter((p) => p.stack > 0);
    if (withChips.length < 2) {
      for (const p of game.players) p.stack = START_STACK;
      game.coachTip = "Stacks were low — everyone rebuys to $1000.";
    }

    resetHandFlags();
    game.handNumber += 1;
    game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
    // Skip busted dealers
    for (let i = 0; i < game.players.length; i++) {
      if (game.players[game.dealerIndex].stack > 0) break;
      game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
    }

    const sb = nextOccupied(game.dealerIndex);
    const bb = nextOccupied(sb);
    postBlind(sb, SMALL_BLIND, "SB");
    postBlind(bb, BIG_BLIND, "BB");
    game.currentBet = Math.max(
      game.players[sb].bet,
      game.players[bb].bet
    );
    dealHole();
    game.street = "preflop";
    game.actingIndex = nextOccupied(bb);
    game.coachTip = "New hand. Use Fold / Call / Raise when it’s your turn — bots auto-play.";
    addLog(`Hand #${game.handNumber}`);
    return continueAction();
  }

  function heroAct(action) {
    if (!game.waitingForHero || game.actingIndex !== game.heroIndex) return "ignore";
    const hero = game.players[game.heroIndex];
    const toCall = Math.max(0, game.currentBet - hero.bet);

    if (action === "fold") applyAction(game.heroIndex, "fold");
    else if (action === "checkCall") applyAction(game.heroIndex, toCall === 0 ? "check" : "call");
    else if (action === "raise") {
      const raiseTo = Math.min(
        hero.bet + hero.stack,
        Math.max(game.currentBet + game.minRaise, game.currentBet * 2 || BIG_BLIND * 2)
      );
      applyAction(game.heroIndex, "raise", raiseTo);
    } else return "ignore";

    game.waitingForHero = false;
    game.actingIndex = nextOccupied(game.heroIndex);
    return continueAction();
  }

  function runBot() {
    if (game.actingIndex == null) return continueAction();
    const idx = game.actingIndex;
    const p = game.players[idx];
    if (p.isHero || p.folded || p.allIn) return continueAction();

    const decision = botDecide(p);
    if (decision.action === "raise") {
      const raiseTo = Math.min(
        p.bet + p.stack,
        Math.max(game.currentBet + game.minRaise, game.currentBet + BIG_BLIND * 2)
      );
      applyAction(idx, "raise", raiseTo);
    } else {
      applyAction(idx, decision.action);
    }
    game.actingIndex = nextOccupied(idx);
    return continueAction();
  }

  function heroView() {
    const hero = game.players[game.heroIndex];
    const toCall = Math.max(0, game.currentBet - hero.bet);
    return {
      toCall,
      canCheck: toCall === 0,
      canRaise: hero.stack > toCall,
      callLabel: toCall === 0 ? "Check" : `Call $${toCall}`,
      raiseLabel: `Raise`,
      potOdds:
        toCall > 0 ? Math.round((100 * toCall) / (game.pot + toCall)) : null,
      handHint:
        game.street === "preflop"
          ? "Starting-hand strength matters most here."
          : postflopStrength(hero.hole, game.board).title,
    };
  }

  return {
    game,
    startHand,
    heroAct,
    runBot,
    heroView,
    SMALL_BLIND,
    BIG_BLIND,
  };
}
