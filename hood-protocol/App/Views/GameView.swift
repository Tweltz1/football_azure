import SwiftUI
import RogueEngine

struct GameView: View {
    @ObservedObject var table: Table
    let onQuit: () -> Void

    @State private var showingRole = false
    @State private var showingRules = false
    @State private var unlocked: [String] = []

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if let view = table.view {
                if table.hasSeenRole {
                    ScrollView {
                        VStack(spacing: 14) {
                            HangoutView(guests: guests(view), night: night(view), me: view.mySeat)
                            RoleRevealButton(view: view)
                            if !unlocked.isEmpty {
                                Label("Unlocked: \(unlocked.joined(separator: ", "))", systemImage: "gift.fill")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .padding(12)
                                    .background(Theme.warning.opacity(0.2), in: RoundedRectangle(cornerRadius: 14))
                                    .foregroundStyle(Theme.warning)
                            }
                            BoardView(view: view)
                            ActionPanel(view: view) { table.perform($0) }
                            LogView(view: view)
                        }
                        .padding(14)
                    }
                } else {
                    RoleRevealView(view: view) { table.hasSeenRole = true }
                        .padding()
                }
            }
        }
        .navigationTitle("Hood Protocol")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Leave", action: onQuit) }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingRules = true } label: { Image(systemName: "book.fill") }
                    .accessibilityLabel("How to play")
                Button { showingRole = true } label: { Image(systemName: "person.text.rectangle") }
                    .disabled(!table.hasSeenRole)
            }
        }
        .onChange(of: table.view?.isOver == true, initial: true) { _, over in
            if over { recordResult() }
        }
        .sheet(isPresented: $showingRole) {
            if let view = table.view {
                RoleCard(view: view).padding().presentationDetents([.medium])
            }
        }
        .sheet(isPresented: $showingRules) {
            NavigationStack {
                RulesView().toolbar { Button("Done") { showingRules = false } }
            }
        }
    }

    /// Counts the finished night toward this phone's wins and unlocks, once.
    private func recordResult() {
        guard !table.resultRecorded, let view = table.view, case let .gameOver(winner, _) = view.phase else { return }
        table.resultRecorded = true
        unlocked = Account.shared.recordGame(role: view.myRole, won: view.myRole.team == winner)
    }

    /// The night moves on with every house rule passed and every bit of drama.
    private func night(_ view: PlayerView) -> Double {
        if view.isOver { return 1 }
        let progress = Double(view.secureCount + view.breachCount) + Double(view.unrest) * 0.3
        return min(0.95, progress / 10)
    }

    private func guests(_ view: PlayerView) -> [HangoutGuest] {
        view.seats.map { seat in
            var badge: String?
            if seat.id == view.commander { badge = Words.leader }
            if seat.id == view.nominee { badge = Words.wingman }
            return HangoutGuest(
                id: seat.id,
                look: Look(code: seat.info.look),
                name: seat.id == view.mySeat ? "You" : seat.info.name,
                badge: badge,
                dimmed: !seat.isAlive,
                highlighted: view.pendingActors.contains(seat.id)
            )
        }
    }
}

// MARK: - Role

struct RoleRevealView: View {
    let view: PlayerView
    let onReady: () -> Void
    @State private var stage = 0

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            switch stage {
            case 0:
                LookPortrait(code: view.seats[view.mySeat].info.look, size: 110)
                Text("Your secret role is waiting.").font(.title3)
                Text("Make sure nobody's looking at your screen.").font(.footnote).foregroundStyle(.secondary)
                Button("Reveal my role") { withAnimation { stage = 1 } }.buttonStyle(.borderedProminent)
            case 1:
                LookPortrait(code: view.seats[view.mySeat].info.look, size: 110)
                RoleCard(view: view, showAllies: false)
                Button("Lights out") { withAnimation(.easeInOut(duration: 0.6)) { stage = 2 } }.buttonStyle(.borderedProminent)
            default:
                LightsOutView(view: view)
                Button("Lights on", action: onReady).buttonStyle(.borderedProminent)
            }
            Spacer()
        }
    }
}

