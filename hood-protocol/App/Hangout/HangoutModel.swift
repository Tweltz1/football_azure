import SwiftUI

/// One person hanging out in the basement.
struct HangoutGuest: Equatable {
    var id: Int
    var look: Look
    var name: String
    var badge: String? = nil
    var dimmed = false
    var highlighted = false
}

/// Things to do in the basement.
enum Activity: CaseIterable {
    case games, pong, flip, keg, bong, couch

    var title: String {
        switch self {
        case .games: return "Video games"
        case .pong: return "Beer pong"
        case .flip: return "Flip cup"
        case .keg: return "Keg stand"
        case .bong: return "Bong rip"
        case .couch: return "Couch"
        }
    }

    var symbol: String {
        switch self {
        case .games: return "gamecontroller.fill"
        case .pong: return "circle.grid.cross.fill"
        case .flip: return "cup.and.saucer.fill"
        case .keg: return "drop.fill"
        case .bong: return "smoke.fill"
        case .couch: return "sofa.fill"
        }
    }
}

/// Where everyone is and what they're doing. Positions are worked out from the time,
/// so the view can draw any frame without changing state. Your own character goes where you tap;
/// everyone else picks things to do on their own. Beer pong, flip cup, keg stands and the bong
/// are played out for real: turns, cups pulled, races won, the bong passed.
final class HangoutModel: ObservableObject {
    /// The room is drawn in a 1000 x 640 space.
    static let size = CGSize(width: 1000, height: 640)
    static let floorTop: CGFloat = 430
    static let door = CGPoint(x: 945, y: 440)

    struct Spot {
        /// What the spot is for, first one first.
        var uses: [Activity]
        var point: CGPoint
    }

    static let spots: [Spot] = [
        Spot(uses: [.games], point: CGPoint(x: 150, y: 560)),
        Spot(uses: [.games], point: CGPoint(x: 262, y: 590)),
        Spot(uses: [.bong, .couch], point: CGPoint(x: 440, y: 482)),
        Spot(uses: [.couch], point: CGPoint(x: 530, y: 482)),
        Spot(uses: [.bong, .couch], point: CGPoint(x: 620, y: 482)),
        Spot(uses: [.pong], point: CGPoint(x: 735, y: 590)),
        Spot(uses: [.pong], point: CGPoint(x: 958, y: 590)),
        Spot(uses: [.flip], point: CGPoint(x: 398, y: 622)),
        Spot(uses: [.flip], point: CGPoint(x: 682, y: 622)),
        Spot(uses: [.keg], point: CGPoint(x: 845, y: 604)),
        Spot(uses: [.keg], point: CGPoint(x: 902, y: 618)),
        Spot(uses: [.games], point: CGPoint(x: 78, y: 610)),
        Spot(uses: [.games], point: CGPoint(x: 190, y: 630)),
    ]
    /// Left end, right end.
    static let pongSpots = [5, 6]
    static let flipSpots = [7, 8]
    /// On the keg, holding their legs.
    static let kegSpots = [9, 10]
    /// The keg sits on the floor in front of the pong table.
    static let kegBase = CGPoint(x: 845, y: 612)
    static let kegTop = CGPoint(x: 845, y: 552)

    /// Tap areas for each activity, in room space, checked in this order.
    static let hotspotOrder: [Activity] = [.keg, .bong, .flip, .pong, .games, .couch]

    static func hotspot(_ activity: Activity) -> CGRect {
        switch activity {
        case .keg: return CGRect(x: 800, y: 540, width: 90, height: 100)
        case .games: return CGRect(x: 20, y: 170, width: 276, height: 470)
        case .couch: return CGRect(x: 350, y: 330, width: 360, height: 165)
        case .bong: return CGRect(x: 462, y: 495, width: 150, height: 52)
        case .flip: return CGRect(x: 420, y: 556, width: 240, height: 84)
        case .pong: return CGRect(x: 700, y: 440, width: 300, height: 200)
        }
    }

    struct Person {
        var guest: HangoutGuest
        var from: CGPoint
        var to: CGPoint
        var start: Double
        var duration: Double
        var spot: Int?
        var activity: Activity?
        var nextDecision: Double
        var actionStart: Double = -100
        var drinkStart: Double = -100
        let seed = Double.random(in: 0...10)

