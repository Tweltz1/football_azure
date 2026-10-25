import RogueEngine

/// The basement story told on top of the engine's rules. Every name the player reads lives here.
enum Words {
    static let goodTeam = "Crew"
    static let badTeam = "Narcs"
    static let leader = "Host"
    static let wingman = "Wingman"
    static let rules = "house rules"
    static let drama = "Drama"
    static let tagline = "College all-nighter in the basement. Somebody here is a Narc."

    static func card(_ card: ProtocolCard) -> String { card == .secure ? "Chill" : "Busted" }
    static func team(_ team: Team) -> String { team == .crew ? goodTeam : badTeam }
}

extension Role {
    var title: String {
        switch self {
        case .crew: return "Crew"
        case .saboteur: return "Narc"
        case .rogueAI: return "The Snitch"
        }
    }

    var goal: String {
        switch self {
        case .crew: return "Pass 5 Chill rules or kick out the Snitch. Trust carefully."
        case .saboteur: return "Pass 6 Busted rules, or get the Snitch made Wingman after 3 Busted rules."
        case .rogueAI: return "Stay low-key. Get made Wingman after 3 Busted rules and the party's over."
        }
    }
}

extension Power {
    var title: String {
        switch self {
        case .scan: return "Bong rip"
        case .sensorSweep: return "Check the group chat"
        case .emergencyCommand: return "Grab the remote"
        case .airlock: return "Kick them out"
        }
    }

    var hint: String {
        switch self {
        case .scan: return "Take a rip and see who someone really is."
        case .sensorSweep: return "See the next 3 house rules."
        case .emergencyCommand: return "Pick who hosts next."
        case .airlock: return "Send someone home. If it's the Snitch, the Crew wins."
        }
    }

    var symbol: String {
        switch self {
        case .scan: return "smoke"
        case .sensorSweep: return "bubble.left.and.bubble.right"
        case .emergencyCommand: return "tv"
        case .airlock: return "door.left.hand.open"
        }
    }
}

extension WinReason {
    var text: String {
        switch self {
        case .secureProtocols: return "Five Chill rules passed. Party saved."
        case .breachProtocols: return "Six Busted rules passed. The party got shut down."
        case .rogueAirlocked: return "The Snitch got kicked out."
        case .rogueElected: return "The Snitch became Wingman."
        }
    }
}
