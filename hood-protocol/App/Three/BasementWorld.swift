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

/// The 3D basement: the room, its lights through the night, and the people hanging out in it.
/// People wander around, sit on the couch, and wave when it's their turn.
final class BasementWorld {
    let scene = SCNScene()
    let camera = SCNNode()

    private var people: [Int: CharacterNode] = [:]
    private var guests: [Int: Guest3D] = [:]
    private var busyUntil: [Int: Date] = [:]
    private var seated: [Int: Int] = [:]
    private var timer: Timer?
    private var night: Double = -1

    private let ambient = SCNNode()
    private let lamp = SCNNode()
    private let tvLight = SCNNode()
    private let ceiling = SCNNode()
    private let windowPane = SCNMaterial()
    private let tvScreen = SCNMaterial()

    /// Walkable floor, in room units. The couch sits along the back wall, the coffee table in front of it.
    private static let floorX: ClosedRange<Float> = -3.3...3.3
    private static let floorZ: ClosedRange<Float> = -0.9...2.7
    private static let couchSeats: [SCNVector3] = [SCNVector3(-0.85, 0, -1.95), SCNVector3(0, 0, -1.95), SCNVector3(0.85, 0, -1.95)]
    private static let doorSpot = SCNVector3(3.1, 0, -1.6)

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
            seated[id] = nil
        }
        for (index, guest) in list.enumerated() {
            let previous = guests[guest.id]
            var existing = people[guest.id]
            if existing == nil || previous?.look != guest.look {
                let position = existing?.position ?? spawnPoint(index)
                existing?.removeFromParentNode()
                let made = CharacterNode(look: guest.look)
                made.position = position
                made.eulerAngles.y = Float.random(in: -0.6...0.6)
                scene.rootNode.addChildNode(made)
                people[guest.id] = made
                seated[guest.id] = nil
                busyUntil[guest.id] = Date().addingTimeInterval(Double.random(in: 0.5...3))
                existing = made
            }
            guard let node = existing else { continue }
            node.setLabel(guest.name, badge: guest.badge)
            node.setHighlighted(guest.highlighted)
            node.setDimmed(guest.dimmed)
            if guest.highlighted && previous?.highlighted != true && !guest.dimmed {
                node.wave()
            }
            if guest.dimmed && previous?.dimmed != true {
                // Kicked out: walk over to the stairs and hang back.
                seated[guest.id] = nil
                node.stand()
                walk(guest.id, to: Self.doorSpot)
            }
            guests[guest.id] = guest
        }
    }

    private func spawnPoint(_ index: Int) -> SCNVector3 {
        let spots: [(Float, Float)] = [(-1.6, 0.4), (1.6, 0.3), (-0.6, 1.6), (0.7, 1.7), (-2.6, 1.2),
                                       (2.6, 1.3), (-1.8, 2.3), (1.9, 2.4), (0, 2.5), (-2.9, -0.4)]
        let spot = spots[index % spots.count]
        return SCNVector3(spot.0, 0, spot.1)
    }

    // MARK: Wandering

    private func tick() {
        let now = Date()
        for (id, node) in people {
            guard let guest = guests[id], !guest.dimmed, (busyUntil[id] ?? .distantPast) < now else { continue }
            if Int.random(in: 0..<3) != 0 { continue }
            if let seat = seated[id] {
                // Sitters stay a while, then get up.
                if Double.random(in: 0...1) < 0.35 {
                    seated[id] = nil
                    node.stand()
                    let up = SCNVector3(Self.couchSeats[seat].x, 0, Self.floorZ.lowerBound + 0.1)
                    walk(id, to: up, delay: 0.3)
                } else {
                    busyUntil[id] = now.addingTimeInterval(Double.random(in: 3...8))
                }
                continue
            }
            let taken = Set(seated.values)
            let free = Self.couchSeats.indices.filter { !taken.contains($0) }
            if let seat = free.randomElement(), Double.random(in: 0...1) < 0.3 {
                sit(id, seat: seat)
            } else {
                walk(id, to: randomFloorPoint())
            }
        }
    }

    private func randomFloorPoint() -> SCNVector3 {
        for _ in 0..<10 {
            let x = Float.random(in: Self.floorX)
            let z = Float.random(in: Self.floorZ)
            // Keep clear of the coffee table.
            if abs(x) < 1.1 && z > -1.0 && z < 0.1 { continue }
            return SCNVector3(x, 0, z)
        }
        return SCNVector3(0, 0, 1.5)
    }

    private func walk(_ id: Int, to target: SCNVector3, delay: TimeInterval = 0, then finish: SCNAction? = nil) {
        guard let node = people[id] else { return }
        let start = node.position
        let dx = target.x - start.x, dz = target.z - start.z
        let distance = sqrt(dx * dx + dz * dz)
        let duration = TimeInterval(distance / 0.9)
        let facing = atan2(dx, dz)
        var steps: [SCNAction] = []
        if delay > 0 { steps.append(.wait(duration: delay)) }
        steps += [
            .rotateTo(x: 0, y: CGFloat(facing), z: 0, duration: 0.25, usesShortestUnitArc: true),
            .run { node in (node as? CharacterNode)?.startWalking() },
            .move(to: target, duration: duration),
            .run { node in (node as? CharacterNode)?.stopWalking() },
            .rotateTo(x: 0, y: CGFloat(Float.random(in: -0.5...0.5)), z: 0, duration: 0.4, usesShortestUnitArc: true)
        ]
        if let finish { steps.append(finish) }
        node.removeAction(forKey: "go")
        node.runAction(.sequence(steps), forKey: "go")
        busyUntil[id] = Date().addingTimeInterval(delay + duration + 0.7 + Double.random(in: 2...7))
    }

    private func sit(_ id: Int, seat: Int) {
        let spot = Self.couchSeats[seat]
        seated[id] = seat
        let front = SCNVector3(spot.x, 0, spot.z + 0.55)
        let sitDown = SCNAction.sequence([
            .rotateTo(x: 0, y: 0, z: 0, duration: 0.3, usesShortestUnitArc: true),
            .run { node in (node as? CharacterNode)?.sit() },
            .move(to: SCNVector3(spot.x, 0.05, spot.z), duration: 0.3)
        ])
        walk(id, to: front, then: sitDown)
        busyUntil[id] = (busyUntil[id] ?? Date()).addingTimeInterval(Double.random(in: 4...9))
    }

    // MARK: Night

    /// 0 is 8 PM with the last of the sunset in the window, 0.5 is the middle of the night, 1 is sunrise.
    private func setNight(_ value: Double) {
        let value = max(0, min(1, value))
        guard abs(value - night) > 0.001 else { return }
        night = value
        let dark = value < 0.85 ? min(1, value / 0.5) : max(0, 1 - (value - 0.85) / 0.15 * 0.7)

        SCNTransaction.begin()
        SCNTransaction.animationDuration = 1.5
        ambient.light?.intensity = CGFloat(420 - 330 * dark)
        ceiling.light?.intensity = CGFloat(900 - 650 * dark)
        lamp.light?.intensity = CGFloat(500 + 700 * dark)
        tvLight.light?.intensity = CGFloat(250 + 650 * dark)
        windowPane.emission.contents = Self.sky(value)
        SCNTransaction.commit()
    }

    private static func sky(_ t: Double) -> UIColor {
        let dusk = (r: 0.95, g: 0.55, b: 0.35), midnight = (r: 0.05, g: 0.07, b: 0.2), dawn = (r: 0.6, g: 0.72, b: 0.98)
        func mix(_ a: (r: Double, g: Double, b: Double), _ b: (r: Double, g: Double, b: Double), _ k: Double) -> UIColor {
            let k = max(0, min(1, k))
            return UIColor(red: a.r + (b.r - a.r) * k, green: a.g + (b.g - a.g) * k, blue: a.b + (b.b - a.b) * k, alpha: 1)
        }
        return t < 0.85 ? mix(dusk, midnight, t / 0.5) : mix(midnight, dawn, (t - 0.85) / 0.15)
    }

    // MARK: Room

    private func buildRoom() {
        let root = scene.rootNode
        scene.background.contents = UIColor(hex: 0x050508)

        // Camera: a little above and in front, looking down into the room.
        let cam = SCNCamera()
        cam.fieldOfView = 46
        cam.zNear = 0.1
        cam.zFar = 60
        cam.wantsHDR = true
        cam.bloomIntensity = 0.6
        cam.bloomThreshold = 0.8
        cam.vignettingIntensity = 0.5
        cam.vignettingPower = 0.6
        camera.camera = cam
        camera.position = SCNVector3(0, 4.6, 7.6)
        camera.look(at: SCNVector3(0, 0.7, -0.2))
        root.addChildNode(camera)
        // A slow drift so the room feels alive.
        camera.runAction(.repeatForever(.sequence([
            .moveBy(x: 0.5, y: 0, z: 0, duration: 9),
            .moveBy(x: -0.5, y: 0, z: 0, duration: 9)
        ])))

        // Floor, carpet and walls
        let carpet = UIColor(hex: 0x3B3F4A)
        let paneling = UIColor(hex: 0x6B4A33)
        root.addChildNode(slab(9, 0.1, 7, color: carpet, at: SCNVector3(0, -0.05, 0.3)))
        let rug = SCNCylinder(radius: 1.8, height: 0.02)
        rug.firstMaterial = CharacterNode.material(UIColor(hex: 0x7A2E3A))
        let rugNode = SCNNode(geometry: rug)
        rugNode.position = SCNVector3(0, 0.01, 0.5)
        rugNode.scale = SCNVector3(1.3, 1, 0.8)
        root.addChildNode(rugNode)
        root.addChildNode(slab(9, 3.4, 0.2, color: paneling, at: SCNVector3(0, 1.7, -2.6)))
        root.addChildNode(slab(0.2, 3.4, 7, color: paneling.darker(0.05), at: SCNVector3(-4.4, 1.7, 0.3)))
        root.addChildNode(slab(0.2, 3.4, 7, color: paneling.darker(0.05), at: SCNVector3(4.4, 1.7, 0.3)))
        // Baseboard trim
        root.addChildNode(slab(9, 0.15, 0.05, color: UIColor(hex: 0x3A2A1E), at: SCNVector3(0, 0.08, -2.48)))

        // Window well high on the back wall
        windowPane.lightingModel = .constant
        windowPane.diffuse.contents = UIColor.black
        let windowNode = SCNNode(geometry: SCNPlane(width: 1.3, height: 0.5))
        windowNode.geometry?.firstMaterial = windowPane
        windowNode.position = SCNVector3(2.2, 2.75, -2.49)
        root.addChildNode(windowNode)
        root.addChildNode(slab(1.45, 0.08, 0.1, color: .white, at: SCNVector3(2.2, 2.48, -2.46)))
        root.addChildNode(slab(0.06, 0.5, 0.08, color: .white, at: SCNVector3(2.2, 2.75, -2.46)))

        // Posters
        for (x, color) in [(-2.8, 0x8B6CFF), (-1.7, 0x3DDC97), (0.9, 0xF5B84A)] as [(Float, UInt32)] {
            let poster = SCNNode(geometry: SCNPlane(width: 0.7, height: 0.95))
            poster.geometry?.firstMaterial = CharacterNode.material(UIColor(hex: color).darker(0.25))
            poster.position = SCNVector3(x, 1.9, -2.49)
            poster.eulerAngles.z = Float.random(in: -0.05...0.05)
            root.addChildNode(poster)
            let stripe = SCNNode(geometry: SCNPlane(width: 0.5, height: 0.12))
            stripe.geometry?.firstMaterial = CharacterNode.material(UIColor(hex: color), emission: UIColor(hex: color).darker(0.4))
            stripe.position = SCNVector3(0, 0.22, 0.005)
            poster.addChildNode(stripe)
        }

        // String lights along the top of the back wall
        let bulbColors: [UInt32] = [0xFF6B6B, 0xF5B84A, 0x3DDC97, 0x2F80ED, 0xFF8BD0]
        for i in 0..<22 {
            let bulb = SCNSphere(radius: 0.045)
            let color = UIColor(hex: bulbColors[i % bulbColors.count])
            bulb.firstMaterial = CharacterNode.material(color, emission: color)
            let node = SCNNode(geometry: bulb)
            let x = -4.0 + Float(i) * 0.38
            node.position = SCNVector3(x, 3.05 - 0.08 * abs(sin(Float(i) * 0.8)), -2.42)
            root.addChildNode(node)
            node.runAction(.repeatForever(.sequence([
                .wait(duration: Double(i % 5) * 0.3),
                .fadeOpacity(to: 0.55, duration: 0.9),
                .fadeOpacity(to: 1, duration: 0.9)
            ])))
        }

        // Couch
        let couch = UIColor(hex: 0x5A3D7A)
        root.addChildNode(slab(3.0, 0.42, 0.95, color: couch, at: SCNVector3(0, 0.21, -1.95), chamfer: 0.08))
        root.addChildNode(slab(3.0, 0.8, 0.28, color: couch.darker(0.06), at: SCNVector3(0, 0.62, -2.35), chamfer: 0.1))
        root.addChildNode(slab(0.3, 0.65, 0.95, color: couch.darker(0.04), at: SCNVector3(-1.55, 0.33, -1.95), chamfer: 0.1))
        root.addChildNode(slab(0.3, 0.65, 0.95, color: couch.darker(0.04), at: SCNVector3(1.55, 0.33, -1.95), chamfer: 0.1))
        for x in [Float(-0.95), 0, 0.95] {
            root.addChildNode(slab(0.9, 0.12, 0.8, color: couch.darker(-0.05), at: SCNVector3(x, 0.47, -1.9), chamfer: 0.05))
        }

        // Coffee table with pizza boxes, red cups and a glass piece
        root.addChildNode(slab(2.0, 0.08, 0.9, color: UIColor(hex: 0x7A5230), at: SCNVector3(0, 0.42, -0.45), chamfer: 0.02))
        for (x, z) in [(-0.85, -0.8), (0.85, -0.8), (-0.85, -0.1), (0.85, -0.1)] as [(Float, Float)] {
            root.addChildNode(slab(0.08, 0.4, 0.08, color: UIColor(hex: 0x4A3220), at: SCNVector3(x, 0.2, z)))
        }
        root.addChildNode(slab(0.6, 0.06, 0.6, color: UIColor(hex: 0xD9B98A), at: SCNVector3(-0.5, 0.49, -0.45), chamfer: 0.01))
        root.addChildNode(slab(0.6, 0.06, 0.6, color: UIColor(hex: 0xCDAE80), at: SCNVector3(-0.45, 0.55, -0.5), chamfer: 0.01))
        for (x, z) in [(0.3, -0.25), (0.55, -0.6), (0.75, -0.3), (-2.4, 1.9), (2.2, 0.9)] as [(Float, Float)] {
            let cup = SCNCone(topRadius: 0.06, bottomRadius: 0.045, height: 0.16)
            cup.firstMaterial = CharacterNode.material(UIColor(hex: 0xE0302E))
            let node = SCNNode(geometry: cup)
            node.position = SCNVector3(x, z > 0.5 ? 0.08 : 0.54, z)
            root.addChildNode(node)
        }
        let glass = SCNCylinder(radius: 0.05, height: 0.36)
        let glassMaterial = CharacterNode.material(UIColor(hex: 0x3DDC97).withAlphaComponent(0.55), emission: UIColor(hex: 0x1A5A40))
        glassMaterial.transparency = 0.6
        glass.firstMaterial = glassMaterial
        let glassNode = SCNNode(geometry: glass)
        glassNode.position = SCNVector3(0.1, 0.64, -0.55)
        root.addChildNode(glassNode)

        // TV on a stand against the left wall, facing the room
        root.addChildNode(slab(0.5, 0.55, 1.6, color: UIColor(hex: 0x2A2A2E), at: SCNVector3(-4.0, 0.28, -0.3), chamfer: 0.03))
        root.addChildNode(slab(0.1, 0.95, 1.65, color: UIColor(hex: 0x111111), at: SCNVector3(-4.05, 1.12, -0.3), chamfer: 0.02))
        let screen = SCNNode(geometry: SCNPlane(width: 1.5, height: 0.82))
        tvScreen.lightingModel = .constant
        tvScreen.diffuse.contents = UIColor(hex: 0x3A6BC9)
        screen.geometry?.firstMaterial = tvScreen
        screen.position = SCNVector3(-3.99, 1.12, -0.3)
        screen.eulerAngles.y = Float.pi / 2
        root.addChildNode(screen)
        let screenColors: [UIColor] = [UIColor(hex: 0x3A6BC9), UIColor(hex: 0x4A9C6B), UIColor(hex: 0x9C4A6B), UIColor(hex: 0x6B5ACF)]
        screen.runAction(.repeatForever(.sequence([
            .wait(duration: 2.5),
            .run { [weak self] _ in
                self?.tvScreen.diffuse.contents = screenColors.randomElement()
            }
        ])))

        // Beanbag and mini fridge
        let beanbag = SCNSphere(radius: 0.55)
        beanbag.firstMaterial = CharacterNode.material(UIColor(hex: 0x2F80ED).darker(0.2))
        let beanNode = SCNNode(geometry: beanbag)
        beanNode.position = SCNVector3(3.3, 0.3, 1.9)
        beanNode.scale = SCNVector3(1, 0.55, 1)
        beanNode.castsShadow = true
        root.addChildNode(beanNode)
        root.addChildNode(slab(0.6, 0.85, 0.6, color: UIColor(hex: 0xDADADA), at: SCNVector3(-3.8, 0.43, -2.1), chamfer: 0.04))

        // Stairs going up on the right, where people who get kicked out end up
        for step in 0..<6 {
            let y = Float(step) * 0.28
            root.addChildNode(slab(1.2, 0.28, 0.4, color: UIColor(hex: 0x5C4330), at: SCNVector3(3.7, y + 0.14, -1.0 - Float(step) * 0.3)))
        }

        // Lamp in the corner
        root.addChildNode(slab(0.06, 1.6, 0.06, color: UIColor(hex: 0x222222), at: SCNVector3(-2.1, 0.8, -2.25)))
        let shade = SCNCone(topRadius: 0.16, bottomRadius: 0.3, height: 0.36)
        shade.firstMaterial = CharacterNode.material(UIColor(hex: 0xF2D9A0), emission: UIColor(hex: 0xB89458))
        let shadeNode = SCNNode(geometry: shade)
        shadeNode.position = SCNVector3(-2.1, 1.7, -2.25)
        root.addChildNode(shadeNode)

        // Lights
        let ambientLight = SCNLight()
        ambientLight.type = .ambient
        ambientLight.color = UIColor(red: 0.55, green: 0.55, blue: 0.75, alpha: 1)
        ambient.light = ambientLight
        root.addChildNode(ambient)

        let ceilingLight = SCNLight()
        ceilingLight.type = .spot
        ceilingLight.spotInnerAngle = 40
        ceilingLight.spotOuterAngle = 95
        ceilingLight.color = UIColor(red: 1, green: 0.92, blue: 0.8, alpha: 1)
        ceilingLight.castsShadow = true
        ceilingLight.shadowRadius = 6
        ceilingLight.shadowSampleCount = 8
        ceilingLight.shadowColor = UIColor(white: 0, alpha: 0.55)
        ceilingLight.shadowMapSize = CGSize(width: 1024, height: 1024)
        ceiling.light = ceilingLight
        ceiling.position = SCNVector3(0.5, 6, 2.5)
        ceiling.look(at: SCNVector3(0, 0, -0.3))
        root.addChildNode(ceiling)

        let lampLight = SCNLight()
        lampLight.type = .omni
        lampLight.color = UIColor(red: 1, green: 0.78, blue: 0.45, alpha: 1)
        lampLight.attenuationStartDistance = 0.5
        lampLight.attenuationEndDistance = 6
        lamp.light = lampLight
        lamp.position = SCNVector3(-2.1, 1.6, -2.0)
        root.addChildNode(lamp)

        let tv = SCNLight()
        tv.type = .omni
        tv.color = UIColor(red: 0.45, green: 0.6, blue: 1, alpha: 1)
        tv.attenuationStartDistance = 0.3
        tv.attenuationEndDistance = 5
        tvLight.light = tv
        tvLight.position = SCNVector3(-3.5, 1.1, -0.3)
        root.addChildNode(tvLight)
        // The TV flickers.
        tvLight.runAction(.repeatForever(.sequence([
            .wait(duration: 0.4, withRange: 0.6),
            .run { node in node.light?.color = UIColor(red: CGFloat.random(in: 0.35...0.6), green: CGFloat.random(in: 0.5...0.7), blue: 1, alpha: 1) }
        ])))
    }

    private func slab(_ width: CGFloat, _ height: CGFloat, _ length: CGFloat, color: UIColor,
                      at position: SCNVector3, chamfer: CGFloat = 0) -> SCNNode {
        let geometry = SCNBox(width: width, height: height, length: length, chamferRadius: chamfer)
        geometry.firstMaterial = CharacterNode.material(color)
        let node = SCNNode(geometry: geometry)
        node.position = position
        node.castsShadow = true
        return node
    }
}
