import Foundation

/// The whole game. Every rule lives here; the app and bots only call `apply`.
public struct GameState: Sendable {
    public static let minPlayers = 5
    public static let maxPlayers = 10
    public static let securesToWin = 5
    public static let breachesToWin = 6
    public static let unrestLimit = 3
    /// Electing the Rogue AI as first officer wins once this many breaches are in.
    public static let rogueElectionThreshold = 3
    /// Abort becomes available once this many breaches are in.
    public static let abortThreshold = 5

    public private(set) var players: [Player]
    public private(set) var powers: [Power?]
    public private(set) var phase: Phase = .nominate
    public private(set) var commander: Int
    public private(set) var nominee: Int?
    public private(set) var votes: [Int: Bool] = [:]
    public private(set) var lastElectedCommander: Int?
    public private(set) var lastElectedOfficer: Int?
    public private(set) var hand: [ProtocolCard] = []
    public private(set) var deck: [ProtocolCard]
    public private(set) var discardPile: [ProtocolCard] = []
    public private(set) var secureCount = 0
    public private(set) var breachCount = 0
    public private(set) var unrest = 0
    public private(set) var abortRequested = false
    public private(set) var scanned: Set<Int> = []
    public private(set) var intel: [Int: [Intel]] = [:]
    public private(set) var log: [Event] = []

    /// Seat the clockwise rotation continues from. An emergency commander does not move it.
    private var rotationBase: Int
    private var rng: SeededRNG

    public init(names: [String], boardMode: BoardMode = .classic, seed: UInt64) {
        precondition((Self.minPlayers...Self.maxPlayers).contains(names.count), "5 to 10 players")
        var rng = SeededRNG(seed: seed)
        let count = names.count
        let crew = Self.crewCount(for: count)
        var roles = Array(repeating: Role.crew, count: crew)
            + Array(repeating: Role.saboteur, count: count - crew - 1)
            + [Role.rogueAI]
        roles.shuffle(using: &rng)
        players = names.enumerated().map { Player(id: $0.offset, name: $0.element, role: roles[$0.offset], isAlive: true) }

        var deck = Array(repeating: ProtocolCard.secure, count: 6) + Array(repeating: ProtocolCard.breach, count: 11)
        deck.shuffle(using: &rng)
        self.deck = deck
        powers = Self.board(for: count, mode: boardMode, rng: &rng)

        let first = Int.random(in: 0..<count, using: &rng)
        rotationBase = first
        commander = first
        self.rng = rng
        log.append(.roundStarted(commander: first, emergency: false))
    }

    // MARK: - Setup tables

    public static func crewCount(for players: Int) -> Int {
        [5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6][players] ?? 3
    }

    /// The house power order at every table size: 3rd Busted a bong rip, 4th a peek at the
    /// next 3 rules, 5th kicks someone out. The 6th wins it for the Narcs.
    public static let houseBoard: [Power?] = [nil, nil, .scan, .sensorSweep, .airlock]

    public static func classicBoard(for players: Int) -> [Power?] { houseBoard }

    /// Older lobbies may still ask for the random board; everyone plays the house order now.
    static func board(for players: Int, mode: BoardMode, rng: inout SeededRNG) -> [Power?] {
        houseBoard
    }

    // MARK: - Queries

    public var aliveCount: Int { players.filter(\.isAlive).count }
    public var abortUnlocked: Bool { breachCount >= Self.abortThreshold }

    public var isOver: Bool {
        if case .gameOver = phase { return true }
        return false
    }

    public var winner: Team? {
        if case let .gameOver(team, _) = phase { return team }
        return nil
    }

    /// Players who may act right now.
    public var pendingActors: [Int] {
        switch phase {
        case .nominate, .commanderDiscard, .abortResponse, .power: return [commander]
        case .officerEnact: return nominee.map { [$0] } ?? []
        case .vote: return players.filter { $0.isAlive && votes[$0.id] == nil }.map(\.id)
        case .gameOver: return []
        }
    }

    public var eligibleNominees: [Int] {
        players.filter { p in
            guard p.isAlive, p.id != commander, p.id != lastElectedOfficer else { return false }
            if aliveCount > 5, p.id == lastElectedCommander { return false }
            return true
        }.map(\.id)
    }

    /// Valid targets for the pending power.
    public var powerTargets: [Int] {
        guard case let .power(power) = phase else { return [] }
        let others = players.filter { $0.isAlive && $0.id != commander }.map(\.id)
        switch power {
        case .scan: return others.filter { !scanned.contains($0) }
        case .emergencyCommand, .airlock: return others
        case .sensorSweep: return []
        }
    }

    /// Roles a player knows at the start of the game.
    public func knownRoles(for seat: Int) -> [Int: Role] {
        let me = players[seat]
        var known: [Int: Role] = [seat: me.role]
        let rogueKnowsTeam = players.count <= 6
        if me.role == .saboteur || (me.role == .rogueAI && rogueKnowsTeam) {
            for p in players where p.role != .crew { known[p.id] = p.role }
        }
        return known
    }

    /// The power a breach in the given slot (1-based count) would unlock.
    public func power(forBreach count: Int) -> Power? {
        guard count >= 1, count <= powers.count else { return nil }
        return powers[count - 1]
    }

    // MARK: - Actions