/// Heads down at the start of the night. Narcs open their eyes and see each other, and the Snitch
/// puts a thumb up so the Narcs know who it is. Everyone gets the same screen length, so nobody's
/// phone gives them away.
struct LightsOutView: View {
    let view: PlayerView

    var body: some View {
        let narcs = view.seats.filter { $0.role != nil && $0.role != .crew }
        let sees = view.myRole != .crew && narcs.contains { $0.id != view.mySeat }
        VStack(spacing: 18) {
            Image(systemName: "moon.stars.fill").font(.system(size: 44)).foregroundStyle(Theme.warning)
            Text("Lights out").font(.largeTitle.weight(.black))
            Text(message(sees: sees)).multilineTextAlignment(.center).foregroundStyle(.secondary)
            if sees {
                VStack(spacing: 10) {
                    ForEach(narcs) { seat in
                        HStack(spacing: 10) {
                            LookPortrait(code: seat.info.look, size: 34)
                            Text(seat.id == view.mySeat ? "You" : seat.info.name).font(.headline)
                            Spacer()
                            if seat.role == .rogueAI {
                                Label("Snitch", systemImage: "hand.thumbsup.fill").foregroundStyle(Theme.rogue).font(.subheadline.weight(.bold))
                            } else {
                                Text("Narc").foregroundStyle(Theme.breach).font(.subheadline.weight(.bold))
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            } else if view.myRole == .rogueAI {
                Image(systemName: "hand.thumbsup.fill").font(.system(size: 60)).foregroundStyle(Theme.rogue)
            } else {
                Image(systemName: "eye.slash.fill").font(.system(size: 50)).foregroundStyle(.secondary)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Color(hex: 0x07060F), in: RoundedRectangle(cornerRadius: 24))
    }

    private func message(sees: Bool) -> String {
        switch view.myRole {
        case .crew:
            return "Heads down, eyes closed. The Narcs are looking around the room right now. Wait for the lights."
        case .saboteur:
            return "Open your eyes. These are the Narcs. The one with a thumb up is the Snitch."
        case .rogueAI:
            return sees ? "Thumb up. At a small table you get to look too: these are your Narcs."
                        : "Put your thumb up and keep your eyes closed. The Narcs see you, but you don't know who they are."
        }
    }
}

/// Tap to see your role, tap again to hide it. It hides by itself after a few seconds,
/// so a quick peek doesn't give you away.
struct RoleRevealButton: View {
    let view: PlayerView
    @State private var showing = false
    @State private var hideTask: Task<Void, Never>?

    var body: some View {
        Button(action: toggle) {
            if showing {
                VStack(spacing: 6) {
                    RoleCard(view: view)
                    Text("Tap to hide").font(.caption).foregroundStyle(.secondary)
                }
            } else {
                Label("See who you are", systemImage: "eye.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.accent.opacity(0.6), lineWidth: 1))
            }
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact, trigger: showing)
        .onDisappear { hideTask?.cancel() }
    }

    private func toggle() {
        withAnimation(.easeOut(duration: 0.2)) { showing.toggle() }
        hideTask?.cancel()
        guard showing else { return }
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { showing = false }
        }
    }
}

struct RoleCard: View {
    let view: PlayerView
    var showAllies = true

    var body: some View {
        let allies = showAllies ? view.seats.filter { $0.id != view.mySeat && $0.role != nil && $0.role != .crew } : []
        VStack(spacing: 12) {
            Text(view.myRole.title).font(.largeTitle.weight(.black)).foregroundStyle(view.myRole.color)
            Text(view.myRole.goal).multilineTextAlignment(.center).foregroundStyle(.secondary)
            if !allies.isEmpty {
                Divider()
                Text("Your people").font(.headline)
                ForEach(allies) { seat in
                    HStack {
                        LookPortrait(code: seat.info.look, size: 26)
                        Text("\(seat.info.name): \(seat.role?.title ?? "")").foregroundStyle(seat.role?.color ?? .primary)
                    }
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 20))
    }
}

extension Role {
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
    let view: PlayerView

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            track(title: "Chill", filled: view.secureCount, total: GameState.securesToWin, color: Theme.secure) { _ in nil }
            track(title: "Busted", filled: view.breachCount, total: GameState.breachesToWin, color: Theme.breach) { index in
                index < view.powers.count ? view.powers[index]?.symbol : "flag.checkered"
            }
            HStack {
                Text(Words.drama).font(.caption).foregroundStyle(.secondary)
                ForEach(0..<GameState.unrestLimit, id: \.self) { index in
                    Image(systemName: index < view.unrest ? "flame.fill" : "flame")
                        .foregroundStyle(index < view.unrest ? Theme.warning : Color.white.opacity(0.2))
                }
                Spacer()
                Text("Pile \(view.deckCount) · Tossed \(view.discardCount)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func track(title: String, filled: Int, total: Int, color: Color, symbol: @escaping (Int) -> String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(.caption.bold()).foregroundStyle(color)
            HStack(spacing: 6) {
                ForEach(0..<total, id: \.self) { index in
                    ZStack {
                        RoundedRectangle(cornerRadius: 6).fill(index < filled ? color : Color.white.opacity(0.06))
                        if let name = symbol(index), index >= filled {
                            Image(systemName: name).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(height: 32)
                }
            }
        }
    }
}

// MARK: - Actions

struct ActionPanel: View {
    let view: PlayerView
    let perform: (Action) -> Void

    private var mine: Bool { view.isMyTurn }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(headline).font(.headline)
            if mine { controls }
            if case .gameOver = view.phase { reveal }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(mine ? Theme.accent : .clear, lineWidth: 2))
    }

    private func name(_ seat: Int) -> String { seat == view.mySeat ? "You" : view.seats[seat].info.name }

    private var headline: String {
        let host = name(view.commander)
        let wingman = view.nominee.map(name) ?? "someone"
        switch view.phase {
        case .nominate: return mine ? "You're the \(Words.leader). Pick your \(Words.wingman)." : "\(host) is picking a \(Words.wingman)."
        case .vote:
            let waiting = view.seats.filter(\.isAlive).count - view.voted.count
            return mine ? "Vote on \(host) and \(wingman)." : "Waiting on \(waiting) vote\(waiting == 1 ? "" : "s")."
        case .commanderDiscard: return mine ? "Toss one house rule. \(wingman) gets the other two." : "\(host) is looking at the house rules."
        case .officerEnact: return mine ? "Pass one house rule." : "\(wingman) is passing a house rule."
        case .abortResponse: return mine ? "\(wingman) wants to toss the whole hand. Agree?" : "\(wingman) asked \(host) for a veto."
        case let .power(power): return mine ? "\(power.title)! \(power.hint)" : "\(host) gets a power: \(power.title)."
        case let .gameOver(team, reason): return "\(Words.team(team)) win. \(reason.text)"
        }
    }

    @ViewBuilder private var controls: some View {
        switch view.phase {
        case .nominate:
            seatButtons(view.eligibleNominees) { perform(.nominate($0)) }
        case .vote:
            if view.voted.contains(view.mySeat) {
                Text("Vote in. Waiting on the others…").foregroundStyle(.secondary)
            } else {
                HStack {
                    Button("Yeah") { perform(.vote(true)) }.buttonStyle(.borderedProminent).tint(Theme.secure)
                    Button("Nah") { perform(.vote(false)) }.buttonStyle(.borderedProminent).tint(Theme.breach)
                }
            }
        case .commanderDiscard:
            cardButtons(verb: "Toss") { perform(.discard(index: $0)) }
        case .officerEnact:
            cardButtons(verb: "Pass") { perform(.enact(index: $0)) }
            if view.abortUnlocked && !view.abortRequested {
                Button("Ask for a veto") { perform(.requestAbort) }.buttonStyle(.bordered)
            }
        case .abortResponse:
            HStack {
                Button("Veto it") { perform(.respondAbort(accept: true)) }.buttonStyle(.borderedProminent)
                Button("No way") { perform(.respondAbort(accept: false)) }.buttonStyle(.bordered)
            }
        case let .power(power):
            if power == .sensorSweep {
                HStack { ForEach(Array(lastSweep.enumerated()), id: \.offset) { cardChip($0.element) } }
                Button("Got it") { perform(.usePower(target: nil)) }.buttonStyle(.borderedProminent)
            } else {
                seatButtons(view.powerTargets) { perform(.usePower(target: $0)) }
            }
        case .gameOver:
            EmptyView()
        }
    }

    /// Every seat's role, once the night is over.
    private var reveal: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 8)], spacing: 8) {
            ForEach(view.seats) { seat in
                VStack(spacing: 2) {
                    LookPortrait(code: seat.info.look, size: 34)
                    Text(name(seat.id)).font(.caption.bold())
                    Text(seat.role?.title ?? "").font(.caption2).foregroundStyle(seat.role?.color ?? .secondary)
                }
            }
        }
    }

    private var lastSweep: [ProtocolCard] {
        for case let .sweep(cards) in view.intel.reversed() { return cards }
        return []
    }

    private func seatButtons(_ seats: [Int], action: @escaping (Int) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: 8)], spacing: 8) {
            ForEach(seats, id: \.self) { seat in
                Button { action(seat) } label: {
                    VStack(spacing: 2) {
                        LookPortrait(code: view.seats[seat].info.look, size: 30)
                        Text(name(seat)).font(.caption.bold()).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func cardButtons(verb: String, action: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 10) {
            ForEach(Array(view.hand.enumerated()), id: \.offset) { index, card in
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
        VStack(spacing: 6) {
            Image(systemName: card == .secure ? "sunglasses" : "light.beacon.max")
                .font(.title2)
            Text(Words.card(card).uppercased()).font(.caption.weight(.black))
        }
        .foregroundStyle(.black)
        .frame(width: 84, height: 110)
        .background(Theme.color(card), in: RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Log

struct LogView: View {
    let view: PlayerView

    var body: some View {
        let lines = view.log.suffix(16).reversed().compactMap(describe)
        VStack(alignment: .leading, spacing: 6) {
            Text("What happened").font(.headline)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func name(_ seat: Int) -> String { seat == view.mySeat ? "You" : view.seats[seat].info.name }

    private func describe(_ event: Event) -> String? {
        switch event {
        case let .roundStarted(host, emergency):
            return emergency ? "\(name(host)) grabbed the remote and hosts this round." : "\(name(host)) is the \(Words.leader)."
        case let .nominated(host, wingman):
            return "\(name(host)) picked \(name(wingman)) as \(Words.wingman)."
        case let .voteResult(votes, passed):
            let yes = votes.filter(\.value).map { name($0.key) }.sorted()
            let no = votes.filter { !$0.value }.map { name($0.key) }.sorted()
            return "Vote \(passed ? "passed" : "failed"). Yeah: \(yes.isEmpty ? "nobody" : yes.joined(separator: ", ")). Nah: \(no.isEmpty ? "nobody" : no.joined(separator: ", "))."
        case let .enacted(card, host, _):
            return host == nil ? "The parents came down. A \(Words.card(card)) rule passed on its own." : "A \(Words.card(card)) rule passed."
        case let .unrestAdvanced(level):
            return "\(Words.drama) is at \(level)."
        case .systemOverride:
            return "Too much drama!"
        case let .abortRequested(wingman):
            return "\(name(wingman)) asked for a veto."
        case let .abortResolved(accepted):
            return accepted ? "The whole hand got tossed." : "The veto was shut down."
        case let .scanned(by, target):
            return "\(name(by)) hit the bong with \(name(target))."
        case let .sensorSweep(by):
            return "\(name(by)) checked the group chat."
        case let .emergencyCommand(by, chosen):
            return "\(name(by)) handed the remote to \(name(chosen))."
        case let .airlocked(by, target):
            return "\(name(by)) kicked \(name(target)) out of the basement."
        case .deckReshuffled:
            return "The house rules got reshuffled."
        case .gameOver:
            return nil
        }
    }
}
