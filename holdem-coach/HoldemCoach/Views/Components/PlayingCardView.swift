import SwiftUI

struct PlayingCardView: View {
    let card: PlayingCard
    var width: CGFloat = 56

    private var height: CGFloat { width * 1.4 }

    var body: some View {
        VStack(spacing: 2) {
            Text(card.rank.symbol)
                .font(.system(size: width * 0.36, weight: .bold, design: .rounded))
            Text(card.suit.rawValue)
                .font(.system(size: width * 0.34))
        }
        .foregroundStyle(card.suit.isRed ? Theme.danger : Theme.ink)
        .frame(width: width, height: height)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Theme.cream)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Theme.ink.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.25), radius: 3, y: 2)
        .accessibilityLabel(card.accessibilityLabel)
    }
}

struct CardRow: View {
    let cards: [PlayingCard]
    var width: CGFloat = 52

    var body: some View {
        HStack(spacing: 8) {
            ForEach(cards) { card in
                PlayingCardView(card: card, width: width)
            }
        }
    }
}