        func position(at t: Double) -> CGPoint {
            guard duration > 0, t < start + duration else { return to }
            let k = max(0, (t - start) / duration)
            return CGPoint(x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k)
        }

        func isWalking(at t: Double) -> Bool { t >= start && t < start + duration }
    }

    /// A ping pong ball: an arc to the cups, then either in or off the table.
    struct Ball {
        static let flight = 0.8
        static let roll = 0.6
        var from: CGPoint
        var to: CGPoint
        var start: Double
        var hit: Bool
        var bounce: CGPoint

        func position(at t: Double) -> CGPoint? {
            let k = (t - start) / Self.flight
            guard k >= 0 else { return nil }
            if k <= 1 {
                return CGPoint(x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - 110 * sin(.pi * k))
            }
            guard !hit else { return nil }
            let j = (t - start - Self.flight) / Self.roll
            guard j <= 1 else { return nil }
            return CGPoint(x: to.x + (bounce.x - to.x) * j, y: to.y + (bounce.y - to.y) * j - 50 * sin(.pi * j))
        }
    }

    struct Splash {
        var point: CGPoint
        var start: Double
    }

    struct Puff {
        var origin: CGPoint
        var start: Double
        var size: Double = 1
    }

    enum FlipStage { case ready, drinking, flipping, landed }

    struct FlipLane {
        var stage: FlipStage = .ready
        var start = 0.0
        var success = false
    }

    static let drinkLength = 1.6
    static let flipDrink = 1.6
    static let flipTry = 0.9
    static let kegLength = 7.5
    static let ripLength = 9.0

    private(set) var people: [Int: Person] = [:]
    private(set) var balls: [Ball] = []
    private(set) var splashes: [Splash] = []
    private(set) var puffs: [Puff] = []
    var me: Int?
    /// Called when you take a rip, do a keg stand or win something in the basement.
    var onFeat: ((BasementFeat) -> Void)?

    /// Cups still standing at each end of the pong table, left end first.
    private(set) var pongCups = [[Bool]](repeating: [Bool](repeating: true, count: 6), count: 2)
    private(set) var pongWinner: Int?
    private var pongTurn = 0
    private var pongNext = 0.0

    private(set) var flipLanes = [FlipLane(), FlipLane()]
    private(set) var flipWinner: Int?
    private var flipRacing = false
    private var flipNext = 0.0

    private(set) var kegStart = -100.0
    private var kegNext = 0.0

    private(set) var bongUser: Int?
    private(set) var bongStart = -100.0
    private var bongNext = 0.0
    private var lastBongUser: Int?
    private var wantsRip: Int?

    private var lastCompany = 0.0
    private var matchEnd = 0.0
    private var later: [(Double, () -> Void)] = []

    static var now: Double { Date().timeIntervalSinceReferenceDate }

    private var timer: Timer?

