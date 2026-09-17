import Foundation

enum QuizKind: String, CaseIterable, Identifiable, Codable {
    case identifyHand
    case startingHands
    case potOdds
    case streetDecision

    var id: String { rawValue }

    var title: String {
        switch self {
        case .identifyHand: return "Identify the Hand"
        case .startingHands: return "Starting Hands"
        case .potOdds: return "Pot Odds"
        case .streetDecision: return "Street Decisions"
        }
    }

    var detail: String {
        switch self {
        case .identifyHand: return "Name the best five-card category"
        case .startingHands: return "Pick the stronger preflop hand"
        case .potOdds: return "Should you call with this price?"
        case .streetDecision: return "Choose the better action"
        }
    }
}

struct QuizQuestion: Identifiable {
    let id: UUID
    let kind: QuizKind
    let prompt: String
    let detail: String?
    let cards: [PlayingCard]
    let choices: [String]
    let correctIndex: Int
    let explanation: String
}

enum QuizFactory {
    static func make(kind: QuizKind, count: Int = 8) -> [QuizQuestion] {
        switch kind {
        case .identifyHand:
            return (0..<count).map { _ in identifyHandQuestion() }
        case .startingHands:
            return (0..<count).map { _ in startingHandQuestion() }
        case .potOdds:
            return (0..<count).map { _ in potOddsQuestion() }
        case .streetDecision:
            return (0..<count).map { _ in streetDecisionQuestion() }
        }
    }

    // MARK: - Identify hand

    private static func identifyHandQuestion() -> QuizQuestion {
        let scenario = HandScenario.random()
        let evaluated = HandEvaluator.bestHand(from: scenario.cards)
        let wrong = HandCategory.allCases
            .filter { $0 != evaluated.category }
            .shuffled()
            .prefix(3)
            .map(\.title)
        var choices = Array(wrong) + [evaluated.category.title]
        choices.shuffle()
        let correct = choices.firstIndex(of: evaluated.category.title)!

        return QuizQuestion(
            id: UUID(),
            kind: .identifyHand,
            prompt: "What is the best hand?",
            detail: scenario.label,
            cards: scenario.cards,
            choices: choices,
            correctIndex: correct,
            explanation: "Best category: \(evaluated.category.title). \(evaluated.category.blurb)"
        )
    }

    // MARK: - Starting hands

    private static func startingHandQuestion() -> QuizQuestion {
        let pair = StartingHand.comparePair()
        let choices = [pair.a.label, pair.b.label]
        return QuizQuestion(
            id: UUID(),
            kind: .startingHands,
            prompt: "Which hand is stronger to open (late position)?",
            detail: "Assume a full-ring cash game and no prior raises.",
            cards: pair.a.cards + pair.b.cards,
            choices: choices,
            correctIndex: pair.strongerIsA ? 0 : 1,
            explanation: pair.explanation
        )
    }

    // MARK: - Pot odds

    private static func potOddsQuestion() -> QuizQuestion {
        let pot = [60, 80, 100, 120, 150].randomElement()!
        let call = [10, 15, 20, 25, 30].randomElement()!
        let outs = [4, 8, 9, 12, 15].randomElement()!
        // Approximate equity to hit on next card
        let equity = Double(outs) * 2.0
        let needed = 100.0 * Double(call) / Double(pot + call)
        let shouldCall = equity >= needed
        let choices = ["Call", "Fold"]
        let correct = shouldCall ? 0 : 1
        let prompt = "Pot $\(pot). Call $\(call). You have ~\(outs) outs (~\(Int(equity))% next card). What do you do?"

        return QuizQuestion(
            id: UUID(),
            kind: .potOdds,
            prompt: prompt,
            detail: "Break-even equity ≈ \(String(format: "%.1f", needed))%. Rule of thumb: outs × 2% for one street.",
            cards: [],
            choices: choices,
            correctIndex: correct,
            explanation: shouldCall
                ? "Your ~\(Int(equity))% equity clears the \(String(format: "%.1f", needed))% ask — calling is +EV on pot odds alone."
                : "You need ~\(String(format: "%.1f", needed))% but only have ~\(Int(equity))% — folding is correct on pot odds alone."
        )
    }

    // MARK: - Street decision

