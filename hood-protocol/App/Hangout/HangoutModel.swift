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
    case games, pong, bong, couch

    var title: String {
        switch self {
        case .games: return "Video games"
        case .pong: return "Beer pong"
        case .bong: return "Bong rip"
        case .couch: return "Couch"
        }
    }

    var symbol: String {
        switch self {
        case .games: return "gamecontroller.fill"
        case .pong: return "circle.grid.cross.fill"
        case .bong: return "smoke.fill"
        case .couch: return "sofa.fill"
        }
    }
}

/// Where everyone is and what they're doing. Positions are worked out from the time,
/// so the view can draw any frame without changing state. Your own character goes where you tap;
/// everyone else picks things to do on their own.
final class HangoutModel: ObservableObject {
    /// The room is drawn in a 1000 x 640 space.
    static let size = CGSize(width: 1000, height: 640)
    static let floorTop: CGFloat = 430
    static let door = CGPoint(x: 945, y: 440)

    struct Spot {
        var activity: Activity
        var point: CGPoint
    }

    static let spots: [Spot] = [
        Spot(activity: .games, point: CGPoint(x: 150, y: 560)),
        Spot(activity: .games, point: CGPoint(x: 262, y: 590)),
        Spot(activity: .couch, point: CGPoint(x: 445, y: 482)),
        Spot(activity: .couch, point: CGPoint(x: 530, y: 482)),
        Spot(activity: .couch, point: CGPoint(x: 615, y: 482)),
        Spot(activity: .bong, point: CGPoint(x: 410, y: 612)),
        Spot(activity: .bong, point: CGPoint(x: 670, y: 612)),
        Spot(activity: .pong, point: CGPoint(x: 712, y: 590)),
        Spot(activity: .pong, point: CGPoint(x: 955, y: 590)),
    ]

    /// Tap areas for each activity, in room space.
    static func hotspot(_ activity: Activity) -> CGRect {
        switch activity {
        case .games: return CGRect(x: 20, y: 180, width: 320, height: 450)
        case .couch: return CGRect(x: 350, y: 330, width: 360, height: 160)
        case .bong: return CGRect(x: 390, y: 495, width: 300, height: 140)
        case .pong: return CGRect(x: 700, y: 450, width: 300, height: 180)
        }
    }

    struct Person {
        var guest: HangoutGuest
        var from: CGPoint
        var to: CGPoint
        var start: Double
        var duration: Double
        var spot: Int?
        var nextDecision: Double
        var actionStart: Double = -100
        let seed = Double.random(in: 0...10)

        func position(at t: Double) -> CGPoint {
            guard duration > 0, t < start + duration else { return to }
            let k = max(0, (t - start) / duration)
            return CGPoint(x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k)
        }

        func isWalking(at t: Double) -> Bool { t >= start && t < start + duration }
    }

    struct Ball {
        var from: CGPoint
        var to: CGPoint
        var start: Double
    }

    struct Puff {
        var origin: CGPoint
        var start: Double
    }

    private(set) var people: [Int: Person] = [:]
    private(set) var balls: [Ball] = []
    private(set) var puffs: [Puff] = []
    var me: Int?

    static var now: Double { Date().timeIntervalSinceReferenceDate }

    private var timer: Timer?