    init() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in self?.tick() }
    }

    deinit { timer?.invalidate() }

    // MARK: Updates from the game

    func update(guests: [HangoutGuest], me: Int?) {
        self.me = me
        let now = Self.now
        let ids = Set(guests.map(\.id))
        for id in people.keys where !ids.contains(id) { leave(id) }
        people = people.filter { ids.contains($0.key) }
        for (index, guest) in guests.enumerated() {
            if var person = people[guest.id] {
                let wasDimmed = person.guest.dimmed
                person.guest = guest
                people[guest.id] = person
                if guest.dimmed && !wasDimmed {
                    leave(guest.id)
                    walk(guest.id, to: Self.door, now: now)
                }
            } else {
                let start = Self.startPoint(index)
                people[guest.id] = Person(guest: guest, from: start, to: start, start: now, duration: 0, spot: nil,
                                          nextDecision: now + Double.random(in: 0.3...2.5))
            }
        }
    }

    private static func startPoint(_ index: Int) -> CGPoint {
        let points: [CGPoint] = [CGPoint(x: 520, y: 575), CGPoint(x: 360, y: 545), CGPoint(x: 680, y: 545), CGPoint(x: 470, y: 600),
                                 CGPoint(x: 600, y: 600), CGPoint(x: 300, y: 520), CGPoint(x: 760, y: 520), CGPoint(x: 220, y: 615),
                                 CGPoint(x: 840, y: 610), CGPoint(x: 120, y: 500)]
        return points[index % points.count]
    }

    // MARK: Moving

    /// You tapped the room: go do that activity, or walk to that spot on the floor.
    func tap(_ point: CGPoint) {
        guard let me, people[me]?.guest.dimmed == false else { return }
        for activity in Self.hotspotOrder where Self.hotspot(activity).contains(point) {
            go(me, to: activity)
            return
        }
        if point.y >= Self.floorTop - 40 {
            leave(me)
            walk(me, to: CGPoint(x: min(max(point.x, 40), 960), y: min(max(point.y, 495), 625)), now: Self.now)
        }
    }

    func go(_ id: Int, to activity: Activity) {
        guard let person = people[id], !person.guest.dimmed else { return }
        if person.activity == activity, person.spot != nil {
            // Already there: tapping again means do it now.
            if id == me { goAgain(id, activity) }
            return
        }
        let taken = Set(people.filter { $0.key != id }.compactMap { $0.value.spot })
        let free = Self.spots.indices.filter { Self.spots[$0].uses.contains(activity) && !taken.contains($0) }
        guard let index = free.first(where: { Self.spots[$0].uses.first == activity }) ?? free.first else { return }
        leave(id)
        people[id]?.spot = index
        people[id]?.activity = activity
        walk(id, to: Self.spots[index].point, now: Self.now)
        if activity == .bong && id == me { wantsRip = id }
    }

    private func goAgain(_ id: Int, _ activity: Activity) {
        switch activity {
        case .bong: wantsRip = id
        case .keg: if people[id]?.spot == Self.kegSpots[0] { kegNext = 0 }
        default: break
        }
    }

    /// Stops whatever this person was doing.
    private func leave(_ id: Int) {
        if bongUser == id { bongUser = nil; bongNext = Self.now + 1 }
        if wantsRip == id { wantsRip = nil }
        if people[id]?.spot == Self.kegSpots[0] { kegStart = -100 }
        people[id]?.spot = nil
        people[id]?.activity = nil
    }

    private func walk(_ id: Int, to target: CGPoint, now: Double) {
        guard var person = people[id] else { return }
        let here = person.position(at: now)
        let distance = hypot(target.x - here.x, target.y - here.y)
        person.from = here
        person.to = target
        person.start = now
        person.duration = Double(distance / 150)
        person.nextDecision = now + person.duration + Double.random(in: 4...9)
        people[id] = person
    }

    private func after(_ delay: Double, _ action: @escaping () -> Void) {
        later.append((Self.now + delay, action))
    }

    /// Whoever has arrived at a spot.
    private func occupant(_ spot: Int, _ now: Double) -> Int? {
        people.first { $0.value.spot == spot && !$0.value.guest.dimmed && !$0.value.isWalking(at: now) }?.key
    }

    // MARK: The clock

    func tick() {
        let now = Self.now
        let due = later.filter { $0.0 <= now }
        later.removeAll { $0.0 <= now }
        due.forEach { $0.1() }
        balls.removeAll { now - $0.start > 2 }
        splashes.removeAll { now - $0.start > 0.6 }
        puffs.removeAll { now - $0.start > 4 }
        tickPong(now)
        tickFlip(now)
        tickKeg(now)
        tickBong(now)
        tickGames(now)
        bringCompany(now)
        decide(now)
    }

    // MARK: Beer pong

    private func tickPong(_ now: Double) {
        guard occupant(Self.pongSpots[0], now) != nil, occupant(Self.pongSpots[1], now) != nil,
              pongWinner == nil, now >= pongNext else { return }
        shoot(side: pongTurn, now: now)
    }

    private func shoot(side: Int, now: Double) {
        let target = 1 - side
        let open = pongCups[target].indices.filter { pongCups[target][$0] }
        guard let cup = open.randomElement(), let shooter = occupant(Self.pongSpots[side], now) else { return }
        people[shooter]?.actionStart = now
        let from = Self.spots[Self.pongSpots[side]].point
        let scale = Self.scale(at: from.y)
        let dir: CGFloat = side == 0 ? 1 : -1
        let hand = CGPoint(x: from.x + dir * 50 * scale, y: from.y - 210 * scale)
        let cupPoint = RoomArt.pongCup(side: target, index: cup)
        let hit = Double.random(in: 0...1) < 0.42
        let to = hit ? CGPoint(x: cupPoint.x, y: cupPoint.y - 15)
                     : CGPoint(x: cupPoint.x + CGFloat.random(in: -18...18), y: cupPoint.y - 20)
        let bounce = CGPoint(x: to.x + dir * CGFloat.random(in: 70...120), y: 640)
        balls.append(Ball(from: hand, to: to, start: now + 0.3, hit: hit, bounce: bounce))
        pongTurn = target
        pongNext = now + (hit ? 4 : 2.4)
        guard hit else { return }
        after(0.3 + Ball.flight) { [weak self] in self?.splashes.append(Splash(point: to, start: Self.now)) }
        after(1.7) { [weak self] in self?.pullCup(side: target, index: cup) }
    }

    /// The cup that got hit comes off the table and the defender drinks it.
    private func pullCup(side: Int, index: Int) {
        let now = Self.now
        pongCups[side][index] = false
        if let defender = occupant(Self.pongSpots[side], now) { people[defender]?.drinkStart = now }
        if !pongCups[side].contains(true) {
            pongWinner = 1 - side
            if let winner = occupant(Self.pongSpots[1 - side], now), winner == me { onFeat?(.pongWin) }
            after(5) { [weak self] in self?.rerack() }
        }
    }

    private func rerack() {
        pongCups = [[Bool]](repeating: [Bool](repeating: true, count: 6), count: 2)
        pongWinner = nil
        pongNext = Self.now + 1.5
    }

    // MARK: Flip cup

    private func tickFlip(_ now: Double) {
        let players = Self.flipSpots.map { occupant($0, now) }
        if !flipRacing {
            guard players.contains(where: { $0 != nil }), now >= flipNext else { return }
            flipRacing = true
            flipWinner = nil
            for lane in 0..<2 {
                flipLanes[lane] = FlipLane(stage: players[lane] == nil ? .ready : .drinking, start: now)
            }
            return
        }
        for lane in 0..<2 {
            var current = flipLanes[lane]
            if players[lane] == nil && current.stage != .landed { current.stage = .ready }
            switch current.stage {
            case .drinking where now - current.start >= Self.flipDrink:
                current = FlipLane(stage: .flipping, start: now, success: Double.random(in: 0...1) < 0.3)
            case .flipping where now - current.start >= Self.flipTry:
                if current.success {
                    current.stage = .landed
                    current.start = now
                    if flipWinner == nil && players[1 - lane] != nil {
                        flipWinner = lane
                        if players[lane] == me { onFeat?(.flipWin) }
                    }
                } else {
                    current.start = now
                    current.success = Double.random(in: 0...1) < 0.35
                }
            default:
                break
            }
            flipLanes[lane] = current
        }
        let stillGoing = flipLanes.contains { $0.stage == .drinking || $0.stage == .flipping }
        if flipWinner != nil || !stillGoing {
            flipRacing = false
            flipNext = now + 3.2
            after(3) { [weak self] in
                guard let self, !self.flipRacing else { return }
                self.flipLanes = [FlipLane(), FlipLane()]
                self.flipWinner = nil
            }
        }
    }

    /// The cup on the table for one side of flip cup: nil while it's in someone's hand.
    func flipCup(lane: Int, at t: Double) -> (angle: Double, lift: CGFloat, full: Bool)? {
        let state = flipLanes[lane]
        let elapsed = t - state.start
        switch state.stage {
        case .ready:
            return (0, 0, true)
        case .drinking:
            return elapsed < Self.flipDrink ? nil : (0, 0, false)
        case .landed:
            return (180, 0, false)
        case .flipping:
            let k = elapsed / Self.flipTry
            guard k > 0.35 else { return (0, 0, false) }
            if state.success {
                let e = min(1, (k - 0.35) / 0.4)
                return (180 * e, 46 * CGFloat(sin(.pi * e)), false)
            }
            let e = min(1, (k - 0.35) / 0.45)
            return (130 * sin(.pi * e), 34 * CGFloat(sin(.pi * e)), false)
        }
    }

    // MARK: Keg stands

    private func tickKeg(_ now: Double) {
        guard now - kegStart >= Self.kegLength else { return }
        // Whoever's waiting steps up to the keg.
        if occupant(Self.kegSpots[0], now) == nil, let waiting = occupant(Self.kegSpots[1], now) {
            people[waiting]?.spot = Self.kegSpots[0]
            walk(waiting, to: Self.spots[Self.kegSpots[0]].point, now: now)
            return
        }
        guard let doer = occupant(Self.kegSpots[0], now), now >= kegNext else { return }
        kegStart = now
        let holder = occupant(Self.kegSpots[1], now)
        after(Self.kegLength) { [weak self] in self?.kegDone(doer: doer, holder: holder) }
    }

    /// The friend who held your legs goes next.
    private func kegDone(doer: Int, holder: Int?) {
        let now = Self.now
        if doer == me, people[doer]?.spot == Self.kegSpots[0] { onFeat?(.kegStand) }
        kegNext = now + 2.5
        guard let holder, people[doer]?.spot == Self.kegSpots[0], people[holder]?.spot == Self.kegSpots[1] else { return }
        people[doer]?.spot = Self.kegSpots[1]
        people[holder]?.spot = Self.kegSpots[0]
        walk(doer, to: Self.spots[Self.kegSpots[1]].point, now: now)
        walk(holder, to: Self.spots[Self.kegSpots[0]].point, now: now)
    }

    /// How far over the person on the keg is: 0 standing, 1 upside down.
    static func kegFlip(_ seconds: Double) -> Double {
        switch seconds {
        case 0.6..<1.4: return smooth((seconds - 0.6) / 0.8)
        case 1.4..<5.6: return 1
        case 5.6..<6.3: return 1 - smooth((seconds - 5.6) / 0.7)
        default: return 0
        }
    }

    static func smooth(_ x: Double) -> Double { x * x * (3 - 2 * x) }

    // MARK: The bong

    private func tickBong(_ now: Double) {
        if let user = bongUser {
            if now - bongStart >= Self.ripLength || people[user]?.activity != .bong {
                if user == me && now - bongStart >= Self.ripLength { onFeat?(.bongRip) }
                bongUser = nil
                lastBongUser = user
                bongNext = now + 2.5
            }
            return
        }
        let seated = Self.spots.indices.filter { Self.spots[$0].uses.first == .bong }
            .compactMap { occupant($0, now) }
            .filter { people[$0]?.activity == .bong }
        guard !seated.isEmpty else { return }
        let pick: Int
        if let wanting = wantsRip, seated.contains(wanting) {
            pick = wanting
            wantsRip = nil
        } else {
            guard now >= bongNext else { return }
            pick = seated.first { $0 != lastBongUser } ?? seated[0]
        }
        bongUser = pick
        bongStart = now
        // The big exhale after holding it in
        after(0.8 * Self.ripLength) { [weak self] in
            guard let self, self.bongUser == pick, let seat = self.people[pick]?.to else { return }
            let scale = Self.scale(at: seat.y)
            self.puffs.append(Puff(origin: CGPoint(x: seat.x + 4 * scale, y: seat.y - 188 * scale), start: Self.now, size: 1.7))
        }
    }

    /// A video game match ends every so often while people are playing; someone on the couch wins it.
    private func tickGames(_ now: Double) {
        let playing = people.filter { $0.value.activity == .games && $0.value.spot != nil && !$0.value.isWalking(at: now) }.map(\.key)
        guard !playing.isEmpty else { matchEnd = now + 30; return }
        guard now >= matchEnd else { return }
        matchEnd = now + Double.random(in: 25...40)
        // Playing alone means playing the computer
        let winner = playing.count == 1 ? (Bool.random() ? playing[0] : nil) : playing.randomElement()
        if let winner {
            gameWinner = (winner, now)
            if winner == me { onFeat?(.gameWin) }
        }
    }

    /// Who won the last video game match, and when, for a little celebration.
    private(set) var gameWinner: (id: Int, time: Double)?

    /// How many people are sitting down to play on the TV.
    func gamers(at t: Double) -> Int {
        people.values.filter { $0.activity == .games && $0.spot != nil && !$0.isWalking(at: t) && !$0.guest.dimmed }.count
    }

    /// Whether the bong is sitting on the coffee table right now.
    func bongOnTable(at t: Double) -> Bool {
        guard bongUser != nil else { return true }
        let k = (t - bongStart) / Self.ripLength
        return k < 0.06 || k > 0.72
    }

    // MARK: Everyone else

    /// Someone to play with when you walk up to the pong table, flip cup or the keg alone.
    private func bringCompany(_ now: Double) {
        guard let me, now - lastCompany > 4, let mine = people[me], let spot = mine.spot, !mine.isWalking(at: now) else { return }
        let group: [Int]
        switch mine.activity {
        case .pong?: group = Self.pongSpots
        case .flip?: group = Self.flipSpots
        case .keg?: group = Self.kegSpots
        default: return
        }
        guard group.contains(spot), !people.contains(where: { $0.key != me && $0.value.spot.map(group.contains) == true }) else { return }
        let free = people.filter { $0.key != me && !$0.value.guest.dimmed && !busy($0.key, now) }.map(\.key)
        guard let friend = free.randomElement(), let activity = mine.activity else { return }
        lastCompany = now
        go(friend, to: activity)
    }

    /// In the middle of a game or a turn, so they stay put.
    private func busy(_ id: Int, _ now: Double) -> Bool {
        guard let spot = people[id]?.spot else { return false }
        if bongUser == id { return true }
        if Self.kegSpots.contains(spot) && now - kegStart < Self.kegLength { return true }
        if Self.flipSpots.contains(spot) && flipRacing { return true }
        if Self.pongSpots.contains(spot) && pongWinner == nil && pongCups.allSatisfy({ $0.contains(true) })
            && Self.pongSpots.allSatisfy({ occupant($0, now) != nil }) { return true }
        return false
    }

    private func decide(_ now: Double) {
        for (id, person) in people where id != me && !person.guest.dimmed {
            guard now > person.nextDecision, !person.isWalking(at: now), !busy(id, now) else { continue }
            people[id]?.nextDecision = now + 3
            if person.spot != nil && Double.random(in: 0...1) < 0.5 {
                people[id]?.nextDecision = now + Double.random(in: 5...10)
                continue
            }
            if Double.random(in: 0...1) < 0.75, let activity = Activity.allCases.randomElement() {
                go(id, to: activity)
            } else {
                leave(id)
                walk(id, to: CGPoint(x: CGFloat.random(in: 60...940), y: CGFloat.random(in: 505...620)), now: now)
            }
        }
    }

    /// People get bigger as they come toward the front of the room.
    static func scale(at y: CGFloat) -> CGFloat {
        0.5 + (y - floorTop) / (size.height - floorTop) * 0.26
    }

    func pose(for person: Person, at t: Double) -> CartoonPerson.Pose {
        if person.isWalking(at: t) { return .walk((t - person.start) * 9) }
        let id = person.guest.id
        if t - person.drinkStart >= 0, t - person.drinkStart < Self.drinkLength {
            return .drink((t - person.drinkStart) / Self.drinkLength)
        }
        if let spot = person.spot, let activity = person.activity {
            switch activity {
            case .games:
                if let won = gameWinner, won.id == id, t - won.time < 2.5 { return .cheer(t + person.seed) }
                return .game
            case .couch:
                return .sit
            case .bong:
                let k = (t - bongStart) / Self.ripLength
                return bongUser == id && k >= 0 && k <= 1 ? .bong(k) : .sit
            case .pong:
                let side = Self.pongSpots.firstIndex(of: spot) ?? 0
                if pongWinner == side { return .cheer(t + person.seed) }
                let k = (t - person.actionStart) / 0.8
                return k >= 0 && k <= 1 ? .pongThrow(k, side == 0 ? 1 : -1) : .stand
            case .flip:
                let lane = Self.flipSpots.firstIndex(of: spot) ?? 0
                let state = flipLanes[lane]
                let elapsed = t - state.start
                switch state.stage {
                case .drinking where elapsed < Self.flipDrink: return .drink(elapsed / Self.flipDrink)
                case .flipping where elapsed < Self.flipTry: return .flick(elapsed / Self.flipTry, lane == 0 ? 1 : -1)
                case .landed where flipWinner == lane && elapsed < 2.8: return .cheer(t + person.seed)
                default: return .stand
                }
            case .keg:
                let seconds = t - kegStart
                guard seconds >= 0, seconds < Self.kegLength else { return .stand }
                if spot == Self.kegSpots[0] { return .kegStand(seconds) }
                return seconds > 0.6 && seconds < 6.3 ? .holdLegs : .stand
            }
        }
        if person.guest.highlighted {
            let k = (t + person.seed).truncatingRemainder(dividingBy: 4)
            if k < 1 { return .wave(k) }
        }
        return .stand
    }
}
