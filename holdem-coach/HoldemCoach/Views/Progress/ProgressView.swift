import SwiftUI

struct ProgressViewScreen: View {
    @EnvironmentObject private var progress: ProgressStore
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.feltDeep.ignoresSafeArea()

                List {
                    Section("Overview") {
                        metric("Lessons completed", "\(progress.lessonsCompletedCount) / \(progress.lessonsTotal)")
                        metric("Day streak", "\(progress.currentStreak)")
                        metric("Best quiz score", progress.bestQuizPercent > 0 ? "\(progress.bestQuizPercent)%" : "—")
                    }

                    Section("Recent drills") {
                        if progress.quizHistory.isEmpty {
                            Text("No drills yet — open Practice to start.")
                                .foregroundStyle(Theme.cream.opacity(0.6))
                                .listRowBackground(Color.white.opacity(0.06))
                        } else {
                            ForEach(progress.quizHistory.prefix(12)) { result in
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(result.kind.title)
                                            .foregroundStyle(Theme.cream)
                                        Text(result.date, style: .date)
                                            .font(.caption)
                                            .foregroundStyle(Theme.cream.opacity(0.5))
                                    }
                                    Spacer()
                                    Text("\(result.score)/\(result.total)")
                                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                                        .foregroundStyle(Theme.gold)
                                }
                                .listRowBackground(Color.white.opacity(0.06))
                            }
                        }
                    }

                    Section {
                        Button("Reset all progress", role: .destructive) {
                            confirmReset = true
                        }
                        .listRowBackground(Color.white.opacity(0.06))
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Progress")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .confirmationDialog("Reset progress?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset", role: .destructive) { progress.resetAll() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This clears lessons, quiz history, and streak on this device.")
            }
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(Theme.cream.opacity(0.75))
            Spacer()
            Text(value)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundStyle(Theme.gold)
        }
        .listRowBackground(Color.white.opacity(0.06))
    }
}
