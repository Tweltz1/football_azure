import SceneKit
import UIKit

/// One person in the 3D basement.
struct Guest3D: Equatable {
    var id: Int
    var look: Look
    var name: String
    var badge: String? = nil
    var dimmed = false
    var highlighted = false
}

/// The Hood cave: a lit-up basement with a big window where the sky goes from sunset to night to
/// sunrise, a wall clock, a couch, a video game corner and a beer pong table. People wander between
/// them on their own.
final class BasementWorld {
    let scene = SCNScene()
    let camera = SCNNode()

    private enum Pose { case sit, game, pong }

    /// A place to hang out: where to stand, which way to face, and what to do there.
    private struct Spot {
        var position: SCNVector3
        var facing: Float
        var pose: Pose
        var approach: SCNVector3
    }

    private var people: [Int: CharacterNode] = [:]
    private var guests: [Int: Guest3D] = [:]
    private var busyUntil: [Int: Date] = [:]
    private var spotOf: [Int: Int] = [:]
    private var throwing: Set<Int> = []
    private var timer: Timer?
    private var night: Double = -1

    private let ambient = SCNNode()
    private let ceiling = SCNNode()
    private let lamp = SCNNode()
    private let tvLight = SCNNode()
    private let daylight = SCNNode()
    private let skyMaterial = SCNMaterial()
    private let celestial = SCNNode()
    private let stars = SCNNode()
    private let hourHand = SCNNode()
    private let minuteHand = SCNNode()
    private let tvScreen = SCNMaterial()

    private static let floorX: ClosedRange<Float> = -3.2...3.2
    private static let floorZ: ClosedRange<Float> = -1.0...2.7
    private static let doorSpot = SCNVector3(3.0, 0, -1.7)
    /// The beer pong table runs front to back on the right side of the room.
    private static let pongX: Float = 2.3
    private static let pongZ: ClosedRange<Float> = 0.2...2.4

    private let spots: [Spot] = [
        // Couch along the back wall
        Spot(position: SCNVector3(-0.85, 0, -1.95), facing: 0, pose: .sit, approach: SCNVector3(-0.85, 0, -1.25)),
        Spot(position: SCNVector3(0, 0, -1.95), facing: 0, pose: .sit, approach: SCNVector3(0, 0, -1.25)),
        Spot(position: SCNVector3(0.85, 0, -1.95), facing: 0, pose: .sit, approach: SCNVector3(0.85, 0, -1.25)),
        // Beanbags in front of the TV on the left wall
        Spot(position: SCNVector3(-2.75, 0, -0.75), facing: -Float.pi / 2, pose: .game, approach: SCNVector3(-2.1, 0, -0.75)),
        Spot(position: SCNVector3(-2.75, 0, 0.45), facing: -Float.pi / 2, pose: .game, approach: SCNVector3(-2.1, 0, 0.45)),
        // Beer pong, one at each end
        Spot(position: SCNVector3(BasementWorld.pongX, 0, -0.3), facing: 0, pose: .pong, approach: SCNVector3(1.5, 0, -0.3)),
        Spot(position: SCNVector3(BasementWorld.pongX, 0, 2.9), facing: Float.pi, pose: .pong, approach: SCNVector3(1.5, 0, 2.9)),
    ]

    init() {
        buildRoom()
        setNight(0)
        timer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in self?.tick() }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    deinit { timer?.invalidate() }

    // MARK: Updates from the game

    func update(guests list: [Guest3D], night: Double) {
        setNight(night)
        let ids = Set(list.map(\.id))
        for (id, node) in people where !ids.contains(id) {
            node.removeFromParentNode()
            people[id] = nil
            guests[id] = nil
            spotOf[id] = nil
        }
        for (index, guest) in list.enumerated() {
            let previous = guests[guest.id]
            var existing = people[guest.id]
            if existing == nil || previous?.look != guest.look {
                let position = existing?.position ?? spawnPoint(index)
                existing?.removeFromParentNode()
                let made = CharacterNode(look: guest.look)
                made.position = SCNVector3(position.x, 0, position.z)
                made.eulerAngles.y = Float.random(in: -0.6...0.6)
                scene.rootNode.addChildNode(made)
                people[guest.id] = made
                spotOf[guest.id] = nil
                busyUntil[guest.id] = Date().addingTimeInterval(Double.random(in: 0.3...2.5))
                existing = made
            }
            guard let node = existing else { continue }
            node.setLabel(guest.name, badge: guest.badge)
            node.setHighlighted(guest.highlighted)
            node.setDimmed(guest.dimmed)
            if guest.highlighted && previous?.highlighted != true && !guest.dimmed && spotOf[guest.id] == nil {
                node.wave()
            }
            if guest.dimmed && previous?.dimmed != true {
                // Kicked out: get up, walk over to the stairs and hang back.
                leaveSpot(guest.id)
                walk(guest.id, to: Self.doorSpot)
            }
            guests[guest.id] = guest
        }
    }