    private static func streetDecisionQuestion() -> QuizQuestion {
        let item = StreetScenario.random()
        return QuizQuestion(
            id: UUID(),
            kind: .streetDecision,
            prompt: item.prompt,
            detail: item.detail,
            cards: item.cards,
            choices: item.choices,
            correctIndex: item.correctIndex,
            explanation: item.explanation
        )
    }
}

// MARK: - Scenario helpers

private struct HandScenario {
    let cards: [PlayingCard]
    let label: String

    static func random() -> HandScenario {
        let templates: [() -> HandScenario] = [
            royalFlush, straightFlush, quads, fullHouse, flush, straight, trips, twoPair, pair, highCard,
        ]
        return templates.randomElement()!()
    }

    private static func card(_ r: Rank, _ s: Suit) -> PlayingCard {
        PlayingCard(rank: r, suit: s)
    }

    private static func royalFlush() -> HandScenario {
        let s = Suit.allCases.randomElement()!
        let cards = [card(.ace, s), card(.king, s), card(.queen, s), card(.jack, s), card(.ten, s)]
        return HandScenario(cards: cards, label: "Five community-style cards")
    }

    private static func straightFlush() -> HandScenario {
        let s: Suit = Bool.random() ? .clubs : .hearts
        let cards = [card(.nine, s), card(.eight, s), card(.seven, s), card(.six, s), card(.five, s)]
        return HandScenario(cards: cards, label: "Connected & suited")
    }

    private static func quads() -> HandScenario {
        let r = [Rank.ace, .king, .queen, .seven].randomElement()!
        let cards = Suit.allCases.map { card(r, $0) } + [card(.two, .diamonds)]
        return HandScenario(cards: Array(cards.prefix(5)), label: "Four of a kind look")
    }

    private static func fullHouse() -> HandScenario {
        let cards = [
            card(.king, .spades), card(.king, .hearts), card(.king, .clubs),
            card(.four, .diamonds), card(.four, .clubs),
        ]
        return HandScenario(cards: cards, label: "Full house shape")
    }

    private static func flush() -> HandScenario {
        let s = Suit.spades
        let cards = [card(.ace, s), card(.jack, s), card(.nine, s), card(.six, s), card(.three, s)]
        return HandScenario(cards: cards, label: "All one suit")
    }

    private static func straight() -> HandScenario {
        let cards = [
            card(.ten, .clubs), card(.nine, .hearts), card(.eight, .spades),
            card(.seven, .diamonds), card(.six, .clubs),
        ]
        return HandScenario(cards: cards, label: "Sequence, mixed suits")
    }

    private static func trips() -> HandScenario {
        let cards = [
            card(.queen, .hearts), card(.queen, .clubs), card(.queen, .diamonds),
            card(.ace, .spades), card(.five, .clubs),
        ]
        return HandScenario(cards: cards, label: "Three of a kind")
    }

    private static func twoPair() -> HandScenario {
        let cards = [
            card(.jack, .spades), card(.jack, .hearts),
            card(.eight, .clubs), card(.eight, .diamonds),
            card(.ace, .clubs),
        ]
        return HandScenario(cards: cards, label: "Two pairs")
    }

    private static func pair() -> HandScenario {
        let cards = [
            card(.ace, .spades), card(.ace, .diamonds),
            card(.king, .clubs), card(.nine, .hearts), card(.four, .spades),
        ]
        return HandScenario(cards: cards, label: "One pair")
    }

    private static func highCard() -> HandScenario {
        let cards = [
            card(.ace, .clubs), card(.king, .diamonds), card(.jack, .spades),
            card(.nine, .hearts), card(.three, .clubs),
        ]
        return HandScenario(cards: cards, label: "No pair")
    }
}

private struct StartingHand {
    let label: String
    let cards: [PlayingCard]
    let strength: Int

    static func comparePair() -> (a: StartingHand, b: StartingHand, strongerIsA: Bool, explanation: String) {
        let pool = catalog.shuffled()
        let a = pool[0]
        let b = pool[1]
        let strongerIsA = a.strength >= b.strength
        let winner = strongerIsA ? a.label : b.label
        let loser = strongerIsA ? b.label : a.label
        return (
            a, b, strongerIsA,
            "\(winner) ranks above \(loser) for a late-position open in this training chart."
        )
    }

    private static func c(_ r: Rank, _ s: Suit) -> PlayingCard { PlayingCard(rank: r, suit: s) }

