import Foundation

/// Rule-based players that fill empty seats.
///
/// A bot only uses what its seat could know: its own role, the teammates it was shown,
/// its own scan results, and the public log.
public enum Bot {
    public static func action(for seat: Int, in game: GameState, rng: inout SeededRNG) -> Action? {
        guard game.pendingActors.contains(seat) else { return nil }
        let mind = Mind(seat: seat, game: game)
        switch game.phase {
        case .nominate:
            return nominate(mind, game, &rng)
        case .vote:
            return .vote(vote(mind, game, &rng))
        case .commanderDiscard:
            return .discard(index: discard(mind, game, &rng))
        case .officerEnact:
            return enact(mind, game, &rng)
        case .abortResponse:
            return .respondAbort(accept: !mind.isSaboteurSide)
        case let .power(power):
            return usePower(power, mind, game, &rng)
        case .gameOver:
            return nil
        }
    }

    // MARK: - Decisions

    private static func nominate(_ mind: Mind, _ game: GameState, _ rng: inout SeededRNG) -> Action? {
        let options = game.eligibleNominees
        guard !options.isEmpty else { return nil }
        if mind.isSaboteurSide {
            if game.breachCount >= GameState.rogueElectionThreshold,
               let rogue = mind.knownRogue, options.contains(rogue) {
                return .nominate(rogue)
            }
            let allies = options.filter { mind.knownBad.contains($0) }
            if !allies.isEmpty, Double.random(in: 0..<1, using: &rng) < 0.6 {
                return .nominate(allies.randomElement(using: &rng)!)
            }
        }
        return .nominate(leastSuspicious(options, mind, &rng))
    }

    private static func vote(_ mind: Mind, _ game: GameState, _ rng: inout SeededRNG) -> Bool {
        guard let officer = game.nominee else { return true }
        let commander = game.commander
        if commander == mind.seat || officer == mind.seat { return true }

        if mind.isSaboteurSide {
            if game.breachCount >= GameState.rogueElectionThreshold, officer == mind.knownRogue { return true }
            if mind.knownBad.contains(officer) || mind.knownBad.contains(commander) { return true }
            return Double.random(in: 0..<1, using: &rng) < 0.5
        }

        // Electing an unknown officer late is how the Rogue AI wins, so crew get pickier.
        let lateGame = game.breachCount >= GameState.rogueElectionThreshold
        let risk = mind.suspicion(commander) + mind.suspicion(officer) * (lateGame ? 1.6 : 1)
        if mind.knownCrew.contains(officer), mind.suspicion(commander) < 2 { return true }
        if game.unrest == GameState.unrestLimit - 1, risk < 4 { return true }
        let noise = Double.random(in: -0.4...0.4, using: &rng)
        return risk + noise < 1.5
    }

    private static func discard(_ mind: Mind, _ game: GameState, _ rng: inout SeededRNG) -> Int {
        let hand = game.hand
        let breach = hand.firstIndex(of: .breach)
        let secure = hand.firstIndex(of: .secure)
        guard mind.isSaboteurSide else { return breach ?? 0 }

        let officerIsAlly = game.nominee.map { mind.knownBad.contains($0) } ?? false
        // Early on, saboteurs sometimes pass good cards to look trustworthy.
        let blendIn = !officerIsAlly && game.breachCount < 2 && Double.random(in: 0..<1, using: &rng) < 0.3
        if blendIn, let breach { return breach }
        return secure ?? 0
    }

    private static func enact(_ mind: Mind, _ game: GameState, _ rng: inout SeededRNG) -> Action {
        let hand = game.hand
        let breach = hand.firstIndex(of: .breach)
        let secure = hand.firstIndex(of: .secure)
        guard mind.isSaboteurSide else {
            if secure == nil, game.abortUnlocked, !game.abortRequested { return .requestAbort }
            return .enact(index: secure ?? 0)
        }
        let trustChance: Double
        switch (mind.role, game.breachCount) {
        case (.rogueAI, ..<3): trustChance = 0.5
        case (.saboteur, ..<2): trustChance = 0.2
        default: trustChance = 0
        }
        if let secure, Double.random(in: 0..<1, using: &rng) < trustChance { return .enact(index: secure) }
        return .enact(index: breach ?? 0)
    }