    private func spawnPoint(_ index: Int) -> SCNVector3 {
        let points: [(Float, Float)] = [(-0.9, 0.9), (0.9, 0.8), (-0.2, 1.9), (1.0, 2.2), (-1.8, 1.6),
                                        (0.3, 0.6), (-2.6, 2.3), (-1.2, 2.5), (0.2, 2.6), (-3.0, -0.6)]
        let point = points[index % points.count]
        return SCNVector3(point.0, 0, point.1)
    }

    // MARK: Hanging out

    private func tick() {
        let now = Date()
        for (id, node) in people {
            guard let guest = guests[id], !guest.dimmed else { continue }
            // Beer pong players keep shooting while they're at the table.
            if let spot = spotOf[id], spots[spot].pose == .pong, !throwing.contains(id), Int.random(in: 0..<3) == 0 {
                shoot(id, node: node, from: spot)
            }
            guard (busyUntil[id] ?? .distantPast) < now, Int.random(in: 0..<3) == 0 else { continue }
            if spotOf[id] != nil {
                if Double.random(in: 0...1) < 0.4 {
                    leaveSpot(id)
                } else {
                    busyUntil[id] = now.addingTimeInterval(Double.random(in: 3...8))
                }
                continue
            }
            let taken = Set(spotOf.values)
            let free = spots.indices.filter { !taken.contains($0) }
            if let spot = free.randomElement(), Double.random(in: 0...1) < 0.55 {
                go(id, to: spot)
            } else {
                walk(id, to: randomFloorPoint())
            }
        }
    }

    private func randomFloorPoint() -> SCNVector3 {
        for _ in 0..<12 {
            let x = Float.random(in: Self.floorX)
            let z = Float.random(in: Self.floorZ)
            if abs(x) < 1.2 && z > -1.1 && z < 0.2 { continue }                      // coffee table
            if x > Self.pongX - 0.7 && x < Self.pongX + 0.7 && z > -0.1 && z < 2.7 { continue }  // pong table
            if x < -2.2 && z > -1.3 && z < 1.0 { continue }                           // beanbags and TV
            return SCNVector3(x, 0, z)
        }
        return SCNVector3(-0.5, 0, 1.6)
    }

    private func walk(_ id: Int, to target: SCNVector3, delay: TimeInterval = 0, then finish: SCNAction? = nil, stay: ClosedRange<Double> = 2...7) {
        guard let node = people[id] else { return }
        let start = node.position
        let dx = target.x - start.x, dz = target.z - start.z
        let distance = sqrt(dx * dx + dz * dz)
        let duration = TimeInterval(distance / 0.9)
        var steps: [SCNAction] = []
        if delay > 0 { steps.append(.wait(duration: delay)) }
        if distance > 0.05 {
            steps += [
                .rotateTo(x: 0, y: CGFloat(atan2(dx, dz)), z: 0, duration: 0.25, usesShortestUnitArc: true),
                .run { node in (node as? CharacterNode)?.startWalking() },
                .move(to: SCNVector3(target.x, 0, target.z), duration: duration),
                .run { node in (node as? CharacterNode)?.stopWalking() }
            ]
        }
        if let finish {
            steps.append(finish)
        } else {
            steps.append(.rotateTo(x: 0, y: CGFloat(Float.random(in: -0.5...0.5)), z: 0, duration: 0.4, usesShortestUnitArc: true))
        }
        node.removeAction(forKey: "go")
        node.runAction(.sequence(steps), forKey: "go")
        busyUntil[id] = Date().addingTimeInterval(delay + duration + 0.8 + Double.random(in: stay))
    }

