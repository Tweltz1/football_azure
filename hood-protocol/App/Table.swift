import CryptoKit
import Foundation
import RogueEngine

/// A game table as one phone sees it. The host runs the rules; players' phones only show
/// the view the host sends them and pass their moves back.
@MainActor
class Table: ObservableObject {
    @Published var view: PlayerView?
    @Published var lobby: LobbyState?
    @Published var status = ""
    @Published var ended: String?
    @Published var hasSeenRole = false
    /// Set once this phone has counted the finished game toward its stats.
    var resultRecorded = false

    var isHost: Bool { false }

    func perform(_ action: Action) {}
    func leave() {}
}

// MARK: - Host

enum TableMode {
    case solo, nearby, online
}

@MainActor
final class HostTable: Table {
    private struct Guest {
        var player: LobbyPlayer
        var peer: String
        var sealer: Sealer?
    }

    let mode: TableMode
    private let me: LobbyPlayer
    private let transport: Transport?
    private let hostKey = Curve25519.KeyAgreement.PrivateKey()
    private var guests: [Guest] = []
    private var game: GameState?
    private var seatInfo: [SeatInfo] = []
    /// Seat of each player id; seats missing here are bots.
    private var seatOf: [String: Int] = [:]
    private var rng = SeededRNG(seed: UInt64.random(in: .min ... .max))
    private var botTask: Task<Void, Never>?

    override var isHost: Bool { true }

    init(name: String, look: String, mode: TableMode, seats: Int = 7, boardMode: BoardMode = .random) {
        self.mode = mode
        me = LobbyPlayer(id: UUID().uuidString, name: name, look: look)
        let room = RoomCode.make()
        switch mode {
        case .solo: transport = nil
        case .nearby: transport = NearbyHost(name: name, room: room)
        case .online: transport = OnlineTransport(me: OnlineTransport.hostId, room: room)
        }
        super.init()
        lobby = LobbyState(room: room, players: [me], seatCount: seats, boardMode: boardMode, started: false,
                           hostKey: transport?.needsSealing == true ? hostKey.publicKey.rawRepresentation : nil)
        transport?.onStatus = { [weak self] in self?.status = $0 }
        transport?.onReceive = { [weak self] in self?.receive(from: $0, data: $1) }
        transport?.onReady = { [weak self] in self?.broadcastLobby(); self?.publish() }
        if mode == .solo { start() }
    }

    // MARK: Lobby

    func setSeats(_ count: Int) {
        guard var lobby, !lobby.started else { return }
        lobby.seatCount = min(max(count, GameState.minPlayers, lobby.players.count), GameState.maxPlayers)
        self.lobby = lobby
        broadcastLobby()
    }

    func setBoardMode(_ mode: BoardMode) {
        guard var lobby, !lobby.started else { return }
        lobby.boardMode = mode
        self.lobby = lobby
        broadcastLobby()
    }

    func kick(_ id: String) {
        guard lobby?.started == false, let index = guests.firstIndex(where: { $0.player.id == id }) else { return }
        let guest = guests.remove(at: index)
        send(.closed("The host removed you from the table."), to: guest)
        refreshLobbyPlayers()
    }

    func start() {
        guard var lobby, !lobby.started else { return }
        let humans = lobby.players
        let total = min(max(lobby.seatCount, GameState.minPlayers, humans.count), GameState.maxPlayers)
        let taken = Set(humans.map(\.name))
        var freeCrew = (0..<Crew.count).filter { !taken.contains(Crew.names[$0]) }.shuffled()
        seatInfo = humans.map { SeatInfo(name: $0.name, look: $0.look, isBot: false) }
        while seatInfo.count < total {
            let crew = freeCrew.isEmpty ? Int.random(in: 0..<Crew.count) : freeCrew.removeFirst()
            seatInfo.append(SeatInfo(name: Crew.names[crew], look: Look.crew(crew).code, isBot: true))
        }
        seatOf = Dictionary(uniqueKeysWithValues: humans.enumerated().map { ($0.element.id, $0.offset) })
        game = GameState(names: seatInfo.map(\.name), boardMode: lobby.boardMode, seed: UInt64.random(in: .min ... .max))
        lobby.started = true
        lobby.seatCount = total
        self.lobby = lobby
        broadcastLobby()
        publish()
        scheduleBots()
    }