    public mutating func apply(_ action: Action, by seat: Int) throws {
        if isOver { throw GameError.gameOver }
        guard players.indices.contains(seat), players[seat].isAlive, pendingActors.contains(seat) else {
            throw GameError.notYourTurn
        }

        switch (phase, action) {
        case let (.nominate, .nominate(target)):
            guard eligibleNominees.contains(target) else { throw GameError.invalidTarget }
            nominee = target
            votes = [:]
            phase = .vote
            log.append(.nominated(commander: commander, nominee: target))

        case let (.vote, .vote(approve)):
            votes[seat] = approve
            if votes.count == aliveCount { resolveVote() }

        case let (.commanderDiscard, .discard(index)):
            guard hand.indices.contains(index), hand.count == 3 else { throw GameError.invalidAction }
            discardPile.append(hand.remove(at: index))
            abortRequested = false
            phase = .officerEnact

        case let (.officerEnact, .enact(index)):
            guard hand.indices.contains(index), hand.count == 2 else { throw GameError.invalidAction }
            let card = hand.remove(at: index)
            discardPile.append(contentsOf: hand)
            hand = []
            install(card, commander: commander, officer: nominee)

        case (.officerEnact, .requestAbort):
            guard abortUnlocked, !abortRequested else { throw GameError.invalidAction }
            abortRequested = true
            phase = .abortResponse
            log.append(.abortRequested(officer: seat))

        case let (.abortResponse, .respondAbort(accept)):
            log.append(.abortResolved(accepted: accept))
            if accept {
                discardPile.append(contentsOf: hand)
                hand = []
                advanceUnrest()
            } else {
                phase = .officerEnact
            }

        case let (.power(power), .usePower(target)):
            try usePower(power, target: target)

        default:
            throw GameError.invalidAction
        }
    }

    // MARK: - Flow

    private mutating func resolveVote() {
        let yes = votes.values.filter { $0 }.count
        let passed = yes * 2 > aliveCount
        log.append(.voteResult(votes: votes, passed: passed))
        guard passed, let officer = nominee else {
            advanceUnrest()
            return
        }
        lastElectedCommander = commander
        lastElectedOfficer = officer
        if breachCount >= Self.rogueElectionThreshold, players[officer].role == .rogueAI {
            end(.saboteurs, .rogueElected)
            return
        }
        refillDeckIfNeeded()
        hand = Array(deck.prefix(3))
        deck.removeFirst(3)
        phase = .commanderDiscard
    }

    /// A failed vote or accepted abort. Three in a row installs the top protocol.
    private mutating func advanceUnrest() {
        unrest += 1
        log.append(.unrestAdvanced(unrest))
        if unrest >= Self.unrestLimit {
            log.append(.systemOverride)
            unrest = 0
            lastElectedCommander = nil
            lastElectedOfficer = nil
            refillDeckIfNeeded()
            let card = deck.removeFirst()
            install(card, commander: nil, officer: nil)
        } else {
            nextRound()
        }
    }

    /// Installs a protocol. Overrides (no officers) never trigger powers.
    private mutating func install(_ card: ProtocolCard, commander: Int?, officer: Int?) {
        log.append(.enacted(card, commander: commander, officer: officer))
        unrest = 0
        switch card {
        case .secure:
            secureCount += 1
            if secureCount >= Self.securesToWin { return end(.crew, .secureProtocols) }
        case .breach:
            breachCount += 1
            if breachCount >= Self.breachesToWin { return end(.saboteurs, .breachProtocols) }
        }
        refillDeckIfNeeded()

        if card == .breach, commander != nil, let power = power(forBreach: breachCount) {
            if power == .sensorSweep {
                addIntel(.sweep(Array(deck.prefix(3))), for: self.commander)
            }
            phase = .power(power)
        } else {
            nextRound()
        }
    }

    private mutating func usePower(_ power: Power, target: Int?) throws {
        switch power {
        case .sensorSweep:
            log.append(.sensorSweep(by: commander))
            nextRound()
        case .scan:
            guard let target, powerTargets.contains(target) else { throw GameError.invalidTarget }
            scanned.insert(target)
            addIntel(.scan(target: target, team: players[target].role.team), for: commander)
            log.append(.scanned(by: commander, target: target))
            nextRound()
        case .emergencyCommand:
            guard let target, powerTargets.contains(target) else { throw GameError.invalidTarget }
            log.append(.emergencyCommand(by: commander, chosen: target))
            startRound(commander: target, emergency: true)
        case .airlock:
            guard let target, powerTargets.contains(target) else { throw GameError.invalidTarget }
            players[target].isAlive = false
            log.append(.airlocked(by: commander, target: target))
            if players[target].role == .rogueAI {
                end(.crew, .rogueAirlocked)
            } else {
                nextRound()
            }
        }
    }

    private mutating func nextRound() {
        var seat = rotationBase
        repeat { seat = (seat + 1) % players.count } while !players[seat].isAlive
        rotationBase = seat
        startRound(commander: seat, emergency: false)
    }

    private mutating func startRound(commander seat: Int, emergency: Bool) {
        commander = seat
        nominee = nil
        votes = [:]
        hand = []
        abortRequested = false
        phase = .nominate
        log.append(.roundStarted(commander: seat, emergency: emergency))
    }

    private mutating func refillDeckIfNeeded() {
        guard deck.count < 3 else { return }
        var pile = deck + discardPile
        pile.shuffle(using: &rng)
        deck = pile
        discardPile = []
        log.append(.deckReshuffled)
    }

    private mutating func addIntel(_ item: Intel, for seat: Int) {
        intel[seat, default: []].append(item)
    }

    private mutating func end(_ team: Team, _ reason: WinReason) {
        hand = []
        phase = .gameOver(team, reason)
        log.append(.gameOver(team, reason))
    }
}
