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
        var crewWins = 0
        var narcWins = 0
        var snitchWins = 0

        func isMet(by stats: Stats) -> Bool {
            stats.games >= games && stats.wins >= wins && stats.bongRips >= bongRips && stats.kegStands >= kegStands
                && stats.pongWins >= pongWins && stats.gameWins >= gameWins && stats.flipWins >= flipWins
                && stats.crewWins >= crewWins && stats.narcWins >= narcWins && stats.snitchWins >= snitchWins
        }

        /// How far along you are, as (have, need), using whichever goal this item asks for.
        func progress(_ stats: Stats) -> (have: Int, need: Int) {
            let goals: [(Int, Int)] = [(stats.bongRips, bongRips), (stats.kegStands, kegStands), (stats.pongWins, pongWins),
                                       (stats.gameWins, gameWins), (stats.flipWins, flipWins), (stats.crewWins, crewWins),
                                       (stats.narcWins, narcWins), (stats.snitchWins, snitchWins), (stats.wins, wins), (stats.games, games)]
            let goal = goals.first { $0.1 > 0 } ?? (stats.games, 0)
            return (min(goal.0, goal.1), goal.1)
        }

        var text: String {
            func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
            if bongRips > 0 { return "Take " + plural(bongRips, "bong rip", "bong rips") }
            if kegStands > 0 { return "Do " + plural(kegStands, "keg stand", "keg stands") }
            if pongWins > 0 { return "Win " + plural(pongWins, "pong game", "pong games") }
            if gameWins > 0 { return "Win " + plural(gameWins, "video game match", "video game matches") }
            if flipWins > 0 { return "Win " + plural(flipWins, "flip cup race", "flip cup races") }
            if crewWins > 0 { return "Win " + plural(crewWins, "game as Crew", "games as Crew") }
            if narcWins > 0 { return "Win " + plural(narcWins, "game as a Narc", "games as a Narc") }
            if snitchWins > 0 { return "Win " + plural(snitchWins, "game as the Snitch", "games as the Snitch") }
            if wins > 0 { return "Win " + plural(wins, "game", "games") }
            return "Play " + plural(games, "game", "games")
        }
    }

    enum Part: Equatable {
        case hair, hairColor, hat, top, clothesColor, pantsColor, shoeColor, glasses, chain, extra
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
        // Round two: fifty more
        Item(part: .extra, index: 9, name: "Freckles", requirement: Requirement(games: 1)),
        Item(part: .extra, index: 12, name: "Bubblegum", requirement: Requirement(games: 4)),
        Item(part: .hair, index: 9, name: "Spiky hair", requirement: Requirement(games: 5)),
        Item(part: .top, index: 10, name: "Flannel", requirement: Requirement(games: 6)),
        Item(part: .hat, index: 17, name: "Bucket hat", requirement: Requirement(games: 7)),
        Item(part: .clothesColor, index: 28, name: "Neon orange fit", requirement: Requirement(games: 8)),
        Item(part: .hairColor, index: 10, name: "Hot pink hair", requirement: Requirement(games: 9)),
        Item(part: .pantsColor, index: 13, name: "Pink pants", requirement: Requirement(games: 9)),
        Item(part: .hat, index: 18, name: "Beret", requirement: Requirement(games: 11)),
        Item(part: .clothesColor, index: 29, name: "Lavender fit", requirement: Requirement(games: 12)),
        Item(part: .hairColor, index: 12, name: "Orange hair", requirement: Requirement(games: 13)),
        Item(part: .shoeColor, index: 7, name: "Pink kicks", requirement: Requirement(games: 15)),
        Item(part: .hair, index: 7, name: "Mohawk", requirement: Requirement(games: 16)),
        Item(part: .clothesColor, index: 30, name: "Baby blue fit", requirement: Requirement(games: 16)),
        Item(part: .top, index: 11, name: "Puffer jacket", requirement: Requirement(games: 17)),
        Item(part: .hat, index: 23, name: "Bandana", requirement: Requirement(games: 19)),
        Item(part: .top, index: 13, name: "Overalls", requirement: Requirement(games: 21)),
        Item(part: .hat, index: 22, name: "Durag", requirement: Requirement(games: 24)),
        Item(part: .clothesColor, index: 32, name: "Lime fit", requirement: Requirement(games: 26)),
        Item(part: .extra, index: 11, name: "Nose ring", requirement: Requirement(games: 27)),
        Item(part: .hair, index: 8, name: "Mullet", requirement: Requirement(games: 28)),
        Item(part: .pantsColor, index: 15, name: "White pants", requirement: Requirement(games: 32)),
        Item(part: .top, index: 17, name: "Bathrobe", requirement: Requirement(games: 33)),
        Item(part: .hair, index: 11, name: "Dreads", requirement: Requirement(games: 35)),
        Item(part: .hairColor, index: 13, name: "Platinum hair", requirement: Requirement(games: 45)),
        Item(part: .hat, index: 14, name: "Top hat", requirement: Requirement(games: 55)),
        Item(part: .extra, index: 6, name: "Monocle", requirement: Requirement(games: 65)),
        Item(part: .hat, index: 15, name: "Wizard hat", requirement: Requirement(games: 70)),
        Item(part: .clothesColor, index: 33, name: "Chrome fit", requirement: Requirement(games: 85)),
        Item(part: .pantsColor, index: 16, name: "Gold pants", requirement: Requirement(games: 90)),
        Item(part: .hairColor, index: 11, name: "Electric blue hair", requirement: Requirement(wins: 4)),
        Item(part: .hair, index: 10, name: "Pigtails", requirement: Requirement(wins: 5)),
        Item(part: .clothesColor, index: 31, name: "Maroon fit", requirement: Requirement(wins: 6)),
        Item(part: .hat, index: 21, name: "Graduation cap", requirement: Requirement(wins: 15)),
        Item(part: .shoeColor, index: 5, name: "Gold kicks", requirement: Requirement(wins: 20)),
        Item(part: .extra, index: 13, name: "Heart tattoo", requirement: Requirement(crewWins: 3)),
        Item(part: .top, index: 15, name: "Superhero cape", requirement: Requirement(crewWins: 10)),
        Item(part: .hat, index: 20, name: "Devil horns", requirement: Requirement(narcWins: 3)),
        Item(part: .extra, index: 10, name: "Fangs", requirement: Requirement(snitchWins: 1)),
        Item(part: .top, index: 16, name: "Leather jacket", requirement: Requirement(snitchWins: 2)),
        Item(part: .hairColor, index: 14, name: "Teal hair", requirement: Requirement(bongRips: 5)),
        Item(part: .top, index: 14, name: "Lab coat", requirement: Requirement(bongRips: 15)),
        Item(part: .extra, index: 8, name: "Star tattoo", requirement: Requirement(kegStands: 5)),
        Item(part: .hat, index: 19, name: "Bunny ears", requirement: Requirement(kegStands: 8)),
        Item(part: .shoeColor, index: 6, name: "Neon kicks", requirement: Requirement(kegStands: 10)),
        Item(part: .top, index: 12, name: "Basketball jersey", requirement: Requirement(pongWins: 4)),
        Item(part: .shoeColor, index: 8, name: "Purple kicks", requirement: Requirement(pongWins: 6)),
        Item(part: .pantsColor, index: 14, name: "Camo pants", requirement: Requirement(gameWins: 8)),
        Item(part: .hat, index: 16, name: "Pirate hat", requirement: Requirement(flipWins: 6)),
        Item(part: .extra, index: 7, name: "Eye patch", requirement: Requirement(flipWins: 15)),
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
        if isLocked(.pantsColor, look.pants, stats: stats) { look.pants = 0 }
        if isLocked(.shoeColor, look.shoes, stats: stats) { look.shoes = 0 }
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
