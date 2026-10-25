import Foundation

/// Looks you earn by playing. Counts come from `Account.stats`, so they work signed out too
/// and carry over to your account when you sign in.
enum Unlocks {
    struct Requirement: Equatable {
        var games = 0
        var wins = 0

        func isMet(by stats: Stats) -> Bool { stats.games >= games && stats.wins >= wins }

        var text: String {
            if wins > 0 { return "Win \(wins) game\(wins == 1 ? "" : "s")" }
            return "Play \(games) game\(games == 1 ? "" : "s")"
        }
    }

    enum Part: Equatable {
        case hair, hairColor, hat, top, clothesColor, glasses, chain
    }

    struct Item {
        var part: Part
        var index: Int
        var name: String
        var requirement: Requirement
    }

    static let items: [Item] = [
        Item(part: .hat, index: 2, name: "Backwards cap", requirement: Requirement(games: 2)),
        Item(part: .top, index: 1, name: "Hoodie", requirement: Requirement(games: 3)),
        Item(part: .hair, index: 3, name: "Afro", requirement: Requirement(games: 4)),
        Item(part: .glasses, index: 1, name: "Glasses", requirement: Requirement(wins: 1)),
        Item(part: .hair, index: 5, name: "Bun", requirement: Requirement(games: 6)),
        Item(part: .hat, index: 3, name: "Beanie", requirement: Requirement(games: 8)),
        Item(part: .chain, index: 1, name: "Gold chain", requirement: Requirement(wins: 3)),
        Item(part: .top, index: 2, name: "Jersey", requirement: Requirement(wins: 5)),
        Item(part: .clothesColor, index: 8, name: "Pink fit", requirement: Requirement(games: 12)),
        Item(part: .clothesColor, index: 9, name: "Army green fit", requirement: Requirement(games: 15)),
        Item(part: .hairColor, index: 5, name: "Silver hair", requirement: Requirement(games: 20)),
        Item(part: .hairColor, index: 6, name: "Purple hair", requirement: Requirement(wins: 10)),
    ]

    static func requirement(_ part: Part, _ index: Int) -> Requirement? {
        items.first { $0.part == part && $0.index == index }?.requirement
    }

    static func isLocked(_ part: Part, _ index: Int, stats: Stats) -> Bool {
        guard let requirement = requirement(part, index) else { return false }
        return !requirement.isMet(by: stats)
    }

    /// Swaps anything not unlocked yet for a free choice.
    static func sanitize(_ look: Look, stats: Stats) -> Look {
        var look = look
        if isLocked(.hair, look.hair, stats: stats) { look.hair = 1 }
        if isLocked(.hairColor, look.hairColor, stats: stats) { look.hairColor = 0 }
        if isLocked(.hat, look.hat, stats: stats) { look.hat = 1 }
        if isLocked(.top, look.top, stats: stats) { look.top = 0 }
        if isLocked(.clothesColor, look.topColor, stats: stats) { look.topColor = 0 }
        if isLocked(.clothesColor, look.hatColor, stats: stats) { look.hatColor = 0 }
        if look.glasses && isLocked(.glasses, 1, stats: stats) { look.glasses = false }
        if look.chain && isLocked(.chain, 1, stats: stats) { look.chain = false }
        return look
    }

    static func newlyUnlocked(before: Stats, after: Stats) -> [String] {
        items.filter { !$0.requirement.isMet(by: before) && $0.requirement.isMet(by: after) }.map(\.name)
    }

    /// The next thing to earn, for the home screen.
    static func next(for stats: Stats) -> Item? {
        items.first { !$0.requirement.isMet(by: stats) }
    }
}
