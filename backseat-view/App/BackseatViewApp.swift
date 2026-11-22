import SwiftUI

@main
struct BackseatViewApp: App {
    @StateObject private var snapshots = SnapshotMonitor()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(snapshots)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { snapshots.stop() }
                }
        }
    }
}
