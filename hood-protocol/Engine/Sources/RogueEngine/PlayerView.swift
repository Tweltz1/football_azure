import Foundation

/// Who sits in a seat, as the host shows it to everyone.
public struct SeatInfo: Codable, Equatable, Sendable {
    public var name: String
    public var avatar: Int
    public var isBot: Bool

    public init(name: String, avatar: Int, isBot: Bool) {
        self.name = name
        self.avatar = avatar
        self.isBot = isBot
    }
}

/// Everything one seat is allowed to see. The host sends this to each phone,
/// so secret roles, hands and scan results never reach the wrong player.
public struct PlayerView: Codable, Equatable, Sendable {
    public struct Seat: Codable, Equatable, Sendable, Identifiable {
        public var id: Int
        public var info: SeatInfo
        public var isAlive: Bool
        /// Set only when this viewer knows the role (allies at setup, everyone at game over).
        public var role: Role?
    }

    public var mySeat: Int
    public var myRole: Role
    public var seats: [Seat]
    public var phase: Phase
    public var commander: Int
    public var nominee: Int?
    /// Seats that have voted so far. The votes themselves appear in the log once everyone has voted.
    public var voted: [Int]
    /// The protocols in this viewer's hand, if it is their turn to discard or install.
    public var hand: [ProtocolCard]
    public var secureCount: Int
    public var breachCount: Int
    public var unrest: Int
    public var deckCount: Int
    public var discardCount: Int
    public var powers: [Power?]
    public var eligibleNominees: [Int]
    public var powerTargets: [Int]
    public var abortUnlocked: Bool
    public var abortRequested: Bool
    public var intel: [Intel]
    public var log: [Event]
    public var pendingActors: [Int]

    public var isOver: Bool {
        if case .gameOver = phase { return true }
        return false
    }

    public var isMyTurn: Bool { pendingActors.contains(mySeat) }
}

extension GameState {
    public func view(for seat: Int, seats info: [SeatInfo]) -> PlayerView {
        let known = knownRoles(for: seat)
        let holdsHand: Bool
        switch phase {
        case .commanderDiscard: holdsHand = seat == commander
        case .officerEnact, .abortResponse: holdsHand = seat == nominee
        default: holdsHand = false
        }
        let seats = players.map { player in
            PlayerView.Seat(
                id: player.id,
                info: info.indices.contains(player.id) ? info[player.id] : SeatInfo(name: player.name, avatar: 0, isBot: false),
                isAlive: player.isAlive,
                role: isOver ? player.role : known[player.id]
            )
        }
        return PlayerView(
            mySeat: seat,
            myRole: players[seat].role,
            seats: seats,
            phase: phase,
            commander: commander,
            nominee: nominee,
            voted: phase == .vote ? votes.keys.sorted() : [],
            hand: holdsHand ? hand : [],
            secureCount: secureCount,
            breachCount: breachCount,
            unrest: unrest,
            deckCount: deck.count,
            discardCount: discardPile.count,
            powers: powers,
            eligibleNominees: phase == .nominate ? eligibleNominees : [],
            powerTargets: powerTargets,
            abortUnlocked: abortUnlocked,
            abortRequested: abortRequested,
            intel: intel[seat] ?? [],
            log: log,
            pendingActors: pendingActors
        )
    }
}
