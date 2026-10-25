import SwiftUI
import RogueEngine

/// Waiting room: the host shares the room, sets the seats and starts; players wait.
struct LobbyView: View {
    @ObservedObject var table: Table
    let onLeave: () -> Void

    private var host: HostTable? { table as? HostTable }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    if let lobby = table.lobby {
                        HangoutView(guests: guests(lobby), me: lobby.players.firstIndex { $0.id == table.myPlayerId })
                        header(lobby)
                        players(lobby)
                        if let host { hostControls(host, lobby) }
                    } else {
                        ProgressView().padding(.top, 60)
                    }
                    Text(table.status).font(.footnote).foregroundStyle(.secondary)
                }
                .padding(16)
            }
        }
        .navigationTitle("The basement")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Leave", action: onLeave) }
        }
    }

    private func guests(_ lobby: LobbyState) -> [HangoutGuest] {
        lobby.players.enumerated().map { HangoutGuest(id: $0.offset, look: Look(code: $0.element.look), name: $0.element.name) }
    }

    @ViewBuilder private func header(_ lobby: LobbyState) -> some View {
        VStack(spacing: 6) {
            if host?.mode == .online || host == nil {
                Text("ROOM CODE").font(.caption.bold()).foregroundStyle(Theme.accentText)
                Text(lobby.room)
                    .font(.system(size: 48, weight: .black, design: .monospaced))
                    .textSelection(.enabled)
            }
            Text(host == nil ? "Waiting for the host to start." :
                    host?.mode == .online ? "Friends tap Join online and enter this code." :
                    "Friends nearby tap Join nearby. Keep this phone unlocked.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func players(_ lobby: LobbyState) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("IN THE BASEMENT (\(lobby.players.count))").font(.caption.bold()).foregroundStyle(Theme.accentText)
            ForEach(lobby.players) { player in
                HStack {
                    LookPortrait(code: player.look, size: 30)
                    Text(player.name).bold()
                    Spacer()
                    if player.id == lobby.players.first?.id {
                        Text("Host").font(.caption).foregroundStyle(.secondary)
                    } else if let host {
                        Button(role: .destructive) { host.kick(player.id) } label: { Image(systemName: "xmark.circle") }
                    }
                }
            }
            let bots = max(0, lobby.seatCount - lobby.players.count)
            if bots > 0 {
                Text("+ \(bots) bot\(bots == 1 ? "" : "s") from the Hood crew").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func hostControls(_ host: HostTable, _ lobby: LobbyState) -> some View {
        VStack(spacing: 12) {
            Stepper("Seats: \(lobby.seatCount)", value: Binding(get: { lobby.seatCount }, set: { host.setSeats($0) }),
                    in: max(GameState.minPlayers, lobby.players.count)...GameState.maxPlayers)
            Toggle("Random power board", isOn: Binding(get: { lobby.boardMode == .random }, set: { host.setBoardMode($0 ? .random : .classic) }))
            Button {
                host.start()
            } label: {
                Text("Start the night").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }
}
