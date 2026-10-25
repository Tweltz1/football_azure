import Foundation
import RogueEngine

/// Runs a solo game: the person sits in seat 0 and bots play every other seat.
@MainActor
final class GameController: ObservableObject {
    static let botNames = ["Nova", "Orion", "Vega", "Juno", "Atlas", "Lyra", "Rook", "Ezra", "Sol", "Kai"]

    let human = 0
    @Published private(set) var game: GameState
    @Published var hasSeenRole = false

    private var rng: SeededRNG
    private var botTask: Task<Void, Never>?

    init(playerCount: Int, boardMode: BoardMode) {
        let seed = UInt64.random(in: .min ... .max)
        let names = ["You"] + Self.botNames.shuffled().prefix(playerCount - 1)
        game = GameState(names: names, boardMode: boardMode, seed: seed)
        rng = SeededRNG(seed: seed &+ 1)
    }

    var me: Player { game.players[human] }
    var isMyTurn: Bool { game.pendingActors.contains(human) }

    func name(_ seat: Int) -> String { game.players[seat].name }

    /// What seat 0 knows about another seat's team, from setup or scans.
    func knownTeam(of seat: Int) -> Team? {
        if let role = game.knownRoles(for: human)[seat] { return role.team }
        for case let .scan(target, team) in game.intel[human] ?? [] where target == seat { return team }
        if game.isOver { return game.players[seat].role.team }
        return nil
    }

    var lastSweep: [ProtocolCard]? {
        for case let .sweep(cards) in (game.intel[human] ?? []).reversed() { return cards }
        return nil
    }

    func start() {
        hasSeenRole = true
        scheduleBots()
    }

    func perform(_ action: Action) {
        do {
            try game.apply(action, by: human)
        } catch {
            return
        }
        scheduleBots()
    }

    func stop() {
        botTask?.cancel()
        botTask = nil
    }

    private func scheduleBots() {
        botTask?.cancel()
        botTask = Task { [weak self] in await self?.runBots() }
    }

    private func runBots() async {
        while !Task.isCancelled {
            guard let seat = game.pendingActors.first(where: { $0 != human }) else { return }
            // Votes trickle in quickly; bigger decisions get a beat so the table can follow along.
            let pause: UInt64 = game.phase == .vote ? 350_000_000 : 1_100_000_000
            try? await Task.sleep(nanoseconds: pause)
            if Task.isCancelled { return }
            guard game.pendingActors.contains(seat),
                  let action = Bot.action(for: seat, in: game, rng: &rng) else { return }
            try? game.apply(action, by: seat)
        }
    }
}
