import SwiftUI
import RogueEngine

@main
struct RogueProtocolApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @State private var controller: GameController?

    var body: some View {
        NavigationStack {
            if let controller {
                GameView(controller: controller) {
                    controller.stop()
                    self.controller = nil
                }
            } else {
                HomeView { count, mode in
                    controller = GameController(playerCount: count, boardMode: mode)
                }
            }
        }
        .tint(Theme.secure)
    }
}

enum Theme {
    static let background = Color(red: 0.04, green: 0.06, blue: 0.12)
    static let panel = Color(red: 0.09, green: 0.12, blue: 0.20)
    static let secure = Color(red: 0.30, green: 0.82, blue: 0.95)
    static let breach = Color(red: 0.98, green: 0.36, blue: 0.30)
    static let rogue = Color(red: 0.75, green: 0.45, blue: 1.0)

    static func color(_ card: ProtocolCard) -> Color { card == .secure ? secure : breach }
    static func color(_ team: Team) -> Color { team == .crew ? secure : breach }
}
