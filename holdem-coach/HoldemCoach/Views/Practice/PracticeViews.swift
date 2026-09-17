import SwiftUI

struct PracticeHubView: View {
    var body: some View {
        NavigationStack {
            ZStack {
                Theme.feltDeep.ignoresSafeArea()

                List {
                    Section {
                        Text("Drills generate fresh questions each run. Aim for speed and accuracy.")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.cream.opacity(0.7))
                            .listRowBackground(Color.clear)
                    }

                    Section {
                        ForEach(QuizKind.allCases) { kind in
                            NavigationLink {
                                QuizSessionView(kind: kind)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(kind.title)
                                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                                        .foregroundStyle(Theme.cream)
                                    Text(kind.detail)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.cream.opacity(0.55))
                                }
                                .padding(.vertical, 4)
                            }
                            .listRowBackground(Color.white.opacity(0.06))
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Practice")
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}

struct QuizSessionView: View {
    @EnvironmentObject private var progress: ProgressStore
    let kind: QuizKind

    @State private var questions: [QuizQuestion] = []
    @State private var index = 0
    @State private var score = 0
    @State private var selected: Int?
    @State private var revealed = false
    @State private var finished = false

    var body: some View {
        ZStack {
            Theme.feltDeep.ignoresSafeArea()

            if finished {
                results
            } else if questions.isEmpty {
                ProgressView()
                    .tint(Theme.gold)
            } else {
                session
            }
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear {
            if questions.isEmpty {
                questions = QuizFactory.make(kind: kind)
            }
        }
    }

    private var session: some View {
        let q = questions[index]
        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Question \(index + 1) of \(questions.count)")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.gold)

                Text(q.prompt)
                    .font(.system(size: 22, weight: .semibold, design: .serif))
                    .foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)

                if let detail = q.detail {
                    Text(detail)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.cream.opacity(0.65))
                }

                if !q.cards.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        CardRow(cards: q.cards, width: kind == .startingHands ? 48 : 54)
                            .padding(.vertical, 4)
                    }
                }

                VStack(spacing: 10) {
                    ForEach(Array(q.choices.enumerated()), id: \.offset) { i, choice in
                        Button {
                            guard !revealed else { return }
                            selected = i
                            revealed = true
                            if i == q.correctIndex { score += 1 }
                        } label: {
                            HStack {
                                Text(choice)
                                    .font(.system(size: 16, weight: .medium, design: .rounded))
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                if revealed {
                                    if i == q.correctIndex {
                                        Image(systemName: "checkmark.circle.fill")
                                    } else if i == selected {
                                        Image(systemName: "xmark.circle.fill")
                                    }
                                }
                            }
                            .foregroundStyle(choiceForeground(i, correct: q.correctIndex))
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(choiceBackground(i, correct: q.correctIndex))
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(revealed)
                    }
                }

                if revealed {
                    Text(q.explanation)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.cream.opacity(0.8))
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color.white.opacity(0.07))
                        )

                    Button(action: advance) {
                        Text(index + 1 >= questions.count ? "See results" : "Next")
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.gold))
                            .foregroundStyle(Theme.feltDeep)
                    }
                    .padding(.top, 4)
                }
            }
            .padding(20)
        }
    }

    private var results: some View {
        VStack(spacing: 18) {
            Text("Session complete")
                .font(.system(size: 28, weight: .bold, design: .serif))
                .foregroundStyle(Theme.cream)

            Text("\(score) / \(questions.count)")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.gold)

            Text(encouragement)
                .font(.system(size: 15))
                .foregroundStyle(Theme.cream.opacity(0.7))
                .multilineTextAlignment(.center)

            Button {
                questions = QuizFactory.make(kind: kind)
                index = 0
                score = 0
                selected = nil
                revealed = false
                finished = false
            } label: {
                Text("Try again")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.gold))
                    .foregroundStyle(Theme.feltDeep)
            }
            .padding(.horizontal, 24)
        }
        .padding(24)
        .onAppear {
            progress.recordQuiz(kind: kind, score: score, total: questions.count)
        }
    }

    private var encouragement: String {
        let pct = questions.isEmpty ? 0 : Double(score) / Double(questions.count)
        switch pct {
        case 0.85...: return "Sharp. You’re reading these spots well."
        case 0.6..<0.85: return "Solid. Review the misses and run it again."
        default: return "Good reps. Revisit the matching lesson, then retry."
        }
    }

    private func advance() {
        if index + 1 >= questions.count {
            finished = true
        } else {
            index += 1
            selected = nil
            revealed = false
        }
    }

    private func choiceBackground(_ i: Int, correct: Int) -> Color {
        guard revealed else { return Color.white.opacity(0.08) }
        if i == correct { return Theme.gold.opacity(0.28) }
        if i == selected { return Theme.danger.opacity(0.28) }
        return Color.white.opacity(0.05)
    }

    private func choiceForeground(_ i: Int, correct: Int) -> Color {
        guard revealed else { return Theme.cream }
        if i == correct { return Theme.gold }
        if i == selected { return Color.red.opacity(0.9) }
        return Theme.cream.opacity(0.55)
    }
}