    init() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in self?.tick() }
    }

    deinit { timer?.invalidate() }

    // MARK: Updates from the game

    func update(guests: [HangoutGuest], me: Int?) {
        self.me = me
        let now = Self.now
        let ids = Set(guests.map(\.id))
        people = people.filter { ids.contains($0.key) }
        for (index, guest) in guests.enumerated() {
            if var person = people[guest.id] {
                let wasDimmed = person.guest.dimmed
                person.guest = guest
                people[guest.id] = person
                if guest.dimmed && !wasDimmed {
                    walk(guest.id, to: Self.door, now: now)
                    people[guest.id]?.spot = nil
                }
            } else {
                let start = Self.startPoint(index)
                people[guest.id] = Person(guest: guest, from: start, to: start, start: now, duration: 0, spot: nil,
                                          nextDecision: now + Double.random(in: 0.3...2.5))
            }
        }
    }

    private static func startPoint(_ index: Int) -> CGPoint {
        let points: [CGPoint] = [CGPoint(x: 520, y: 560), CGPoint(x: 360, y: 540), CGPoint(x: 680, y: 545), CGPoint(x: 440, y: 600),
                                 CGPoint(x: 600, y: 610), CGPoint(x: 300, y: 500), CGPoint(x: 760, y: 520), CGPoint(x: 220, y: 610),
                                 CGPoint(x: 840, y: 600), CGPoint(x: 120, y: 480)]
        return points[index % points.count]
    }

    // MARK: Moving

    /// You tapped the room: go do that activity, or walk to that spot on the floor.
    func tap(_ point: CGPoint) {
        guard let me, people[me]?.guest.dimmed == false else { return }
        for activity in Activity.allCases where Self.hotspot(activity).contains(point) {
            go(me, to: activity)
            return
        }
        let floor = CGPoint(x: min(max(point.x, 40), 960), y: min(max(point.y, 495), 625))
        if point.y >= Self.floorTop - 40 {
            people[me]?.spot = nil
            walk(me, to: floor, now: Self.now)
        }
    }

    func go(_ id: Int, to activity: Activity) {
        let taken = Set(people.values.compactMap { $0.key(excluding: id) })
        guard let index = Self.spots.indices.first(where: { Self.spots[$0].activity == activity && !taken.contains($0) })
                ?? Self.spots.indices.first(where: { Self.spots[$0].activity == activity && people[id]?.spot == $0 }) else { return }
        people[id]?.spot = index
        walk(id, to: Self.spots[index].point, now: Self.now)
        people[id]?.actionStart = Self.now + 1
    }

    private func walk(_ id: Int, to target: CGPoint, now: Double) {
        guard var person = people[id] else { return }
        let here = person.position(at: now)
        let distance = hypot(target.x - here.x, target.y - here.y)
        person.from = here
        person.to = target
        person.start = now
        person.duration = Double(distance / 150)
        person.nextDecision = now + person.duration + Double.random(in: 3...8)
        people[id] = person
    }

    // MARK: Everyone else

    /// Called about once a second: bots and other players pick something to do, and people at
    /// the beer pong table or the bong take their turns.
    func tick() {
        let now = Self.now
        balls.removeAll { now - $0.start > 1.6 }
        puffs.removeAll { now - $0.start > 3 }
        for (id, person) in people {
            guard !person.guest.dimmed else { continue }
            let walking = person.isWalking(at: now)
            if let spot = person.spot, !walking {
                switch Self.spots[spot].activity {
                case .pong where now - person.actionStart > 2.2 && Double.random(in: 0...1) < 0.5:
                    shoot(id, spot: spot, now: now)
                case .bong where now - person.actionStart > 5 && Double.random(in: 0...1) < 0.3:
                    people[id]?.actionStart = now
                    let origin = person.to
                    let scale = Self.scale(at: origin.y)
                    puffs.append(Puff(origin: CGPoint(x: origin.x + 8 * scale, y: origin.y - 160 * scale + 34 * scale), start: now + 1.1))
                default:
                    break
                }
            }
            guard id != me, now > person.nextDecision, !walking else { continue }
            if person.spot != nil && Double.random(in: 0...1) < 0.5 {
                people[id]?.nextDecision = now + Double.random(in: 4...9)
                continue
            }
            if Double.random(in: 0...1) < 0.65, let activity = Activity.allCases.randomElement() {
                go(id, to: activity)
                if people[id]?.spot == person.spot { people[id]?.nextDecision = now + 3 }
            } else {
                people[id]?.spot = nil
                walk(id, to: CGPoint(x: CGFloat.random(in: 60...940), y: CGFloat.random(in: 500...620)), now: now)
            }
        }
    }

    private func shoot(_ id: Int, spot: Int, now: Double) {
        people[id]?.actionStart = now
        let from = Self.spots[spot].point
        let scale = Self.scale(at: from.y)
        let hand = CGPoint(x: from.x + 60 * scale, y: from.y - 200 * scale)
        let towardRight = from.x < 800
        let to = CGPoint(x: towardRight ? CGFloat.random(in: 905...945) : CGFloat.random(in: 745...785), y: 462)
        balls.append(Ball(from: hand, to: to, start: now + 0.3))
    }

    /// People get bigger as they come toward the front of the room.
    static func scale(at y: CGFloat) -> CGFloat {
        0.5 + (y - floorTop) / (size.height - floorTop) * 0.26
    }

    func pose(for person: Person, at t: Double) -> CartoonPerson.Pose {
        if person.isWalking(at: t) { return .walk((t - person.start) * 9) }
        if let spot = person.spot {
            switch Self.spots[spot].activity {
            case .games: return .game
            case .couch: return .sit
            case .pong:
                let k = (t - person.actionStart) / 0.8
                return k >= 0 && k <= 1 ? .pongThrow(k) : .stand
            case .bong:
                let k = (t - person.actionStart) / 2.4
                return k >= 0 && k <= 1 ? .bong(k) : .sit
            }
        }
        if person.guest.highlighted {
            let k = (t + person.seed).truncatingRemainder(dividingBy: 4)
            if k < 1 { return .wave(k) }
        }
        return .stand
    }
}

private extension HangoutModel.Person {
    func key(excluding id: Int) -> Int? { guest.id == id ? nil : spot }
}
