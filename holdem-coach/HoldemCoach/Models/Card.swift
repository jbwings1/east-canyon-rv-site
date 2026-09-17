import Foundation

enum Suit: String, CaseIterable, Codable, Hashable {
    case clubs = "♣"
    case diamonds = "♦"
    case hearts = "♥"
    case spades = "♠"

    var isRed: Bool {
        self == .hearts || self == .diamonds
    }

    var accessibilityName: String {
        switch self {
        case .clubs: return "clubs"
        case .diamonds: return "diamonds"
        case .hearts: return "hearts"
        case .spades: return "spades"
        }
    }
}

enum Rank: Int, CaseIterable, Codable, Comparable, Hashable {
    case two = 2, three, four, five, six, seven, eight, nine, ten
    case jack, queen, king, ace

    var symbol: String {
        switch self {
        case .ace: return "A"
        case .king: return "K"
        case .queen: return "Q"
        case .jack: return "J"
        case .ten: return "T"
        default: return String(rawValue)
        }
    }

    var displayName: String {
        switch self {
        case .ace: return "Ace"
        case .king: return "King"
        case .queen: return "Queen"
        case .jack: return "Jack"
        default: return symbol
        }
    }

    static func < (lhs: Rank, rhs: Rank) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

struct PlayingCard: Identifiable, Hashable, Codable {
    let rank: Rank
    let suit: Suit

    var id: String { "\(rank.symbol)\(suit.rawValue)" }

    var label: String { "\(rank.symbol)\(suit.rawValue)" }

    var accessibilityLabel: String {
        "\(rank.displayName) of \(suit.accessibilityName)"
    }
}

enum Deck {
    static func standard() -> [PlayingCard] {
        Rank.allCases.flatMap { rank in
            Suit.allCases.map { PlayingCard(rank: rank, suit: $0) }
        }
    }

    static func shuffled() -> [PlayingCard] {
        standard().shuffled()
    }
}