    private static func usePower(_ power: Power, _ mind: Mind, _ game: GameState, _ rng: inout SeededRNG) -> Action {
        let targets = game.powerTargets
        switch power {
        case .sensorSweep:
            return .usePower(target: nil)
        case .scan:
            let unknown = targets.filter { !mind.knownCrew.contains($0) && !mind.knownBad.contains($0) }
            return .usePower(target: mostSuspicious(unknown.isEmpty ? targets : unknown, mind, &rng))
        case .emergencyCommand:
            if mind.isSaboteurSide {
                let allies = targets.filter { mind.knownBad.contains($0) }
                if let ally = allies.randomElement(using: &rng) { return .usePower(target: ally) }
            }
            return .usePower(target: leastSuspicious(targets, mind, &rng))
        case .airlock:
            if mind.isSaboteurSide {
                let crew = targets.filter { !mind.knownBad.contains($0) }
                // Remove whoever the table trusts most.
                return .usePower(target: leastSuspicious(crew.isEmpty ? targets : crew, mind, &rng))
            }
            let candidates = targets.filter { !mind.knownCrew.contains($0) }
            return .usePower(target: mostSuspicious(candidates.isEmpty ? targets : candidates, mind, &rng))
        }
    }

    // MARK: - Helpers

    private static func leastSuspicious(_ seats: [Int], _ mind: Mind, _ rng: inout SeededRNG) -> Int {
        pick(seats, by: { mind.suspicion($0) }, lowest: true, &rng)
    }

    private static func mostSuspicious(_ seats: [Int], _ mind: Mind, _ rng: inout SeededRNG) -> Int {
        pick(seats, by: { mind.suspicion($0) }, lowest: false, &rng)
    }

    private static func pick(_ seats: [Int], by score: (Int) -> Double, lowest: Bool, _ rng: inout SeededRNG) -> Int {
        let scored = seats.map { ($0, score($0) + Double.random(in: 0..<0.25, using: &rng)) }
        let best = lowest ? scored.min { $0.1 < $1.1 } : scored.max { $0.1 < $1.1 }
        return best?.0 ?? seats[0]
    }
}

/// What one seat knows and how much it distrusts everyone else.
struct Mind {
    let seat: Int
    let role: Role
    let knownBad: Set<Int>
    let knownCrew: Set<Int>
    let knownRogue: Int?
    private let scores: [Int: Double]

    var isSaboteurSide: Bool { role.team == .saboteurs }

    init(seat: Int, game: GameState) {
        self.seat = seat
        role = game.players[seat].role
        let known = game.knownRoles(for: seat)
        var bad = Set(known.filter { $0.value != .crew && $0.key != seat }.map { $0.key })
        var crew: Set<Int> = role == .crew ? [seat] : []
        for item in game.intel[seat] ?? [] {
            if case let .scan(target, team) = item {
                if team == .saboteurs { bad.insert(target) } else { crew.insert(target) }
            }
        }
        knownBad = bad
        knownCrew = crew
        knownRogue = known.first { $0.value == .rogueAI }?.key

        // Public track record: governments that installed breaches look guilty.
        var scores: [Int: Double] = [:]
        var lastVotes: [Int: Bool] = [:]
        for event in game.log {
            switch event {
            case let .voteResult(votes, _):
                lastVotes = votes
            case let .enacted(card, commander?, officer?):
                let weight = card == .breach ? 1.0 : -0.5
                scores[commander, default: 0] += weight
                scores[officer, default: 0] += weight * 1.5
                if card == .breach {
                    for (voter, yes) in lastVotes where yes { scores[voter, default: 0] += 0.2 }
                }
            case let .abortRequested(officer):
                scores[officer, default: 0] -= 0.5
            default:
                break
            }
        }
        self.scores = scores
    }

    func suspicion(_ other: Int) -> Double {
        if other == seat || knownCrew.contains(other) { return -10 }
        if knownBad.contains(other) { return role == .crew ? 10 : -10 }
        return scores[other] ?? 0
    }
}
