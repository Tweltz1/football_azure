import SwiftUI
import RogueEngine

struct GameView: View {
    @ObservedObject var controller: GameController
    let onQuit: () -> Void

    @State private var showingRole = false

    private var game: GameState { controller.game }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if controller.hasSeenRole {
                ScrollView {
                    VStack(spacing: 16) {
                        BoardView(game: game)
                        RosterView(controller: controller)
                        ActionPanel(controller: controller)
                        LogView(controller: controller)
                    }
                    .padding()
                }
            } else {
                RoleRevealView(controller: controller) { controller.start() }
                    .padding()
            }
        }
        .navigationTitle("Hood Protocol")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Quit", action: onQuit)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingRole = true } label: { Image(systemName: "person.text.rectangle") }
                    .disabled(!controller.hasSeenRole)
            }
        }
        .sheet(isPresented: $showingRole) {
            RoleCard(controller: controller)
                .padding()
                .presentationDetents([.medium])
        }
    }
}

// MARK: - Role

struct RoleRevealView: View {
    @ObservedObject var controller: GameController
    let onReady: () -> Void
    @State private var revealed = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            if revealed {
                RoleCard(controller: controller)
                Button("I'm ready", action: onReady)
                    .buttonStyle(.borderedProminent)
            } else {
                Text("Your secret role is waiting.")
                    .font(.title3)
                Button("Reveal my role") { withAnimation { revealed = true } }
                    .buttonStyle(.borderedProminent)
            }
            Spacer()
        }
    }
}

struct RoleCard: View {
    @ObservedObject var controller: GameController

    var body: some View {
        let me = controller.me
        let allies = controller.game.knownRoles(for: controller.human)
            .filter { $0.key != controller.human }
            .sorted { $0.key < $1.key }
        VStack(spacing: 12) {
            Text(me.role.title)
                .font(.largeTitle.bold())
                .foregroundStyle(me.role.color)
            Text(me.role.goal)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            if !allies.isEmpty {
                Divider()
                Text("Your allies").font(.headline)
                ForEach(allies, id: \.key) { seat, role in
                    Text("\(controller.name(seat)): \(role.title)")
                        .foregroundStyle(role.color)
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 20))
    }
}

extension Role {
    var title: String {
        switch self {
        case .crew: return "Crew"
        case .saboteur: return "Saboteur"
        case .rogueAI: return "Rogue AI"
        }
    }

    var goal: String {
        switch self {
        case .crew: return "Install 5 Secure protocols or airlock the Rogue AI. Trust carefully."
        case .saboteur: return "Install 6 Breach protocols, or get the Rogue AI elected First Officer after 3 Breaches."
        case .rogueAI: return "Stay hidden. Get elected First Officer after 3 Breaches and the station is yours."
        }
    }

    var color: Color {
        switch self {
        case .crew: return Theme.secure
        case .saboteur: return Theme.breach
        case .rogueAI: return Theme.rogue
        }
    }
}

// MARK: - Board

struct BoardView: View {
    let game: GameState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            track(title: "Secure", filled: game.secureCount, total: GameState.securesToWin, color: Theme.secure) { _ in nil }
            track(title: "Breach", filled: game.breachCount, total: GameState.breachesToWin, color: Theme.breach) { index in
                index < game.powers.count ? game.powers[index]?.symbol : "flag.checkered"
            }
            HStack {
                Text("Unrest").font(.caption).foregroundStyle(.secondary)
                ForEach(0..<GameState.unrestLimit, id: \.self) { index in
                    Circle()
                        .fill(index < game.unrest ? Color.orange : Color.white.opacity(0.15))
                        .frame(width: 12, height: 12)
                }
                Spacer()
                Text("Deck \(game.deck.count) · Discard \(game.discardPile.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func track(title: String, filled: Int, total: Int, color: Color, symbol: @escaping (Int) -> String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach(0..<total, id: \.self) { index in
                    ZStack {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(index < filled ? color : Color.white.opacity(0.08))
                        if let name = symbol(index), index >= filled {
                            Image(systemName: name)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(height: 34)
                }
            }
        }
    }
}

extension Power {
    var symbol: String {
        switch self {
        case .scan: return "eye"
        case .sensorSweep: return "waveform"
        case .emergencyCommand: return "star.circle"
        case .airlock: return "xmark.octagon"
        }
    }

