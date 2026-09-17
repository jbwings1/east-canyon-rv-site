import Foundation
import Combine

struct QuizResult: Codable, Identifiable, Equatable {
    let id: UUID
    let kind: QuizKind
    let score: Int
    let total: Int
    let date: Date

    var percent: Int {
        guard total > 0 else { return 0 }
        return Int((Double(score) / Double(total) * 100).rounded())
    }
}

@MainActor
final class ProgressStore: ObservableObject {
    @Published private(set) var completedLessonIDs: Set<String>
    @Published private(set) var quizHistory: [QuizResult]
    @Published private(set) var currentStreak: Int

    private let defaults = UserDefaults.standard
    private let lessonsKey = "hc.completedLessons"
    private let historyKey = "hc.quizHistory"
    private let streakKey = "hc.streak"
    private let lastPlayKey = "hc.lastPlayDay"

    init() {
        let lessons = defaults.stringArray(forKey: lessonsKey) ?? []
        completedLessonIDs = Set(lessons)
        if let data = defaults.data(forKey: historyKey),
           let decoded = try? JSONDecoder().decode([QuizResult].self, from: data) {
            quizHistory = decoded
        } else {
            quizHistory = []
        }
        currentStreak = defaults.integer(forKey: streakKey)
    }

    var lessonsCompletedCount: Int { completedLessonIDs.count }
    var lessonsTotal: Int { LessonCatalog.all.count }

    var bestQuizPercent: Int {
        quizHistory.map(\.percent).max() ?? 0
    }

    func isLessonCompleted(_ id: String) -> Bool {
        completedLessonIDs.contains(id)
    }

    func markLessonCompleted(_ id: String) {
        completedLessonIDs.insert(id)
        defaults.set(Array(completedLessonIDs), forKey: lessonsKey)
        touchStreak()
    }

    func recordQuiz(kind: QuizKind, score: Int, total: Int) {
        let result = QuizResult(id: UUID(), kind: kind, score: score, total: total, date: Date())
        quizHistory.insert(result, at: 0)
        if quizHistory.count > 50 {
            quizHistory = Array(quizHistory.prefix(50))
        }
        if let data = try? JSONEncoder().encode(quizHistory) {
            defaults.set(data, forKey: historyKey)
        }
        touchStreak()
    }

    func resetAll() {
        completedLessonIDs = []
        quizHistory = []
        currentStreak = 0
        defaults.removeObject(forKey: lessonsKey)
        defaults.removeObject(forKey: historyKey)
        defaults.removeObject(forKey: streakKey)
        defaults.removeObject(forKey: lastPlayKey)
    }

    private func touchStreak() {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let todayKey = formatter.string(from: today)

        if let lastKey = defaults.string(forKey: lastPlayKey),
           let lastDate = formatter.date(from: lastKey) {
            let gap = calendar.dateComponents([.day], from: lastDate, to: today).day ?? 0
            if gap == 0 {
                if currentStreak == 0 { currentStreak = 1 }
            } else if gap == 1 {
                currentStreak = max(currentStreak, 0) + 1
            } else {
                currentStreak = 1
            }
        } else {
            currentStreak = 1
        }

        defaults.set(todayKey, forKey: lastPlayKey)
        defaults.set(currentStreak, forKey: streakKey)
    }
}