    private func go(_ id: Int, to index: Int) {
        let spot = spots[index]
        spotOf[id] = index
        let settle: SCNAction
        switch spot.pose {
        case .sit:
            settle = .sequence([
                .rotateTo(x: 0, y: CGFloat(spot.facing), z: 0, duration: 0.3, usesShortestUnitArc: true),
                .run { node in (node as? CharacterNode)?.sit() },
                .move(to: spot.position, duration: 0.35)
            ])
        case .game:
            settle = .sequence([
                .move(to: spot.position, duration: 0.5),
                .rotateTo(x: 0, y: CGFloat(spot.facing), z: 0, duration: 0.3, usesShortestUnitArc: true),
                .run { node in (node as? CharacterNode)?.playVideoGames() }
            ])
        case .pong:
            settle = .sequence([
                .move(to: spot.position, duration: 0.5),
                .rotateTo(x: 0, y: CGFloat(spot.facing), z: 0, duration: 0.3, usesShortestUnitArc: true)
            ])
        }
        walk(id, to: spot.approach, then: settle, stay: 6...14)
    }

    private func leaveSpot(_ id: Int) {
        guard let index = spotOf[id], let node = people[id] else { return }
        spotOf[id] = nil
        throwing.remove(id)
        node.relax()
        walk(id, to: spots[index].approach, delay: 0.35)
    }

