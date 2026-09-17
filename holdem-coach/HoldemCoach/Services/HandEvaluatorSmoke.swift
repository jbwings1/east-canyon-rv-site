import Foundation

// Straight detection unit-style checks kept in-app for Simulator smoke tests.
enum HandEvaluatorSmoke {
    static func run() -> String {
        let royal = [
            PlayingCard(rank: .ace, suit: .spades),
            PlayingCard(rank: .king, suit: .spades),
            PlayingCard(rank: .queen, suit: .spades),
            PlayingCard(rank: .jack, suit: .spades),
            PlayingCard(rank: .ten, suit: .spades),
        ]
        let wheel = [
            PlayingCard(rank: .ace, suit: .clubs),
            PlayingCard(rank: .two, suit: .diamonds),
            PlayingCard(rank: .three, suit: .hearts),
            PlayingCard(rank: .four, suit: .spades),
            PlayingCard(rank: .five, suit: .clubs),
        ]
        let r = HandEvaluator.evaluateFive(royal)
        let w = HandEvaluator.evaluateFive(wheel)
        return "royal=\(r.category.title) wheel=\(w.category.title)"
    }
}