    private static let catalog: [StartingHand] = [
        StartingHand(label: "A♠ A♥", cards: [c(.ace, .spades), c(.ace, .hearts)], strength: 100),
        StartingHand(label: "K♦ K♣", cards: [c(.king, .diamonds), c(.king, .clubs)], strength: 95),
        StartingHand(label: "Q♠ Q♥", cards: [c(.queen, .spades), c(.queen, .hearts)], strength: 90),
        StartingHand(label: "A♠ K♠", cards: [c(.ace, .spades), c(.king, .spades)], strength: 88),
        StartingHand(label: "A♥ K♦", cards: [c(.ace, .hearts), c(.king, .diamonds)], strength: 84),
        StartingHand(label: "J♣ J♦", cards: [c(.jack, .clubs), c(.jack, .diamonds)], strength: 86),
        StartingHand(label: "T♠ T♥", cards: [c(.ten, .spades), c(.ten, .hearts)], strength: 80),
        StartingHand(label: "A♣ Q♣", cards: [c(.ace, .clubs), c(.queen, .clubs)], strength: 78),
        StartingHand(label: "9♠ 9♦", cards: [c(.nine, .spades), c(.nine, .diamonds)], strength: 74),
        StartingHand(label: "7♥ 6♥", cards: [c(.seven, .hearts), c(.six, .hearts)], strength: 55),
        StartingHand(label: "K♠ 9♦", cards: [c(.king, .spades), c(.nine, .diamonds)], strength: 48),
        StartingHand(label: "J♥ 3♣", cards: [c(.jack, .hearts), c(.three, .clubs)], strength: 20),
        StartingHand(label: "8♦ 2♠", cards: [c(.eight, .diamonds), c(.two, .spades)], strength: 10),
        StartingHand(label: "5♣ 4♣", cards: [c(.five, .clubs), c(.four, .clubs)], strength: 50),
    ]
}

private struct StreetScenario {
    let prompt: String
    let detail: String
    let cards: [PlayingCard]
    let choices: [String]
    let correctIndex: Int
    let explanation: String

    static func random() -> StreetScenario {
        [
            StreetScenario(
                prompt: "You hold A♠ K♣ on the button. Folded to you. Action?",
                detail: "Preflop, full ring cash game.",
                cards: [
                    PlayingCard(rank: .ace, suit: .spades),
                    PlayingCard(rank: .king, suit: .clubs),
                ],
                choices: ["Fold", "Call (limp)", "Raise"],
                correctIndex: 2,
                explanation: "AK on the button is a clear open-raise for value and initiative."
            ),
            StreetScenario(
                prompt: "You flop a flush draw (9 outs) on the button. Pot is mid-sized; villain bets small. Prefer?",
                detail: "Deep stacked, heads-up.",
                cards: [],
                choices: ["Auto-fold", "Call or raise with plan", "Move all-in blindly every time"],
                correctIndex: 1,
                explanation: "With position and a strong draw, calling or raising can both be fine — don’t default to giving up or spewing."
            ),
            StreetScenario(
                prompt: "You have 7♠ 2♦ under the gun. Correct default?",
                detail: "Preflop, early position.",
                cards: [
                    PlayingCard(rank: .seven, suit: .spades),
                    PlayingCard(rank: .two, suit: .diamonds),
                ],
                choices: ["Raise", "Call", "Fold"],
                correctIndex: 2,
                explanation: "72o is the classic trash hand. Fold early — position and hand quality both work against you."
            ),
            StreetScenario(
                prompt: "River: you have top pair weak kicker, villain barrels large into a wet board. Best default?",
                detail: "Training focus: pot control vs hero-calls.",
                cards: [],
                choices: ["Snap-call every time", "Consider fold; asking price is steep", "Bluff-raise without a story"],
                correctIndex: 1,
                explanation: "Large river bets on wet boards often represent stronger value. Marginal one-pair hands are folds more often than heroes."
            ),
            StreetScenario(
                prompt: "You flop top set. Dry board. Prefer?",
                detail: "Heads-up, deep stacks.",
                cards: [],
                choices: ["Check hoping they bluff forever", "Bet for value / protection", "Fold to any raise"],
                correctIndex: 1,
                explanation: "Sets are strong value hands — build the pot while worse hands can call."
            ),
        ].randomElement()!
    }
}
