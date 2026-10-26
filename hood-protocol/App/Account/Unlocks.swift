import Foundation

/// Looks you earn by playing. Counts come from `Account.stats`, so they work signed out too
/// and carry over to your account when you sign in.
enum Unlocks {
    struct Requirement: Equatable {
        var games = 0
        var wins = 0
        var bongRips = 0
        var kegStands = 0
        var pongWins = 0
        var gameWins = 0
        var flipWins = 0

        func isMet(by stats: Stats) -> Bool {
            stats.games >= games && stats.wins >= wins && stats.bongRips >= bongRips && stats.kegStands >= kegStands
                && stats.pongWins >= pongWins && stats.gameWins >= gameWins && stats.flipWins >= flipWins
        }

        var text: String {
            func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
            if bongRips > 0 { return "Take " + plural(bongRips, "bong rip", "bong rips") }
            if kegStands > 0 { return "Do " + plural(kegStands, "keg stand", "keg stands") }
            if pongWins > 0 { return "Win " + plural(pongWins, "pong game", "pong games") }
            if gameWins > 0 { return "Win " + plural(gameWins, "video game match", "video game matches") }
            if flipWins > 0 { return "Win " + plural(flipWins, "flip cup race", "flip cup races") }
            if wins > 0 { return "Win " + plural(wins, "game", "games") }
            return "Play " + plural(games, "game", "games")
        }
    }

    enum Part: Equatable {
        case hair, hairColor, hat, top, clothesColor, glasses, chain, extra
    }

    struct Item {
        var part: Part
        var index: Int
        var name: String
        var requirement: Requirement
    }

    /// Everything the Hood crew wears is free from the start; these are earned, the sillier the longer it takes.
    static let items: [Item] = [
        Item(part: .glasses, index: 1, name: "Glasses", requirement: Requirement(wins: 1)),
        Item(part: .hat, index: 3, name: "Beanie", requirement: Requirement(games: 2)),
        Item(part: .hat, index: 4, name: "Party hat", requirement: Requirement(games: 3)),
        Item(part: .hair, index: 3, name: "Afro", requirement: Requirement(games: 4)),
        Item(part: .hair, index: 5, name: "Bun", requirement: Requirement(games: 6)),
        Item(part: .hair, index: 2, name: "Curly hair", requirement: Requirement(games: 8)),
        Item(part: .hat, index: 5, name: "Cowboy hat", requirement: Requirement(games: 10)),
        Item(part: .clothesColor, index: 8, name: "Pink fit", requirement: Requirement(games: 12)),
        Item(part: .top, index: 5, name: "Hawaiian shirt", requirement: Requirement(games: 14)),
        Item(part: .clothesColor, index: 9, name: "Army green fit", requirement: Requirement(games: 15)),
        Item(part: .extra, index: 1, name: "Gold grill", requirement: Requirement(games: 18)),
        Item(part: .hairColor, index: 5, name: "Silver hair", requirement: Requirement(games: 20)),
        Item(part: .top, index: 8, name: "Letterman jacket", requirement: Requirement(games: 22)),
        Item(part: .hat, index: 10, name: "Chef hat", requirement: Requirement(games: 25)),
        Item(part: .hat, index: 7, name: "Traffic cone", requirement: Requirement(games: 30)),
        Item(part: .top, index: 7, name: "Toga", requirement: Requirement(games: 40)),
        Item(part: .top, index: 6, name: "Tuxedo", requirement: Requirement(games: 50)),
        Item(part: .extra, index: 5, name: "Diamond earring", requirement: Requirement(games: 60)),
        Item(part: .clothesColor, index: 27, name: "Solid gold fit", requirement: Requirement(games: 75)),
        Item(part: .hat, index: 6, name: "Crown", requirement: Requirement(games: 100)),
        Item(part: .chain, index: 1, name: "Gold chain", requirement: Requirement(wins: 3)),
        Item(part: .hairColor, index: 6, name: "Purple hair", requirement: Requirement(wins: 10)),
        Item(part: .hairColor, index: 9, name: "Ice blue hair", requirement: Requirement(wins: 25)),
        // Earned in the basement
        Item(part: .hat, index: 11, name: "Tinfoil hat", requirement: Requirement(bongRips: 10)),
        Item(part: .hairColor, index: 8, name: "Neon green hair", requirement: Requirement(bongRips: 25)),
        Item(part: .extra, index: 4, name: "Sweatband", requirement: Requirement(kegStands: 3)),
        Item(part: .hat, index: 8, name: "Viking helmet", requirement: Requirement(kegStands: 15)),
        Item(part: .extra, index: 3, name: "Eye black", requirement: Requirement(pongWins: 2)),
        Item(part: .hat, index: 13, name: "Beer helmet", requirement: Requirement(pongWins: 10)),
        Item(part: .hat, index: 9, name: "Propeller cap", requirement: Requirement(gameWins: 3)),
        Item(part: .hat, index: 12, name: "Angel halo", requirement: Requirement(gameWins: 20)),
        Item(part: .extra, index: 2, name: "Clown nose", requirement: Requirement(flipWins: 3)),
        Item(part: .top, index: 9, name: "Referee shirt", requirement: Requirement(flipWins: 10)),
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
        if isLocked(.extra, look.extra, stats: stats) { look.extra = 0 }
        return look
    }

    static func newlyUnlocked(before: Stats, after: Stats) -> [String] {
        items.filter { !$0.requirement.isMet(by: before) && $0.requirement.isMet(by: after) }.map(\.name)
    }

    /// The next thing to earn by playing games, for the home screen.
    static func next(for stats: Stats) -> Item? {
        items.filter { $0.requirement.games > 0 || $0.requirement.wins > 0 }
            .sorted { $0.requirement.games + $0.requirement.wins * 3 < $1.requirement.games + $1.requirement.wins * 3 }
            .first { !$0.requirement.isMet(by: stats) }
    }
}
