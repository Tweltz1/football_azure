import SwiftUI
import RogueEngine

@main
struct HoodProtocolApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @State private var table: Table?

    var body: some View {
        NavigationStack {
            if let table {
                TableView(table: table) {
                    table.leave()
                    self.table = nil
                }
            } else {
                HomeView { table = $0 }
            }
        }
        .tint(Theme.accent)
    }
}

/// Shows the lobby until the game starts, then the game.
struct TableView: View {
    @ObservedObject var table: Table
    let onLeave: () -> Void

    var body: some View {
        Group {
            if table.view != nil {
                GameView(table: table, onQuit: onLeave)
            } else {
                LobbyView(table: table, onLeave: onLeave)
            }
        }
        .alert("Game ended", isPresented: Binding(get: { table.ended != nil && table.view?.isOver != true }, set: { _ in })) {
            Button("Leave", action: onLeave)
        } message: {
            Text(table.ended ?? "")
        }
    }
}

/// Hood League's colors.
enum Theme {
    static let background = Color(hex: 0x0A0B0E)
    static let panel = Color(hex: 0x111318)
    static let panel2 = Color(hex: 0x1D212A)
    static let accent = Color(hex: 0x8B6CFF)
    static let accentText = Color(hex: 0xB4A2FF)
    static let secure = Color(hex: 0x3DDC97)
    static let breach = Color(hex: 0xFF6B6B)
    static let warning = Color(hex: 0xF5B84A)
    static let rogue = accent

    static func color(_ card: ProtocolCard) -> Color { card == .secure ? secure : breach }
    static func color(_ team: Team) -> Color { team == .crew ? secure : breach }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// The Hood League crew, used for avatars and bot names.
enum Crew {
    static let names = ["John", "Evan", "Bush", "Pat", "Michael", "Chrome", "Connor", "Ben", "Weltz", "Logan"]
    static var count: Int { names.count }

    static func imageName(_ avatar: Int) -> String {
        String(format: "crew%02d", (avatar % count + count) % count + 1)
    }
}

struct Avatar: View {
    let index: Int
    var size: CGFloat = 44
    var dimmed = false

    var body: some View {
        Image(Crew.imageName(index))
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size * 1.3)
            .grayscale(dimmed ? 1 : 0)
            .opacity(dimmed ? 0.45 : 1)
    }
}
