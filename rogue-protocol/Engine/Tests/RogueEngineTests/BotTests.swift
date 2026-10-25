import XCTest
@testable import RogueEngine

final class BotTests: XCTestCase {
    /// Bots play whole games for every player count without making an illegal move.
    func testBotOnlyGamesFinish() throws {
        var wins: [Team: Int] = [:]
        for count in GameState.minPlayers...GameState.maxPlayers {
            for seed in 0..<200 {
                let mode: BoardMode = seed.isMultiple(of: 2) ? .classic : .random
                var game = GameState(names: (0..<count).map { "Bot \($0)" }, boardMode: mode, seed: UInt64(seed))
                var rng = SeededRNG(seed: UInt64(seed) &+ 99)
                var steps = 0
                while !game.isOver {
                    steps += 1
                    XCTAssertLessThan(steps, 2_000, "game stalled: \(count) players, seed \(seed)")
                    if steps >= 2_000 { break }
                    let seat = try XCTUnwrap(game.pendingActors.first)
                    let action = try XCTUnwrap(Bot.action(for: seat, in: game, rng: &rng), "no action in \(game.phase)")
                    try game.apply(action, by: seat)
                }
                if let winner = game.winner { wins[winner, default: 0] += 1 }
            }
        }
        // Both sides should be able to win; a lopsided split means the bots need tuning.
        let crew = wins[.crew] ?? 0
        let saboteurs = wins[.saboteurs] ?? 0
        print("Bot win split - crew: \(crew), saboteurs: \(saboteurs)")
        XCTAssertGreaterThan(crew, 100)
        XCTAssertGreaterThan(saboteurs, 100)
    }
}