    var title: String {
        switch self {
        case .scan: return "Scan"
        case .sensorSweep: return "Sensor sweep"
        case .emergencyCommand: return "Emergency command"
        case .airlock: return "Airlock"
        }
    }
}

// MARK: - Roster

struct RosterView: View {
    @ObservedObject var controller: GameController

    private var game: GameState { controller.game }

    /// Votes from the most recent vote, shown until the next nomination.
    private var shownVotes: [Int: Bool] {
        for event in game.log.reversed() {
            if case .nominated = event { return [:] }
            if case let .voteResult(votes, _) = event { return votes }
        }
        return [:]
    }

    var body: some View {
        let votes = shownVotes
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
            ForEach(game.players) { player in
                VStack(spacing: 4) {
                    HStack(spacing: 4) {
                        if player.id == game.commander { Image(systemName: "star.fill").foregroundStyle(.yellow) }
                        if player.id == game.nominee { Image(systemName: "person.badge.shield.checkmark") }
                        Text(player.name).bold().strikethrough(!player.isAlive)
                    }
                    .font(.subheadline)
                    if let team = controller.knownTeam(of: player.id), player.id != controller.human || game.isOver {
                        Text(game.isOver ? player.role.title : (team == .crew ? "Crew" : "Saboteur side"))
                            .font(.caption2)
                            .foregroundStyle(game.isOver ? player.role.color : Theme.color(team))
                    } else if player.id == controller.human {
                        Text("You").font(.caption2).foregroundStyle(.secondary)
                    }
                    if let vote = votes[player.id] {
                        Text(vote ? "Approve" : "Reject")
                            .font(.caption2.bold())
                            .foregroundStyle(vote ? .green : .red)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 64)
                .padding(6)
                .background(Theme.panel.opacity(player.isAlive ? 1 : 0.4), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}

// MARK: - Actions

struct ActionPanel: View {
    @ObservedObject var controller: GameController

    private var game: GameState { controller.game }
    private var mine: Bool { controller.isMyTurn }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(headline).font(.headline)
            if mine { controls }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(mine ? Theme.secure : .clear, lineWidth: 2))
    }

    private var headline: String {
        let commander = controller.name(game.commander)
        let officer = game.nominee.map(controller.name) ?? "someone"
        switch game.phase {
        case .nominate: return mine ? "You're Commander. Nominate a First Officer." : "\(commander) is choosing a First Officer."
        case .vote: return mine ? "Vote on \(commander) and \(officer)." : "Votes are coming in."
        case .commanderDiscard: return mine ? "Discard one protocol. The rest go to \(officer)." : "\(commander) is reviewing protocols."
        case .officerEnact: return mine ? "Install one protocol." : "\(officer) is installing a protocol."
        case .abortResponse: return mine ? "\(officer) wants to abort. Agree?" : "\(officer) asked \(commander) to abort."
        case let .power(power): return mine ? "Use your power: \(power.title)." : "\(commander) is using \(power.title)."
        case let .gameOver(team, reason): return "\(team == .crew ? "Crew" : "Saboteurs") win. \(reason.text)"
        }
    }

    @ViewBuilder private var controls: some View {
        switch game.phase {
        case .nominate:
            seatButtons(game.eligibleNominees) { controller.perform(.nominate($0)) }
        case .vote:
            HStack {
                Button("Approve") { controller.perform(.vote(true)) }.buttonStyle(.borderedProminent).tint(.green)
                Button("Reject") { controller.perform(.vote(false)) }.buttonStyle(.borderedProminent).tint(.red)
            }
        case .commanderDiscard:
            cardButtons(verb: "Discard") { controller.perform(.discard(index: $0)) }
        case .officerEnact:
            cardButtons(verb: "Install") { controller.perform(.enact(index: $0)) }
            if game.abortUnlocked && !game.abortRequested {
                Button("Request abort") { controller.perform(.requestAbort) }.buttonStyle(.bordered)
            }
        case .abortResponse:
            HStack {
                Button("Abort") { controller.perform(.respondAbort(accept: true)) }.buttonStyle(.borderedProminent)
                Button("Refuse") { controller.perform(.respondAbort(accept: false)) }.buttonStyle(.bordered)
            }
        case let .power(power):
            if power == .sensorSweep {
                HStack { ForEach(Array((controller.lastSweep ?? []).enumerated()), id: \.offset) { cardChip($0.element) } }
                Button("Done") { controller.perform(.usePower(target: nil)) }.buttonStyle(.borderedProminent)
            } else {
                seatButtons(game.powerTargets) { controller.perform(.usePower(target: $0)) }
            }
        case .gameOver:
            EmptyView()
        }
    }

    private func seatButtons(_ seats: [Int], action: @escaping (Int) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8)], spacing: 8) {
            ForEach(seats, id: \.self) { seat in
                Button(controller.name(seat)) { action(seat) }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func cardButtons(verb: String, action: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 10) {
            ForEach(Array(game.hand.enumerated()), id: \.offset) { index, card in
                Button { action(index) } label: {
                    VStack(spacing: 6) {
                        cardChip(card)
                        Text(verb).font(.caption)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func cardChip(_ card: ProtocolCard) -> some View {
        Text(card == .secure ? "SECURE" : "BREACH")
            .font(.caption.bold())
            .foregroundStyle(.black)
            .frame(width: 84, height: 110)
            .background(Theme.color(card), in: RoundedRectangle(cornerRadius: 10))
    }
}

extension WinReason {
    var text: String {
        switch self {
        case .secureProtocols: return "Five Secure protocols installed."
        case .breachProtocols: return "Six Breach protocols installed."
        case .rogueAirlocked: return "The Rogue AI went out the airlock."
        case .rogueElected: return "The Rogue AI was elected First Officer."
        }
    }
}

// MARK: - Log

struct LogView: View {
    @ObservedObject var controller: GameController

    var body: some View {
        let lines = controller.game.log.suffix(14).reversed().compactMap(controller.describe)
        VStack(alignment: .leading, spacing: 6) {
            Text("Station log").font(.headline)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }
}

extension GameController {
    func describe(_ event: Event) -> String? {
        switch event {
        case let .roundStarted(commander, emergency):
            return emergency ? "\(name(commander)) takes emergency command." : "\(name(commander)) is Commander."
        case let .nominated(commander, nominee):
            return "\(name(commander)) nominated \(name(nominee))."
        case let .voteResult(votes, passed):
            let yes = votes.values.filter { $0 }.count
            return "Vote \(passed ? "passed" : "failed"), \(yes) to \(votes.count - yes)."
        case let .enacted(card, commander, _):
            let kind = card == .secure ? "Secure" : "Breach"
            return commander == nil ? "Override installed a \(kind) protocol." : "A \(kind) protocol was installed."
        case let .unrestAdvanced(level):
            return "Unrest rises to \(level)."
        case .systemOverride:
            return "Unrest maxed out. The station overrides."
        case let .abortRequested(officer):
            return "\(name(officer)) requested an abort."
        case let .abortResolved(accepted):
            return accepted ? "The session was aborted." : "The abort was refused."
        case let .scanned(by, target):
            return "\(name(by)) scanned \(name(target))."
        case let .sensorSweep(by):
            return "\(name(by)) ran a sensor sweep."
        case let .emergencyCommand(by, chosen):
            return "\(name(by)) handed emergency command to \(name(chosen))."
        case let .airlocked(by, target):
            return "\(name(by)) sent \(name(target)) out the airlock."
        case .deckReshuffled:
            return "The protocol deck was reshuffled."
        case .gameOver:
            return nil
        }
    }
}
