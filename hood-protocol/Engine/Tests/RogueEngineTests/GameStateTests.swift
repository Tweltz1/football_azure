import XCTest
@testable import RogueEngine

final class GameStateTests: XCTestCase {
    private func names(_ count: Int) -> [String] { (0..<count).map { "P\($0)" } }

    func testRoleCountsMatchTable() {
        let expected = [5: (3, 1), 6: (4, 1), 7: (4, 2), 8: (5, 2), 9: (5, 3), 10: (6, 3)]
        for (count, (crew, saboteurs)) in expected {
            let game = GameState(names: names(count), seed: UInt64(count))
            XCTAssertEqual(game.players.filter { $0.role == .crew }.count, crew, "\(count) players")
            XCTAssertEqual(game.players.filter { $0.role == .saboteur }.count, saboteurs, "\(count) players")
            XCTAssertEqual(game.players.filter { $0.role == .rogueAI }.count, 1, "\(count) players")
        }
    }

    func testDeckHasSixSecureAndElevenBreach() {
        let game = GameState(names: names(7), seed: 1)
        XCTAssertEqual(game.deck.count, 17)
        XCTAssertEqual(game.deck.filter { $0 == .secure }.count, 6)
    }

    func testRogueKnowsTeamOnlyInSmallGames() {
        for count in [5, 6, 7, 10] {
            let game = GameState(names: names(count), seed: 42)
            let rogue = game.players.first { $0.role == .rogueAI }!.id
            let saboteur = game.players.first { $0.role == .saboteur }!.id
            let crew = game.players.first { $0.role == .crew }!.id
            XCTAssertEqual(game.knownRoles(for: rogue).count > 1, count <= 6)
            XCTAssertEqual(game.knownRoles(for: saboteur)[rogue], .rogueAI)
            XCTAssertEqual(game.knownRoles(for: crew).count, 1)
        }
    }

    func testTermLimitsAfterElection() throws {
        var game = GameState(names: names(7), seed: 3)
        let firstCommander = game.commander
        let officer = game.eligibleNominees[0]
        try game.apply(.nominate(officer), by: firstCommander)
        try voteAll(&game, true)
        XCTAssertEqual(game.phase, .commanderDiscard)
        try game.apply(.discard(index: 0), by: firstCommander)
        try game.apply(.enact(index: 0), by: officer)
        if case .power = game.phase { try resolvePower(&game) }
        XCTAssertFalse(game.eligibleNominees.contains(officer))
        if game.commander != firstCommander {
            XCTAssertFalse(game.eligibleNominees.contains(firstCommander))
        }
    }

    func testThreeFailedVotesTriggerOverride() throws {
        var game = GameState(names: names(5), seed: 9)
        for _ in 0..<3 {
            try game.apply(.nominate(game.eligibleNominees[0]), by: game.commander)
            try voteAll(&game, false)
        }
        XCTAssertEqual(game.unrest, 0)
        XCTAssertEqual(game.secureCount + game.breachCount, 1)
        XCTAssertNil(game.lastElectedOfficer)
        XCTAssertTrue(game.log.contains(.systemOverride))
        XCTAssertEqual(game.phase, .nominate, "override never grants a power")
    }

    func testWrongPlayerCannotAct() {
        var game = GameState(names: names(5), seed: 5)
        let notCommander = (game.commander + 1) % 5
        XCTAssertThrowsError(try game.apply(.nominate(game.commander), by: notCommander)) {
            XCTAssertEqual($0 as? GameError, .notYourTurn)
        }
    }

    func testElectingRogueAfterThreeBreachesWins() throws {
        var game = GameState(names: names(5), seed: 11)
        let rogue = game.players.first { $0.role == .rogueAI }!.id
        for _ in 0..<40 where !game.isOver {
            if game.breachCount >= 3, game.eligibleNominees.contains(rogue) {
                try game.apply(.nominate(rogue), by: game.commander)
                try voteAll(&game, true)
                XCTAssertEqual(game.phase, .gameOver(.saboteurs, .rogueElected))
                return
            }
            try playBreachRound(&game, avoiding: rogue)
        }
        throw XCTSkip("seed never reached the setup")
    }

    func testAirlockingRogueWins() throws {
        var game = GameState(names: names(5), seed: 21)
        let rogue = game.players.first { $0.role == .rogueAI }!.id
        for _ in 0..<40 where !game.isOver {
            if case .power(.airlock) = game.phase, game.powerTargets.contains(rogue) {
                try game.apply(.usePower(target: rogue), by: game.commander)
                XCTAssertEqual(game.phase, .gameOver(.crew, .rogueAirlocked))
                return
            }
            if case .power = game.phase { try resolvePower(&game, avoiding: rogue); continue }
            try playBreachRound(&game, avoiding: rogue)
        }
        throw XCTSkip("seed never reached the setup")
    }

    func testRandomBoardKeepsAirlocksLate() {
        for seed in 0..<50 {
            let game = GameState(names: names(8), boardMode: .random, seed: UInt64(seed))
            XCTAssertEqual(game.powers.count, 5)
            XCTAssertEqual(game.powers[3], .airlock)
            XCTAssertEqual(game.powers[4], .airlock)
            XCTAssertTrue(game.powers[0..<3].contains { $0 != nil })
        }
    }

    // MARK: - Helpers

    private func voteAll(_ game: inout GameState, _ approve: Bool) throws {
        for seat in game.pendingActors { try game.apply(.vote(approve), by: seat) }
    }

    /// Elects the first eligible non-rogue officer and installs a breach when possible.
    private func playBreachRound(_ game: inout GameState, avoiding rogue: Int) throws {
        guard game.phase == .nominate else { return try resolvePower(&game, avoiding: rogue) }
        let officer = game.eligibleNominees.first { $0 != rogue } ?? game.eligibleNominees[0]
        try game.apply(.nominate(officer), by: game.commander)
        try voteAll(&game, true)
        guard game.phase == .commanderDiscard else { return }
        try game.apply(.discard(index: game.hand.firstIndex(of: .secure) ?? 0), by: game.commander)
        try game.apply(.enact(index: game.hand.firstIndex(of: .breach) ?? 0), by: officer)
        if case .power = game.phase { try resolvePower(&game, avoiding: rogue) }
    }

    private func resolvePower(_ game: inout GameState, avoiding rogue: Int = -1) throws {
        guard case let .power(power) = game.phase else { return }
        let target = power == .sensorSweep ? nil : (game.powerTargets.first { $0 != rogue } ?? game.powerTargets.first)
        try game.apply(.usePower(target: target), by: game.commander)
    }
}
