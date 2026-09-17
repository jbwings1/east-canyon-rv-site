import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "suit.spade.fill") }

            LearnListView()
                .tabItem { Label("Learn", systemImage: "book.fill") }

            PracticeHubView()
                .tabItem { Label("Practice", systemImage: "brain.head.profile") }

            ProgressViewScreen()
                .tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }
        }
        .tint(Theme.gold)
    }
}
