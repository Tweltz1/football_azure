import Foundation

/// The two sides. The Rogue AI plays for the saboteurs.
public enum Team: String, Codable, Sendable {
    case crew
    case saboteurs
}

public enum Role: String, Codable, Sendable {
    case crew
    case saboteur
    case rogueAI

    public var team: Team { self == .crew ? .crew : .saboteurs }
}

/// A protocol card the officers install on the station.
public enum ProtocolCard: String, Codable, Sendable {
    case secure
    case breach
}

/// Commander powers unlocked by breach protocols.
public enum Power: String, Codable, Sendable, CaseIterable {
    /// Learn one player's team.
    case scan
    /// Look at the top three protocols of the deck.
    case sensorSweep
    /// Choose the next commander.
    case emergencyCommand
    /// Remove a player from the game.
    case airlock
}

public enum BoardMode: String, Codable, Sendable {
    /// Fixed powers by player count.
    case classic
    /// One of the early slots gets a random power, and the early slots are shuffled.
    case random
}

public enum WinReason: String, Codable, Sendable {
    case secureProtocols
    case breachProtocols
    case rogueAirlocked
    case rogueElected
}

public struct Player: Codable, Sendable, Equatable, Identifiable {
    public let id: Int
    public var name: String
    public var role: Role
    public var isAlive: Bool
}

/// Private information a single player has learned during the game.
public enum Intel: Equatable, Sendable {
    case scan(target: Int, team: Team)
    case sweep([ProtocolCard])
}

public enum Phase: Equatable, Sendable {
    case nominate
    case vote
    case commanderDiscard
    case officerEnact
    case abortResponse
    case power(Power)
    case gameOver(Team, WinReason)
}

public enum Action: Equatable, Sendable {
    case nominate(Int)
    case vote(Bool)
    /// Commander discards one of the three drawn protocols.
    case discard(index: Int)
    /// First officer installs one of the two remaining protocols.
    case enact(index: Int)
    /// First officer asks to abort the session (after five breaches).
    case requestAbort
    case respondAbort(accept: Bool)
    /// Use the pending power. Sensor sweep takes no target.
    case usePower(target: Int?)
}

/// Public record of what happened. Private results live in `GameState.intel`.
public enum Event: Equatable, Sendable {
    case roundStarted(commander: Int, emergency: Bool)
    case nominated(commander: Int, nominee: Int)
    case voteResult(votes: [Int: Bool], passed: Bool)
    case enacted(ProtocolCard, commander: Int?, officer: Int?)
    case unrestAdvanced(Int)
    case systemOverride
    case abortRequested(officer: Int)
    case abortResolved(accepted: Bool)
    case scanned(by: Int, target: Int)
    case sensorSweep(by: Int)
    case emergencyCommand(by: Int, chosen: Int)
    case airlocked(by: Int, target: Int)
    case deckReshuffled
    case gameOver(Team, WinReason)
}

public enum GameError: Error, Equatable {
    case notYourTurn
    case invalidAction
    case invalidTarget
    case gameOver
}

/// SplitMix64, so games can be replayed from a seed in tests.
public struct SeededRNG: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) { state = seed }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