    // MARK: Moves

    override func perform(_ action: Action) {
        apply(action, by: 0)
    }

    override func leave() {
        botTask?.cancel()
        for guest in guests { send(.closed("The host left the game."), to: guest) }
        transport?.stop()
    }

    private func apply(_ action: Action, by seat: Int) {
        guard var game else { return }
        do { try game.apply(action, by: seat) } catch { return }
        self.game = game
        publish()
        scheduleBots()
    }

    /// Sends every phone its own view of the game.
    private func publish() {
        guard let game else { return }
        view = game.view(for: 0, seats: seatInfo)
        for guest in guests {
            guard let seat = seatOf[guest.player.id] else { continue }
            send(.view(game.view(for: seat, seats: seatInfo)), to: guest)
        }
    }

    private func scheduleBots() {
        botTask?.cancel()
        botTask = Task { [weak self] in await self?.runBots() }
    }

    private func runBots() async {
        while !Task.isCancelled {
            guard let game, let seat = game.pendingActors.first(where: { seatInfo[$0].isBot }) else { return }
            // Votes trickle in quickly; bigger decisions get a beat so the table can follow along.
            let pause: UInt64 = game.phase == .vote ? 400_000_000 : 1_200_000_000
            try? await Task.sleep(nanoseconds: pause)
            if Task.isCancelled { return }
            guard let current = self.game, current.pendingActors.contains(seat),
                  let action = Bot.action(for: seat, in: current, rng: &rng) else { return }
            var next = current
            guard (try? next.apply(action, by: seat)) != nil else { return }
            self.game = next
            publish()
        }
    }

    // MARK: Network

    private func receive(from peer: String, data: Data) {
        guard var wire = Wire.decode(data) else { return }
        if case let .sealed(box) = wire {
            guard let guest = guests.first(where: { $0.peer == peer }), let opened = guest.sealer?.open(box) else { return }
            wire = opened
        } else if transport?.needsSealing == true, !isPublic(wire) {
            return
        }

        switch wire {
        case let .hello(hello):
            welcome(hello, peer: peer)
        case let .action(action):
            guard let guest = guests.first(where: { $0.peer == peer }), let seat = seatOf[guest.player.id] else { return }
            apply(action, by: seat)
        case .sync:
            guard let guest = guests.first(where: { $0.peer == peer }) else { return }
            sendLobby(to: guest)
            if let game, let seat = seatOf[guest.player.id] {
                send(.view(game.view(for: seat, seats: seatInfo)), to: guest)
            }
        default:
            break
        }
    }

    /// Only a hello may arrive unencrypted on a shared channel.
    private func isPublic(_ wire: Wire) -> Bool {
        if case .hello = wire { return true }
        return false
    }

    private func welcome(_ hello: Hello, peer: String) {
        let sealer: Sealer?
        if transport?.needsSealing == true {
            guard let key = hello.publicKey, let room = lobby?.room,
                  let made = try? Sealer(myKey: hostKey, theirKey: key, room: room) else { return }
            sealer = made
        } else {
            sealer = nil
        }
        let player = LobbyPlayer(id: hello.playerId, name: String(hello.name.prefix(20)), look: String(hello.look.prefix(60)))

        if let index = guests.firstIndex(where: { $0.player.id == hello.playerId }) {
            // Same phone coming back (reconnect or relaunch): keep its seat.
            guests[index].peer = peer
            guests[index].sealer = sealer
        } else {
            guard lobby?.started == false else {
                transport?.send(Wire.closed("That game has already started.").encoded(), to: peer)
                return
            }
            guard (lobby?.players.count ?? 0) < GameState.maxPlayers else {
                transport?.send(Wire.closed("The table is full.").encoded(), to: peer)
                return
            }
            guests.append(Guest(player: player, peer: peer, sealer: sealer))
            refreshLobbyPlayers()
        }

        guard let guest = guests.first(where: { $0.player.id == hello.playerId }) else { return }
        sendLobby(to: guest)
        if let game, let seat = seatOf[guest.player.id] {
            send(.view(game.view(for: seat, seats: seatInfo)), to: guest)
        }
    }

