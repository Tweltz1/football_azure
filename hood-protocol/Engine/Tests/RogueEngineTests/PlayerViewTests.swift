import XCTest
@testable import RogueEngine

final class PlayerViewTests: XCTestCase {
    private func seats(_ count: Int) -> [SeatInfo] {
        (0..<count).map { SeatInfo(name: "P\($0)", avatar: $0, isBot: false) }
    }

    func testCrewSeesOnlyOwnRole() {
        let game = GameState(names: (0..<7).map { "P\($0)" }, seed: 4)
        let crew = game.players.first { $0.role == .crew }!.id
        let view = game.view(for: crew, seats: seats(7))
        XCTAssertEqual(view.myRole, .crew)
        XCTAssertEqual(view.seats.compactMap(\.role).count, 1)
    }

    func testOnlyCommanderSeesDrawnProtocols() throws {
        var game = GameState(names: (0..<5).map { "P\($0)" }, seed: 8)
        try game.apply(.nominate(game.eligibleNominees[0]), by: game.commander)
        for seat in game.pendingActors { try game.apply(.vote(true), by: seat) }
        XCTAssertEqual(game.phase, .commanderDiscard)
        for seat in 0..<5 {
            let view = game.view(for: seat, seats: seats(5))
            XCTAssertEqual(view.hand.count, seat == game.commander ? 3 : 0)
        }
    }

    func testVotesStayHiddenUntilEveryoneVotes() throws {
        var game = GameState(names: (0..<5).map { "P\($0)" }, seed: 2)
        try game.apply(.nominate(game.eligibleNominees[0]), by: game.commander)
        try game.apply(.vote(false), by: 0)
        let view = game.view(for: 1, seats: seats(5))
        XCTAssertEqual(view.voted, [0])
        XCTAssertFalse(view.log.contains { if case .voteResult = $0 { return true } else { return false } })
    }

    func testViewRoundTripsThroughJSON() throws {
        var game = GameState(names: (0..<6).map { "P\($0)" }, seed: 13)
        try game.apply(.nominate(game.eligibleNominees[0]), by: game.commander)
        let view = game.view(for: 0, seats: seats(6))
        let decoded = try JSONDecoder().decode(PlayerView.self, from: JSONEncoder().encode(view))
        XCTAssertEqual(decoded, view)
        let action = Action.usePower(target: 3)
        XCTAssertEqual(try JSONDecoder().decode(Action.self, from: JSONEncoder().encode(action)), action)
    }

    func testGameOverRevealsEveryRole() throws {
        var game = GameState(names: (0..<5).map { "P\($0)" }, seed: 17)
        var rng = SeededRNG(seed: 1)
        while !game.isOver {
            let seat = game.pendingActors[0]
            try game.apply(Bot.action(for: seat, in: game, rng: &rng)!, by: seat)
        }
        XCTAssertEqual(game.view(for: 0, seats: seats(5)).seats.compactMap(\.role).count, 5)
    }
}
