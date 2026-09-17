import SwiftUI

@main
struct HoldemCoachApp: App {
    @StateObject private var progress = ProgressStore()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(progress)
                .preferredColorScheme(.dark)
        }
    }
}