    private func refreshLobbyPlayers() {
        guard var lobby else { return }
        lobby.players = [me] + guests.map(\.player)
        lobby.seatCount = max(lobby.seatCount, lobby.players.count)
        self.lobby = lobby
        broadcastLobby()
    }

    private func broadcastLobby() {
        guard let lobby else { return }
        transport?.send(Wire.lobby(lobby).encoded(), to: nil)
    }

    private func sendLobby(to guest: Guest) {
        guard let lobby else { return }
        transport?.send(Wire.lobby(lobby).encoded(), to: guest.peer)
    }

    private func send(_ wire: Wire, to guest: Guest) {
        let outgoing: Wire?
        if transport?.needsSealing == true {
            outgoing = guest.sealer?.seal(wire)
        } else {
            outgoing = wire
        }
        guard let outgoing else { return }
        transport?.send(outgoing.encoded(), to: guest.peer)
    }
}

// MARK: - Player

@MainActor
final class GuestTable: Table {
    private let hello: Hello
    private let transport: Transport
    private let myKey = Curve25519.KeyAgreement.PrivateKey()
    private var sealer: Sealer?
    private var helloTimer: Timer?

    /// Online players use their player id on the shared channel.
    static func online(name: String, look: String, room: String) -> GuestTable {
        let playerId = UUID().uuidString
        return GuestTable(name: name, look: look, playerId: playerId, transport: OnlineTransport(me: playerId, room: room))
    }

    init(name: String, look: String, playerId: String, transport: Transport) {
        self.transport = transport
        hello = Hello(playerId: playerId, name: name, look: look,
                      publicKey: transport.needsSealing ? myKey.publicKey.rawRepresentation : nil)
        super.init()
        status = "Connecting…"
        transport.onStatus = { [weak self] in self?.status = $0 }
        transport.onReceive = { [weak self] in self?.receive($1) }
        transport.onReady = { [weak self] in self?.sayHello() }
        helloTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.lobby == nil else { return }
                self.sayHello()
            }
        }
    }

    override func perform(_ action: Action) {
        send(.action(action))
    }

    override func leave() {
        helloTimer?.invalidate()
        transport.stop()
    }

    private func sayHello() {
        transport.send(Wire.hello(hello).encoded(), to: nil)
        if lobby != nil { send(.sync) }
    }

    private func send(_ wire: Wire) {
        if transport.needsSealing {
            guard let sealed = sealer?.seal(wire) else { return }
            transport.send(sealed.encoded(), to: nil)
        } else {
            transport.send(wire.encoded(), to: nil)
        }
    }

    private func receive(_ data: Data) {
        guard var wire = Wire.decode(data) else { return }
        if case let .sealed(box) = wire {
            guard let opened = sealer?.open(box) else { return }
            wire = opened
        }
        switch wire {
        case let .lobby(state):
            if sealer == nil, transport.needsSealing, let key = state.hostKey {
                sealer = try? Sealer(myKey: myKey, theirKey: key, room: state.room)
            }
            let wasWaiting = lobby == nil
            lobby = state
            status = state.started ? "Game in progress." : "Waiting for the host to start."
            if wasWaiting, state.started { send(.sync) }
        case let .view(next):
            view = next
        case let .closed(reason):
            ended = reason
            helloTimer?.invalidate()
        default:
            break
        }
    }
}
