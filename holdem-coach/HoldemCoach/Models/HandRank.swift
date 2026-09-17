import Foundation

enum HandCategory: Int, CaseIterable, Comparable, Codable {
    case highCard = 1
    case onePair
    case twoPair
    case threeOfAKind
    case straight
    case flush
    case fullHouse
    case fourOfAKind
    case straightFlush
    case royalFlush

    var title: String {
        switch self {
        case .highCard: return "High Card"
        case .onePair: return "One Pair"
        case .twoPair: return "Two Pair"
        case .threeOfAKind: return "Three of a Kind"
        case .straight: return "Straight"
        case .flush: return "Flush"
        case .fullHouse: return "Full House"
        case .fourOfAKind: return "Four of a Kind"
        case .straightFlush: return "Straight Flush"
        case .royalFlush: return "Royal Flush"
        }
    }

    var blurb: String {
        switch self {
        case .highCard: return "No pair — highest card wins."
        case .onePair: return "Two cards of the same rank."
        case .twoPair: return "Two different pairs."
        case .threeOfAKind: return "Three cards of the same rank."
        case .straight: return "Five cards in sequence, mixed suits."
        case .flush: return "Five cards of the same suit."
        case .fullHouse: return "Three of a kind plus a pair."
        case .fourOfAKind: return "Four cards of the same rank."
        case .straightFlush: return "Five in sequence, same suit."
        case .royalFlush: return "A-K-Q-J-T, all the same suit."
        }
    }

    static func < (lhs: HandCategory, rhs: HandCategory) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

struct EvaluatedHand: Equatable {
    let category: HandCategory
    /// Tie-break ranks, highest first (e.g. pair rank, then kickers).
    let tiebreakers: [Int]
}

enum HandEvaluator {
    /// Best 5-card hand from 5…7 cards (Hold’em hole + board).
    static func bestHand(from cards: [PlayingCard]) -> EvaluatedHand {
        precondition((5...7).contains(cards.count), "Need 5 to 7 cards")
        var best: EvaluatedHand?
        for combo in combinations(cards, k: 5) {
            let evaluated = evaluateFive(combo)
            if best == nil || isBetter(evaluated, than: best!) {
                best = evaluated
            }
        }
        return best!
    }

    static func evaluateFive(_ cards: [PlayingCard]) -> EvaluatedHand {
        precondition(cards.count == 5)
        let ranks = cards.map(\.rank.rawValue).sorted(by: >)
        let suits = cards.map(\.suit)
        let isFlush = suits.allSatisfy { $0 == suits[0] }
        let straightHigh = straightHighRank(ranks)

        if isFlush, let high = straightHigh {
            if high == Rank.ace.rawValue {
                return EvaluatedHand(category: .royalFlush, tiebreakers: [high])
            }
            return EvaluatedHand(category: .straightFlush, tiebreakers: [high])
        }

        let groups = rankGroups(ranks)
        if let quad = groups.first(where: { $0.count == 4 }) {
            let kicker = groups.first(where: { $0.count == 1 })!.rank
            return EvaluatedHand(category: .fourOfAKind, tiebreakers: [quad.rank, kicker])
        }

        if let trips = groups.first(where: { $0.count == 3 }),
           let pair = groups.first(where: { $0.count == 2 }) {
            return EvaluatedHand(category: .fullHouse, tiebreakers: [trips.rank, pair.rank])
        }

        if isFlush {
            return EvaluatedHand(category: .flush, tiebreakers: ranks)
        }

        if let high = straightHigh {
            return EvaluatedHand(category: .straight, tiebreakers: [high])
        }

        if let trips = groups.first(where: { $0.count == 3 }) {
            let kickers = groups.filter { $0.count == 1 }.map(\.rank).sorted(by: >)
            return EvaluatedHand(category: .threeOfAKind, tiebreakers: [trips.rank] + kickers)
        }

        let pairs = groups.filter { $0.count == 2 }.map(\.rank).sorted(by: >)
        if pairs.count == 2 {
            let kicker = groups.first(where: { $0.count == 1 })!.rank
            return EvaluatedHand(category: .twoPair, tiebreakers: pairs + [kicker])
        }
        if pairs.count == 1 {
            let kickers = groups.filter { $0.count == 1 }.map(\.rank).sorted(by: >)
            return EvaluatedHand(category: .onePair, tiebreakers: [pairs[0]] + kickers)
        }

        return EvaluatedHand(category: .highCard, tiebreakers: ranks)
    }

    private static func isBetter(_ a: EvaluatedHand, than b: EvaluatedHand) -> Bool {
        if a.category != b.category { return a.category > b.category }
        for (lhs, rhs) in zip(a.tiebreakers, b.tiebreakers) {
            if lhs != rhs { return lhs > rhs }
        }
        return false
    }

    private struct RankGroup {
        let rank: Int
        let count: Int
    }

    private static func rankGroups(_ ranks: [Int]) -> [RankGroup] {
        var counts: [Int: Int] = [:]
        for r in ranks { counts[r, default: 0] += 1 }
        return counts
            .map { RankGroup(rank: $0.key, count: $0.value) }
            .sorted { lhs, rhs in
                if lhs.count != rhs.count { return lhs.count > rhs.count }
                return lhs.rank > rhs.rank
            }
    }

    /// Returns the high card of a straight, or nil. Wheel (A-2-3-4-5) returns 5.
    private static func straightHighRank(_ descendingRanks: [Int]) -> Int? {
        let uniq = Array(Set(descendingRanks)).sorted(by: >)
        if uniq.count != 5 { return nil }
        if uniq == [14, 5, 4, 3, 2] { return 5 }
        if uniq[0] - uniq[4] == 4 { return uniq[0] }
        return nil
    }

    private static func combinations<T>(_ array: [T], k: Int) -> [[T]] {
        guard k > 0, k <= array.count else { return [] }
        if k == array.count { return [array] }
        if k == 1 { return array.map { [$0] } }

        var result: [[T]] = []
        func recurse(start: Int, path: [T]) {
            if path.count == k {
                result.append(path)
                return
            }
            for i in start..<array.count {
                recurse(start: i + 1, path: path + [array[i]])
            }
        }
        recurse(start: 0, path: [])
        return result
    }
}
