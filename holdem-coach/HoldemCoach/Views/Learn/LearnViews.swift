import SwiftUI

struct LearnListView: View {
    @EnvironmentObject private var progress: ProgressStore

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.feltDeep.ignoresSafeArea()

                List {
                    ForEach(LessonCatalog.all) { lesson in
                        NavigationLink {
                            LessonDetailView(lesson: lesson)
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: progress.isLessonCompleted(lesson.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(progress.isLessonCompleted(lesson.id) ? Theme.gold : Theme.cream.opacity(0.35))
                                    .font(.system(size: 20))

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(lesson.title)
                                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                                        .foregroundStyle(Theme.cream)
                                    Text(lesson.subtitle)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Theme.cream.opacity(0.6))
                                    Text("\(lesson.minutes) min")
                                        .font(.system(size: 12, weight: .medium, design: .rounded))
                                        .foregroundStyle(Theme.gold.opacity(0.9))
                                        .padding(.top, 2)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(Color.white.opacity(0.06))
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Learn")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}

struct LessonDetailView: View {
    @EnvironmentObject private var progress: ProgressStore
    let lesson: Lesson

    var body: some View {
        ZStack {
            Theme.feltDeep.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(lesson.subtitle)
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.cream.opacity(0.7))

                    ForEach(lesson.sections) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(section.heading)
                                .font(.system(size: 20, weight: .semibold, design: .serif))
                                .foregroundStyle(Theme.gold)
                            Text(section.body)
                                .font(.system(size: 16, weight: .regular, design: .rounded))
                                .foregroundStyle(Theme.cream.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white.opacity(0.06))
                        )
                    }

                    if lesson.id == "hand-rankings" {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Quick reference")
                                .font(.system(size: 18, weight: .semibold, design: .serif))
                                .foregroundStyle(Theme.gold)
                            ForEach(HandCategory.allCases.reversed(), id: \.self) { category in
                                HStack {
                                    Text(category.title)
                                        .foregroundStyle(Theme.cream)
                                    Spacer()
                                    Text(category.blurb)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Theme.cream.opacity(0.55))
                                        .multilineTextAlignment(.trailing)
                                }
                                .padding(.vertical, 6)
                                Divider().overlay(Theme.cream.opacity(0.12))
                            }
                        }
                        .padding(16)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white.opacity(0.06))
                        )
                    }

                    Button {
                        progress.markLessonCompleted(lesson.id)
                    } label: {
                        Text(progress.isLessonCompleted(lesson.id) ? "Completed" : "Mark as completed")
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(progress.isLessonCompleted(lesson.id) ? Theme.cream.opacity(0.2) : Theme.gold)
                            )
                            .foregroundStyle(progress.isLessonCompleted(lesson.id) ? Theme.cream : Theme.feltDeep)
                    }
                    .disabled(progress.isLessonCompleted(lesson.id))
                    .padding(.top, 8)
                }
                .padding(20)
            }
        }
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }
}