    /// Shoots a ping pong ball from one end of the table to the cups at the other.
    private func shoot(_ id: Int, node: CharacterNode, from spot: Int) {
        guard node.action(forKey: "go") == nil else { return }
        throwing.insert(id)
        let towardBack = spots[spot].facing == 0
        node.throwBall { [weak self, weak node] in
            guard let self, let node else { return }
            let start = node.handPosition
            let endZ: Float = towardBack ? Self.pongZ.upperBound - 0.25 : Self.pongZ.lowerBound + 0.25
            let end = SCNVector3(Self.pongX + Float.random(in: -0.12...0.12), 0.86, endZ + Float.random(in: -0.12...0.12))
            let ball = SCNNode(geometry: SCNSphere(radius: 0.04))
            ball.geometry?.firstMaterial = CharacterNode.material(.white, emission: UIColor(white: 0.3, alpha: 1))
            ball.position = start
            self.scene.rootNode.addChildNode(ball)
            let mid = SCNVector3((start.x + end.x) / 2, max(start.y, end.y) + 0.7, (start.z + end.z) / 2)
            let flight = 0.75
            let up = SCNAction.move(to: mid, duration: flight / 2)
            up.timingMode = .easeOut
            let down = SCNAction.move(to: end, duration: flight / 2)
            down.timingMode = .easeIn
            ball.runAction(.sequence([up, down, .moveBy(x: 0, y: 0.08, z: 0, duration: 0.12),
                                      .moveBy(x: 0, y: -0.08, z: 0, duration: 0.12), .fadeOut(duration: 0.3), .removeFromParentNode()]))
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.throwing.remove(id) }
        }
    }

    // MARK: Night

    /// 0 is 8 PM with the sun going down in the window, 0.5 is the middle of the night, 1 is sunrise.
    private func setNight(_ value: Double) {
        let value = max(0, min(1, value))
        guard abs(value - night) > 0.001 else { return }
        night = value
        let dark = value < 0.85 ? min(1, value / 0.4) : max(0, 1 - (value - 0.85) / 0.15)

        SCNTransaction.begin()
        SCNTransaction.animationDuration = 1.5
        ambient.light?.intensity = CGFloat(950 - 400 * dark)
        ceiling.light?.intensity = CGFloat(1300 - 300 * dark)
        lamp.light?.intensity = CGFloat(500 + 500 * dark)
        tvLight.light?.intensity = CGFloat(300 + 500 * dark)
        daylight.light?.intensity = CGFloat(700 * (1 - dark))
        daylight.light?.color = value > 0.5 ? UIColor(red: 1, green: 0.85, blue: 0.7, alpha: 1) : UIColor(red: 1, green: 0.6, blue: 0.35, alpha: 1)
        skyMaterial.emission.contents = Self.sky(value)
        skyMaterial.diffuse.contents = Self.sky(value)
        stars.opacity = CGFloat(dark)

        // Sun setting at the start, the moon crossing during the night, the sun coming up at the end.
        let disc = celestial.geometry?.firstMaterial
        if value < 0.12 {
            let k = Float(value / 0.12)
            celestial.position = SCNVector3(2.25 + 0.15 * k, 2.0 - 0.3 * k, -2.47)
            disc?.emission.contents = UIColor(red: 1, green: 0.55, blue: 0.2, alpha: 1)
            celestial.opacity = CGFloat(1 - k)
        } else if value < 0.85 {
            let k = Float((value - 0.12) / 0.73)
            celestial.position = SCNVector3(0.55 + 1.75 * k, 2.25 + 0.3 * sin(Float.pi * k), -2.47)
            disc?.emission.contents = UIColor(red: 0.95, green: 0.95, blue: 0.85, alpha: 1)
            celestial.opacity = 1
        } else {
            let k = Float((value - 0.85) / 0.15)
            celestial.position = SCNVector3(0.5 + 0.3 * k, 1.75 + 0.35 * k, -2.47)
            disc?.emission.contents = UIColor(red: 1, green: 0.8, blue: 0.4, alpha: 1)
            celestial.opacity = CGFloat(k)
        }

        // Wall clock: 8:00 PM at the start, close to 6 AM at sunrise.
        let minutes = 20 * 60 + value * 9.7 * 60
        let hour = minutes / 60
        hourHand.eulerAngles.z = -Float(hour.truncatingRemainder(dividingBy: 12) / 12 * 2 * .pi)
        minuteHand.eulerAngles.z = -Float(minutes / 60 * 2 * .pi)
        SCNTransaction.commit()
    }

    private static func sky(_ t: Double) -> UIColor {
        let dusk = (r: 0.98, g: 0.6, b: 0.38), midnight = (r: 0.06, g: 0.09, b: 0.24), dawn = (r: 0.62, g: 0.78, b: 1.0)
        func mix(_ a: (r: Double, g: Double, b: Double), _ b: (r: Double, g: Double, b: Double), _ k: Double) -> UIColor {
            let k = max(0, min(1, k))
            return UIColor(red: a.r + (b.r - a.r) * k, green: a.g + (b.g - a.g) * k, blue: a.b + (b.b - a.b) * k, alpha: 1)
        }
        return t < 0.85 ? mix(dusk, midnight, t / 0.4) : mix(midnight, dawn, (t - 0.85) / 0.15)
    }

    // MARK: Room

    private func buildRoom() {
        let root = scene.rootNode
        scene.background.contents = UIColor(hex: 0x15161C)

        // Camera: a little above and in front, looking down into the room.
        let cam = SCNCamera()
        cam.fieldOfView = 48
        cam.zNear = 0.1
        cam.zFar = 60
        cam.wantsHDR = true
        cam.bloomIntensity = 0.35
        cam.bloomThreshold = 0.9
        cam.exposureOffset = 0.2
        camera.camera = cam
        camera.position = SCNVector3(0, 4.4, 7.4)
        camera.look(at: SCNVector3(0, 0.8, -0.2))
        root.addChildNode(camera)
        camera.runAction(.repeatForever(.sequence([
            .moveBy(x: 0.45, y: 0, z: 0, duration: 9),
            .moveBy(x: -0.45, y: 0, z: 0, duration: 9)
        ])))

        // Floor, rug and walls in warm, light colors
        let wall = UIColor(hex: 0xB58C64)
        root.addChildNode(slab(9, 0.1, 7.5, color: UIColor(hex: 0x666C7A), at: SCNVector3(0, -0.05, 0.5)))
        let rug = SCNCylinder(radius: 1.8, height: 0.02)
        rug.firstMaterial = CharacterNode.material(UIColor(hex: 0x8B6CFF).darker(0.25))
        let rugNode = SCNNode(geometry: rug)
        rugNode.position = SCNVector3(-0.3, 0.01, 0.4)
        rugNode.scale = SCNVector3(1.2, 1, 0.8)
        root.addChildNode(rugNode)
        root.addChildNode(slab(9, 3.4, 0.2, color: wall, at: SCNVector3(0, 1.7, -2.6)))
        root.addChildNode(slab(0.2, 3.4, 7.5, color: wall.darker(0.04), at: SCNVector3(-4.4, 1.7, 0.5)))
        root.addChildNode(slab(0.2, 3.4, 7.5, color: wall.darker(0.04), at: SCNVector3(4.4, 1.7, 0.5)))
        root.addChildNode(slab(9, 0.15, 0.05, color: UIColor(hex: 0x5A4030), at: SCNVector3(0, 0.08, -2.48)))
        // Purple LED strip along the top of the walls, Hood League colors
        let led = UIColor(hex: 0x8B6CFF)
        root.addChildNode(slab(9, 0.05, 0.05, color: led, at: SCNVector3(0, 3.3, -2.47), emission: led))
        root.addChildNode(slab(0.05, 0.05, 7.5, color: led, at: SCNVector3(-4.27, 3.3, 0.5), emission: led))

        buildWindow(root)
        buildClock(root)

        // Posters
        for (x, color) in [(-3.5, 0x8B6CFF), (-2.5, 0x3DDC97)] as [(Float, UInt32)] {
            let poster = SCNNode(geometry: SCNPlane(width: 0.7, height: 0.95))
            poster.geometry?.firstMaterial = CharacterNode.material(UIColor(hex: color).darker(0.2))
            poster.position = SCNVector3(x, 1.9, -2.49)
            poster.eulerAngles.z = Float.random(in: -0.05...0.05)
            root.addChildNode(poster)
            let stripe = SCNNode(geometry: SCNPlane(width: 0.5, height: 0.12))
            stripe.geometry?.firstMaterial = CharacterNode.material(UIColor(hex: color), emission: UIColor(hex: color).darker(0.4))
            stripe.position = SCNVector3(0, 0.22, 0.005)
            poster.addChildNode(stripe)
        }

        // String lights along the back wall
        let bulbColors: [UInt32] = [0xFF6B6B, 0xF5B84A, 0x3DDC97, 0x2F80ED, 0xFF8BD0]
        for i in 0..<22 {
            let bulb = SCNSphere(radius: 0.045)
            let color = UIColor(hex: bulbColors[i % bulbColors.count])
            bulb.firstMaterial = CharacterNode.material(color, emission: color)
            let node = SCNNode(geometry: bulb)
            node.position = SCNVector3(-4.0 + Float(i) * 0.38, 3.12 - 0.08 * abs(sin(Float(i) * 0.8)), -2.42)
            root.addChildNode(node)
            node.runAction(.repeatForever(.sequence([
                .wait(duration: Double(i % 5) * 0.3),
                .fadeOpacity(to: 0.6, duration: 0.9),
                .fadeOpacity(to: 1, duration: 0.9)
            ])))
        }

        buildCouch(root)
        buildGameCorner(root)
        buildBeerPong(root)

        // Mini fridge and the stairs up (where people who get kicked out end up)
        root.addChildNode(slab(0.6, 0.85, 0.6, color: UIColor(hex: 0xE6E6E6), at: SCNVector3(-1.9, 0.43, -2.15), chamfer: 0.04))
        for step in 0..<6 {
            let y = Float(step) * 0.28
            root.addChildNode(slab(1.1, 0.28, 0.4, color: UIColor(hex: 0x7A5A40), at: SCNVector3(3.75, y + 0.14, -1.0 - Float(step) * 0.3)))
        }

        // Lamp in the corner
        root.addChildNode(slab(0.06, 1.6, 0.06, color: UIColor(hex: 0x222222), at: SCNVector3(-1.5, 0.8, -2.3)))
        let shade = SCNCone(topRadius: 0.16, bottomRadius: 0.3, height: 0.36)
        shade.firstMaterial = CharacterNode.material(UIColor(hex: 0xF2D9A0), emission: UIColor(hex: 0xC9A468))
        let shadeNode = SCNNode(geometry: shade)
        shadeNode.position = SCNVector3(-1.5, 1.7, -2.3)
        root.addChildNode(shadeNode)

        buildLights(root)
    }

    private func buildWindow(_ root: SCNNode) {
        // A big window on the back wall: the sky, the sun or moon, and stars.
        let center = SCNVector3(1.4, 2.25, -2.49)
        skyMaterial.lightingModel = .constant
        let sky = SCNNode(geometry: SCNPlane(width: 2.4, height: 1.1))
        sky.geometry?.firstMaterial = skyMaterial
        sky.position = center
        root.addChildNode(sky)

        let disc = SCNSphere(radius: 0.13)
        let discMaterial = SCNMaterial()
        discMaterial.lightingModel = .constant
        discMaterial.diffuse.contents = UIColor.black
        disc.firstMaterial = discMaterial
        celestial.geometry = disc
        celestial.scale = SCNVector3(1, 1, 0.1)
        root.addChildNode(celestial)

        stars.position = SCNVector3(0, 0, 0)
        for (x, y) in [(0.45, 2.65), (0.8, 2.4), (1.1, 2.7), (1.5, 2.5), (1.85, 2.72), (2.1, 2.35), (2.45, 2.6), (0.6, 2.05)] as [(Float, Float)] {
            let star = SCNSphere(radius: 0.018)
            star.firstMaterial = CharacterNode.material(.white, emission: .white)
            let node = SCNNode(geometry: star)
            node.position = SCNVector3(x, y, -2.48)
            node.scale = SCNVector3(1, 1, 0.2)
            stars.addChildNode(node)
            node.runAction(.repeatForever(.sequence([.fadeOpacity(to: 0.4, duration: Double.random(in: 0.6...1.4)), .fadeOpacity(to: 1, duration: 0.8)])))
        }
        root.addChildNode(stars)

        // Frame and panes
        let frame = UIColor(hex: 0xF4F1EA)
        root.addChildNode(slab(2.6, 0.1, 0.1, color: frame, at: SCNVector3(center.x, center.y + 0.6, -2.45)))
        root.addChildNode(slab(2.6, 0.12, 0.18, color: frame, at: SCNVector3(center.x, center.y - 0.6, -2.42)))
        root.addChildNode(slab(0.1, 1.3, 0.1, color: frame, at: SCNVector3(center.x - 1.25, center.y, -2.45)))
        root.addChildNode(slab(0.1, 1.3, 0.1, color: frame, at: SCNVector3(center.x + 1.25, center.y, -2.45)))
        root.addChildNode(slab(0.06, 1.1, 0.06, color: frame, at: SCNVector3(center.x, center.y, -2.45)))
        root.addChildNode(slab(2.4, 0.05, 0.06, color: frame, at: SCNVector3(center.x, center.y + 0.05, -2.45)))
    }

    private func buildClock(_ root: SCNNode) {
        let clock = SCNNode()
        clock.position = SCNVector3(-0.45, 2.45, -2.47)
        root.addChildNode(clock)
        let face = SCNCylinder(radius: 0.32, height: 0.04)
        face.firstMaterial = CharacterNode.material(.white, emission: UIColor(white: 0.35, alpha: 1))
        let faceNode = SCNNode(geometry: face)
        faceNode.eulerAngles.x = Float.pi / 2
        clock.addChildNode(faceNode)
        let rim = SCNTorus(ringRadius: 0.32, pipeRadius: 0.03)
        rim.firstMaterial = CharacterNode.material(UIColor(hex: 0x1A1A22))
        let rimNode = SCNNode(geometry: rim)
        rimNode.eulerAngles.x = Float.pi / 2
        clock.addChildNode(rimNode)
        for tick in 0..<12 {
            let angle = Float(tick) / 12 * 2 * .pi
            let mark = slab(0.025, tick % 3 == 0 ? 0.07 : 0.04, 0.01, color: UIColor(hex: 0x1A1A22),
                            at: SCNVector3(0.26 * sin(angle), 0.26 * cos(angle), 0.025))
            mark.eulerAngles.z = -angle
            clock.addChildNode(mark)
        }
        for (hand, length, width) in [(hourHand, Float(0.15), CGFloat(0.035)), (minuteHand, Float(0.23), CGFloat(0.022))] {
            hand.position = SCNVector3(0, 0, 0.03 + (hand === minuteHand ? 0.01 : 0))
            hand.addChildNode(slab(width, CGFloat(length), 0.01, color: UIColor(hex: 0x1A1A22), at: SCNVector3(0, length / 2, 0)))
            clock.addChildNode(hand)
        }
    }

    private func buildCouch(_ root: SCNNode) {
        let couch = UIColor(hex: 0x6A4C8F)
        root.addChildNode(slab(3.0, 0.42, 0.95, color: couch, at: SCNVector3(0, 0.21, -1.95), chamfer: 0.08))
        root.addChildNode(slab(3.0, 0.8, 0.28, color: couch.darker(0.06), at: SCNVector3(0, 0.62, -2.35), chamfer: 0.1))
        root.addChildNode(slab(0.3, 0.65, 0.95, color: couch.darker(0.04), at: SCNVector3(-1.55, 0.33, -1.95), chamfer: 0.1))
        root.addChildNode(slab(0.3, 0.65, 0.95, color: couch.darker(0.04), at: SCNVector3(1.55, 0.33, -1.95), chamfer: 0.1))
        for x in [Float(-0.95), 0, 0.95] {
            root.addChildNode(slab(0.9, 0.1, 0.8, color: couch.darker(-0.05), at: SCNVector3(x, 0.46, -1.9), chamfer: 0.05))
        }
        // Coffee table with pizza boxes and a glass piece
        root.addChildNode(slab(2.0, 0.08, 0.9, color: UIColor(hex: 0x8A6240), at: SCNVector3(0, 0.42, -0.45), chamfer: 0.02))
        for (x, z) in [(-0.85, -0.8), (0.85, -0.8), (-0.85, -0.1), (0.85, -0.1)] as [(Float, Float)] {
            root.addChildNode(slab(0.08, 0.4, 0.08, color: UIColor(hex: 0x5A4030), at: SCNVector3(x, 0.2, z)))
        }
        root.addChildNode(slab(0.6, 0.06, 0.6, color: UIColor(hex: 0xD9B98A), at: SCNVector3(-0.5, 0.49, -0.45), chamfer: 0.01))
        root.addChildNode(slab(0.6, 0.06, 0.6, color: UIColor(hex: 0xCDAE80), at: SCNVector3(-0.45, 0.55, -0.5), chamfer: 0.01))
        let glass = SCNCylinder(radius: 0.05, height: 0.36)
        let glassMaterial = CharacterNode.material(UIColor(hex: 0x3DDC97).withAlphaComponent(0.55), emission: UIColor(hex: 0x1A5A40))
        glassMaterial.transparency = 0.6
        glass.firstMaterial = glassMaterial
        let glassNode = SCNNode(geometry: glass)
        glassNode.position = SCNVector3(0.3, 0.64, -0.55)
        root.addChildNode(glassNode)
    }

    private func buildGameCorner(_ root: SCNNode) {
        // Big TV on the left wall with a console, and two beanbags facing it
        root.addChildNode(slab(0.5, 0.55, 1.9, color: UIColor(hex: 0x2A2A2E), at: SCNVector3(-4.0, 0.28, -0.15), chamfer: 0.03))
        root.addChildNode(slab(0.25, 0.08, 0.35, color: UIColor(hex: 0xF2F2F2), at: SCNVector3(-3.9, 0.6, -0.6), chamfer: 0.02))
        root.addChildNode(slab(0.1, 1.15, 2.0, color: UIColor(hex: 0x111111), at: SCNVector3(-4.05, 1.3, -0.15), chamfer: 0.02))
        let screen = SCNNode(geometry: SCNPlane(width: 1.85, height: 1.0))
        tvScreen.lightingModel = .constant
        tvScreen.diffuse.contents = UIColor(hex: 0x3A6BC9)
        screen.geometry?.firstMaterial = tvScreen
        screen.position = SCNVector3(-3.99, 1.3, -0.15)
        screen.eulerAngles.y = Float.pi / 2
        root.addChildNode(screen)
        let screenColors: [UIColor] = [UIColor(hex: 0x3A6BC9), UIColor(hex: 0x4AB86B), UIColor(hex: 0xC94A6B), UIColor(hex: 0x6B5ACF), UIColor(hex: 0xE0A040)]
        screen.runAction(.repeatForever(.sequence([
            .wait(duration: 1.2, withRange: 1.5),
            .run { [weak self] _ in self?.tvScreen.diffuse.contents = screenColors.randomElement() }
        ])))
        for (z, color) in [(Float(-0.75), UIColor(hex: 0xFF6B6B)), (Float(0.45), UIColor(hex: 0x2F80ED))] {
            let bag = SCNSphere(radius: 0.42)
            bag.firstMaterial = CharacterNode.material(color.darker(0.1))
            let node = SCNNode(geometry: bag)
            node.position = SCNVector3(-2.85, 0.2, z)
            node.scale = SCNVector3(1, 0.5, 1)
            node.castsShadow = true
            root.addChildNode(node)
        }
    }

    private func buildBeerPong(_ root: SCNNode) {
        let length = Self.pongZ.upperBound - Self.pongZ.lowerBound
        let midZ = (Self.pongZ.upperBound + Self.pongZ.lowerBound) / 2
        root.addChildNode(slab(0.75, 0.06, CGFloat(length), color: UIColor(hex: 0x2F80ED), at: SCNVector3(Self.pongX, 0.78, midZ), chamfer: 0.02))
        root.addChildNode(slab(0.04, 0.005, CGFloat(length), color: .white, at: SCNVector3(Self.pongX, 0.812, midZ)))
        for (x, z) in [(-0.3, 0.1), (0.3, 0.1), (-0.3, length - 0.1), (0.3, length - 0.1)] as [(Float, Float)] {
            root.addChildNode(slab(0.05, 0.76, 0.05, color: UIColor(hex: 0x333333), at: SCNVector3(Self.pongX + x, 0.38, Self.pongZ.lowerBound + z)))
        }
        // A triangle of red cups at each end
        let rows: [[Float]] = [[0], [-0.07, 0.07], [-0.14, 0, 0.14]]
        for end in [Self.pongZ.lowerBound + 0.15, Self.pongZ.upperBound - 0.15] {
            let inward: Float = end < midZ ? 1 : -1
            for (row, xs) in rows.enumerated() {
                for x in xs {
                    let cup = SCNCone(topRadius: 0.06, bottomRadius: 0.045, height: 0.15)
                    cup.firstMaterial = CharacterNode.material(UIColor(hex: 0xE0302E))
                    let node = SCNNode(geometry: cup)
                    node.position = SCNVector3(Self.pongX + x, 0.885, end + inward * Float(2 - row) * 0.12)
                    node.castsShadow = true
                    root.addChildNode(node)
                }
            }
        }
    }

    private func buildLights(_ root: SCNNode) {
        let ambientLight = SCNLight()
        ambientLight.type = .ambient
        ambientLight.color = UIColor(red: 0.85, green: 0.82, blue: 0.95, alpha: 1)
        ambient.light = ambientLight
        root.addChildNode(ambient)

        let ceilingLight = SCNLight()
        ceilingLight.type = .spot
        ceilingLight.spotInnerAngle = 50
        ceilingLight.spotOuterAngle = 110
        ceilingLight.color = UIColor(red: 1, green: 0.95, blue: 0.86, alpha: 1)
        ceilingLight.castsShadow = true
        ceilingLight.shadowRadius = 8
        ceilingLight.shadowSampleCount = 8
        ceilingLight.shadowColor = UIColor(white: 0, alpha: 0.35)
        ceilingLight.shadowMapSize = CGSize(width: 1024, height: 1024)
        ceiling.light = ceilingLight
        ceiling.position = SCNVector3(0.3, 6.5, 3)
        ceiling.look(at: SCNVector3(0, 0, -0.3))
        root.addChildNode(ceiling)

        // Light coming in through the window
        let day = SCNLight()
        day.type = .directional
        daylight.light = day
        daylight.position = SCNVector3(1.4, 3, -2.4)
        daylight.look(at: SCNVector3(0, 0, 1.5))
        root.addChildNode(daylight)

        let lampLight = SCNLight()
        lampLight.type = .omni
        lampLight.color = UIColor(red: 1, green: 0.8, blue: 0.5, alpha: 1)
        lampLight.attenuationStartDistance = 0.5
        lampLight.attenuationEndDistance = 7
        lamp.light = lampLight
        lamp.position = SCNVector3(-1.5, 1.6, -2.0)
        root.addChildNode(lamp)

        let tv = SCNLight()
        tv.type = .omni
        tv.color = UIColor(red: 0.5, green: 0.65, blue: 1, alpha: 1)
        tv.attenuationStartDistance = 0.3
        tv.attenuationEndDistance = 5
        tvLight.light = tv
        tvLight.position = SCNVector3(-3.4, 1.3, -0.15)
        root.addChildNode(tvLight)
        tvLight.runAction(.repeatForever(.sequence([
            .wait(duration: 0.4, withRange: 0.6),
            .run { node in node.light?.color = UIColor(red: CGFloat.random(in: 0.4...0.7), green: CGFloat.random(in: 0.5...0.75), blue: 1, alpha: 1) }
        ])))
    }

    private func slab(_ width: CGFloat, _ height: CGFloat, _ length: CGFloat, color: UIColor,
                      at position: SCNVector3, chamfer: CGFloat = 0, emission: UIColor? = nil) -> SCNNode {
        let geometry = SCNBox(width: width, height: height, length: length, chamferRadius: chamfer)
        geometry.firstMaterial = CharacterNode.material(color, emission: emission)
        let node = SCNNode(geometry: geometry)
        node.position = position
        node.castsShadow = true
        return node
    }
}
