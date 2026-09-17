import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var progress: ProgressStore

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [Theme.feltDeep, Theme.felt],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("HOLDEM COACH")
                                .font(.system(size: 14, weight: .semibold, design: .rounded))
                                .tracking(3)
                                .foregroundStyle(Theme.gold)

                            Text("Learn the game.\nTest your edge.")
                                .font(.system(size: 34, weight: .bold, design: .serif))
                                .foregroundStyle(Theme.cream)
                                .fixedSize(horizontal: false, vertical: true)

                            Text("Short lessons and drills for hand rankings, starting hands, pot odds, and street decisions.")
                                .font(.system(size: 16, weight: .regular, design: .rounded))
                                .foregroundStyle(Theme.cream.opacity(0.78))
                                .padding(.top, 2)
                        }
                        .padding(.top, 12)

                        HStack(spacing: 12) {
                            StatChip(title: "Lessons", value: "\(progress.lessonsCompletedCount)/\(progress.lessonsTotal)")
                            StatChip(title: "Streak", value: "\(progress.currentStreak)d")
                            StatChip(title: "Best quiz", value: progress.bestQuizPercent > 0 ? "\(progress.bestQuizPercent)%" : "—")
                        }

                        VStack(spacing: 12) {
                            NavigationLink {
                                LearnListView()
                            } label: {
                                HomeCTA(
                                    title: "Continue learning",
                                    subtitle: nextLessonTitle,
                                    systemImage: "book.fill"
                                )
                            }
                            .buttonStyle(.plain)

                            NavigationLink {
                                PracticeHubView()
                            } label: {
                                HomeCTA(
                                    title: "Start a drill",
                                    subtitle: "Identify hands, odds, and decisions",
                                    systemImage: "flame.fill"
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var nextLessonTitle: String {
        if let next = LessonCatalog.all.first(where: { !progress.isLessonCompleted($0.id) }) {
            return next.title
        }
        return "All lessons complete — review anytime"
    }
}

private struct StatChip: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .tracking(1)
                .foregroundStyle(Theme.cream.opacity(0.55))
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.cream)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
    }
}

private struct HomeCTA: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.feltDeep)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.gold))

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.cream)
                Text(subtitle)
                    .font(.system(size: 13, weight: .regular, design: .rounded))
                    .foregroundStyle(Theme.cream.opacity(0.65))
                    .lineLimit(2)
            }

            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(Theme.cream.opacity(0.45))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.rail.opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(Theme.gold.opacity(0.25), lineWidth: 1)
                )
        )
    }
}
