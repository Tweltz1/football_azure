import SceneKit
import UIKit

/// A friendly, chunky 3D person in the Hood League crew style: round head, big eyes, rosy cheeks
/// and a wide smile. Built from a `Look`. Faces +z, feet at y = 0, about 1.8 units tall.
final class CharacterNode: SCNNode {
    private(set) var look: Look
    private let body = SCNNode()
    private let leftLeg = SCNNode()
    private let rightLeg = SCNNode()
    private let leftArm = SCNNode()
    private let rightArm = SCNNode()
    private let controller = SCNNode()
    private let label = SCNNode()
    private let ring = SCNNode()
    private var labelText = ""
    private var labelBadge: String?

    private static let hipY: Float = 0.6
    private static let shoulderY: Float = 1.08
    private static let headY: Float = 1.42
    private static let headRadius: CGFloat = 0.3
    private static let ink = UIColor(hex: 0x1A1A22)

    init(look: Look) {
        self.look = look
        super.init()
        addChildNode(body)
        build()
        addChildNode(label)
        label.constraints = [SCNBillboardConstraint()]

        let tube = SCNTube(innerRadius: 0.4, outerRadius: 0.5, height: 0.02)
        tube.firstMaterial = Self.material(UIColor(hex: 0x8B6CFF), emission: UIColor(hex: 0x8B6CFF))
        ring.geometry = tube
        ring.position = SCNVector3(0, 0.02, 0)
        ring.isHidden = true
        ring.runAction(.repeatForever(.sequence([.fadeOpacity(to: 0.35, duration: 0.6), .fadeOpacity(to: 1, duration: 0.6)])))
        addChildNode(ring)

        // Breathing, so nobody stands perfectly still.
        body.runAction(.repeatForever(.sequence([
            .moveBy(x: 0, y: 0.012, z: 0, duration: 1.1),
            .moveBy(x: 0, y: -0.012, z: 0, duration: 1.1)
        ])))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    // MARK: Appearance

    func setLabel(_ text: String, badge: String?) {
        guard text != labelText || badge != labelBadge else { return }
        labelText = text
        labelBadge = badge
        let image = Self.labelImage(text, badge: badge)
        let width = CGFloat(image.size.width / image.size.height) * 0.36
        let plane = SCNPlane(width: width, height: 0.36)
        let material = SCNMaterial()
        material.diffuse.contents = image
        material.lightingModel = .constant
        material.isDoubleSided = true
        material.readsFromDepthBuffer = false
        plane.firstMaterial = material
        label.geometry = plane
        label.renderingOrder = 10
        label.position = SCNVector3(0, 2.12, 0)
    }

    func setHighlighted(_ on: Bool) { ring.isHidden = !on }

    func setDimmed(_ on: Bool) {
        let target: CGFloat = on ? 0.3 : 1
        guard body.opacity != target else { return }
        body.runAction(.fadeOpacity(to: target, duration: 0.6))
    }

    // MARK: Poses

    /// Puts arms and legs back to standing still.
    func relax() {
        controller.isHidden = true
        for limb in [leftLeg, rightLeg, leftArm, rightArm] {
            limb.removeAction(forKey: "walk")
            limb.removeAction(forKey: "pose")
            limb.runAction(.rotateTo(x: 0, y: 0, z: 0, duration: 0.2))
        }
        body.removeAction(forKey: "posture")
        body.runAction(.move(to: SCNVector3(0, 0, 0), duration: 0.25), forKey: "posture")
    }

    func startWalking() {
        guard leftLeg.action(forKey: "walk") == nil else { return }
        let swing: CGFloat = 0.55
        let step = 0.28
        func cycle(_ first: CGFloat) -> SCNAction {
            .repeatForever(.sequence([
                .rotateTo(x: first, y: 0, z: 0, duration: step),
                .rotateTo(x: -first, y: 0, z: 0, duration: step)
            ]))
        }
        leftLeg.runAction(cycle(swing), forKey: "walk")
        rightLeg.runAction(cycle(-swing), forKey: "walk")
        leftArm.runAction(cycle(-swing * 0.8), forKey: "walk")
        rightArm.runAction(cycle(swing * 0.8), forKey: "walk")
    }

    func stopWalking() {
        for limb in [leftLeg, rightLeg, leftArm, rightArm] {
            limb.removeAction(forKey: "walk")
            limb.runAction(.rotateTo(x: 0, y: 0, z: 0, duration: 0.2))
        }
    }

    /// Bends the legs forward to sit on a seat about `height` above the floor.
    func sit(height: Float = 0.45) {
        stopWalking()
        leftLeg.runAction(.rotateTo(x: -1.45, y: 0, z: 0, duration: 0.3), forKey: "pose")
        rightLeg.runAction(.rotateTo(x: -1.45, y: 0, z: 0, duration: 0.3), forKey: "pose")
        body.runAction(.move(to: SCNVector3(0, height - Self.hipY, 0), duration: 0.3), forKey: "posture")
    }

    /// Sitting with a controller, thumbs going.
    func playVideoGames() {
        sit(height: 0.32)
        controller.isHidden = false
        for (arm, side) in [(leftArm, CGFloat(1)), (rightArm, CGFloat(-1))] {
            arm.runAction(.repeatForever(.sequence([
                .rotateTo(x: -1.15, y: 0, z: 0.25 * side, duration: 0.18),
                .rotateTo(x: -1.05, y: 0, z: 0.22 * side, duration: 0.22)
            ])), forKey: "pose")
        }
    }

    /// One beer pong shot: wind up and release. `release` runs when the ball leaves the hand.
    func throwBall(release: @escaping () -> Void) {
        rightArm.runAction(.sequence([
            .rotateTo(x: -1.4, y: 0, z: 0, duration: 0.35),
            .rotateTo(x: -2.0, y: 0, z: 0, duration: 0.15),
            .run { _ in DispatchQueue.main.async(execute: release) },
            .rotateTo(x: -2.6, y: 0, z: 0, duration: 0.12),
            .wait(duration: 0.4),
            .rotateTo(x: 0, y: 0, z: 0, duration: 0.3)
        ]), forKey: "pose")
    }

    /// Where the right hand is, in world space, for the ball to start from.
    var handPosition: SCNVector3 {
        rightArm.convertPosition(SCNVector3(0, -0.55, 0), to: nil)
    }

    /// A little wave, for when it's this person's turn.
    func wave() {
        rightArm.runAction(.sequence([
            .rotateTo(x: 0, y: 0, z: 2.6, duration: 0.25),
            .rotateTo(x: 0, y: 0, z: 2.2, duration: 0.2),
            .rotateTo(x: 0, y: 0, z: 2.6, duration: 0.2),
            .rotateTo(x: 0, y: 0, z: 0, duration: 0.3)
        ]), forKey: "pose")
    }

    // MARK: Building

    private func build() {
        let skin = UIColor(hex: Look.skins[look.skin])
        let hairColor = UIColor(hex: Look.hairColors[look.hairColor])
        let shirt = UIColor(hex: Look.clothes[look.topColor])
        let pants = UIColor(hex: Look.pantsColors[look.pants])
        let shoes = UIColor(hex: Look.shoeColors[look.shoes])
        let hatColor = UIColor(hex: Look.clothes[look.hatColor])
        let dress = look.top == 4

        // Legs swing from the hips.
        for (pivot, x) in [(leftLeg, Float(-0.12)), (rightLeg, Float(0.12))] {
            pivot.position = SCNVector3(x, Self.hipY, 0)
            body.addChildNode(pivot)
            if dress {
                pivot.addChildNode(Self.capsule(0.08, 0.5, color: skin, at: SCNVector3(0, -0.28, 0)))
            } else if look.shorts {
                pivot.addChildNode(Self.capsule(0.11, 0.28, color: pants, at: SCNVector3(0, -0.13, 0)))
                pivot.addChildNode(Self.capsule(0.08, 0.32, color: skin, at: SCNVector3(0, -0.36, 0)))
            } else {
                pivot.addChildNode(Self.capsule(0.11, 0.56, color: pants, at: SCNVector3(0, -0.27, 0)))
            }
            pivot.addChildNode(Self.box(0.2, 0.11, 0.3, chamfer: 0.05, color: shoes, at: SCNVector3(0, -0.56, 0.04)))
        }

        // Torso: a soft, rounded block.
        body.addChildNode(Self.box(0.54, 0.6, 0.34, chamfer: 0.16, color: shirt, at: SCNVector3(0, 0.84, 0)))
        switch look.top {
        case 1:
            // Hoodie: hood behind the head and a front pocket
            body.addChildNode(Self.sphere(0.24, color: shirt.darker(0.08), at: SCNVector3(0, 1.28, -0.16), scale: SCNVector3(1.1, 0.8, 0.7)))
            body.addChildNode(Self.box(0.32, 0.13, 0.03, chamfer: 0.04, color: shirt.darker(0.12), at: SCNVector3(0, 0.7, 0.165)))
        case 2:
            // Jersey: shoulder stripe and a number
            body.addChildNode(Self.box(0.55, 0.06, 0.35, chamfer: 0.03, color: UIColor(hex: 0xF5B84A), at: SCNVector3(0, 0.98, 0)))
            body.addChildNode(Self.box(0.16, 0.18, 0.02, chamfer: 0.03, color: .white, at: SCNVector3(0, 0.8, 0.175)))
        case 4:
            // Dress: flares out over the legs
            let skirt = SCNCone(topRadius: 0.27, bottomRadius: 0.4, height: 0.4)
            skirt.firstMaterial = Self.material(shirt)
            let node = SCNNode(geometry: skirt)
            node.position = SCNVector3(0, 0.45, 0)
            node.castsShadow = true
            body.addChildNode(node)
        default:
            break
        }
        if look.chain {
            let chain = SCNTorus(ringRadius: 0.13, pipeRadius: 0.016)
            chain.firstMaterial = Self.material(UIColor(hex: 0xF5C542), metal: true)
            let node = SCNNode(geometry: chain)
            node.position = SCNVector3(0, 1.06, 0.08)
            node.eulerAngles = SCNVector3(1.2, 0, 0)
            body.addChildNode(node)
        }

        // Arms swing from the shoulders.
        let sleeve: Float = look.top == 1 ? 0.5 : (look.top == 3 || dress ? 0 : 0.2)
        for (pivot, x) in [(leftArm, Float(-0.34)), (rightArm, Float(0.34))] {
            pivot.position = SCNVector3(x, Self.shoulderY, 0)
            body.addChildNode(pivot)
            pivot.addChildNode(Self.capsule(0.075, 0.55, color: skin, at: SCNVector3(0, -0.27, 0)))
            if sleeve > 0 {
                pivot.addChildNode(Self.capsule(0.09, CGFloat(sleeve), color: shirt, at: SCNVector3(0, -sleeve / 2 + 0.03, 0)))
            }
            pivot.addChildNode(Self.sphere(0.085, color: skin, at: SCNVector3(0, -0.56, 0)))
        }
        // Game controller, shown while gaming
        controller.geometry = SCNBox(width: 0.24, height: 0.05, length: 0.12, chamferRadius: 0.03)
        controller.geometry?.firstMaterial = Self.material(UIColor(hex: 0x222228))
        controller.position = SCNVector3(0, 0.78, 0.5)
        controller.isHidden = true
        body.addChildNode(controller)

        // Head: big and round, like the Hood League crew
        let head = SCNNode()
        head.position = SCNVector3(0, Self.headY, 0)
        body.addChildNode(head)
        let r = Float(Self.headRadius)
        if look.hair == 4 {
            head.addChildNode(Self.box(0.56, 0.62, 0.2, chamfer: 0.1, color: hairColor, at: SCNVector3(0, -0.12, -0.17)))
        }
        head.addChildNode(Self.sphere(Self.headRadius, color: skin, at: SCNVector3(0, 0, 0)))
        head.addChildNode(Self.sphere(0.07, color: skin, at: SCNVector3(-r, -0.02, 0)))
        head.addChildNode(Self.sphere(0.07, color: skin, at: SCNVector3(r, -0.02, 0)))

        // Face, sitting on the front of the head
        func onFace(_ x: Float, _ y: Float, lift: Float = 0.005) -> SCNVector3 {
            SCNVector3(x, y, sqrt(max(0, r * r - x * x - y * y)) + lift)
        }
        if look.shades {
            for x in [Float(-0.1), Float(0.1)] {
                let lens = Self.box(0.15, 0.09, 0.03, chamfer: 0.03, color: UIColor(white: 0.05, alpha: 1), at: onFace(x, 0.02, lift: 0.01))
                head.addChildNode(lens)
            }
            head.addChildNode(Self.box(0.06, 0.015, 0.02, chamfer: 0.005, color: UIColor(white: 0.05, alpha: 1), at: onFace(0, 0.03, lift: 0.02)))
        } else {
            for x in [Float(-0.1), Float(0.1)] {
                let eye = Self.sphere(0.04, color: Self.ink, at: onFace(x, 0.02, lift: -0.01), scale: SCNVector3(0.85, 1.25, 0.6))
                head.addChildNode(eye)
                let shine = SCNSphere(radius: 0.012)
                shine.firstMaterial = Self.material(.white, emission: .white)
                let shineNode = SCNNode(geometry: shine)
                shineNode.position = SCNVector3(0.012, 0.018, 0.036)
                eye.addChildNode(shineNode)
            }
        }
        if look.glasses && !look.shades {
            for x in [Float(-0.1), Float(0.1)] {
                let rim = SCNTorus(ringRadius: 0.065, pipeRadius: 0.011)
                rim.firstMaterial = Self.material(Self.ink)
                let node = SCNNode(geometry: rim)
                node.position = onFace(x, 0.02, lift: 0.015)
                node.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
                head.addChildNode(node)
            }
        }
        // Rosy cheeks
        for x in [Float(-0.17), Float(0.17)] {
            let cheek = SCNSphere(radius: 0.045)
            let blush = Self.material(UIColor(hex: 0xFF7F8F))
            blush.transparency = 0.5
            cheek.firstMaterial = blush
            let node = SCNNode(geometry: cheek)
            node.position = onFace(x, -0.07, lift: -0.02)
            node.scale = SCNVector3(1, 0.8, 0.4)
            head.addChildNode(node)
        }
        // Wide open smile
        let smilePath = UIBezierPath()
        smilePath.move(to: CGPoint(x: -0.075, y: 0))
        smilePath.addQuadCurve(to: CGPoint(x: 0.075, y: 0), controlPoint: CGPoint(x: 0, y: -0.11))
        smilePath.close()
        smilePath.flatness = 0.002
        let smile = SCNShape(path: smilePath, extrusionDepth: 0.02)
        let teeth = Self.material(.white)
        let lips = Self.material(Self.ink)
        smile.materials = [teeth, teeth, lips]
        let smileNode = SCNNode(geometry: smile)
        smileNode.position = onFace(0, -0.1, lift: -0.004)
        smileNode.eulerAngles = SCNVector3(-0.25, 0, 0)
        head.addChildNode(smileNode)
        if look.facial == 1 {
            let beard = Self.sphere(0.24, color: UIColor(hex: 0x8A5A3C), at: SCNVector3(0, -0.14, 0.07), scale: SCNVector3(1.05, 0.62, 1))
            beard.geometry?.firstMaterial?.transparency = 0.6
            head.addChildNode(beard)
        } else if look.facial == 2 {
            let stache = Self.capsule(0.022, 0.15, color: UIColor(hex: 0x3A2418), at: onFace(0, -0.065, lift: 0.0))
            stache.eulerAngles = SCNVector3(0, 0, Float.pi / 2)
            head.addChildNode(stache)
        }

        if look.hat == 0 {
            addHair(to: head, color: hairColor)
        } else {
            addHat(to: head, color: hatColor)
        }
    }

    /// Hair and hats are spheres pushed up so only the top shows above the forehead.
    private func dome(_ color: UIColor, radius: CGFloat = 0.315, lift: Float = 0.12, back: Float = -0.02,
                      scale: SCNVector3 = SCNVector3(1, 0.9, 1)) -> SCNNode {
        Self.sphere(radius, color: color, at: SCNVector3(0, lift, back), scale: scale)
    }

    private func addHair(to head: SCNNode, color: UIColor) {
        switch look.hair {
        case 0:
            head.addChildNode(dome(color, radius: 0.305, lift: 0.08, scale: SCNVector3(1, 0.85, 1)))
        case 1:
            head.addChildNode(dome(color))
            head.addChildNode(Self.sphere(0.12, color: color, at: SCNVector3(0.1, 0.27, 0.14), scale: SCNVector3(1.4, 0.6, 1)))
        case 2:
            for (x, z) in [(-0.16, 0.1), (0.0, 0.15), (0.16, 0.1), (-0.15, -0.1), (0.02, -0.08), (0.17, -0.12), (0.0, -0.2)] {
                head.addChildNode(Self.sphere(0.12, color: color, at: SCNVector3(Float(x), 0.25, Float(z))))
            }
        case 3:
            head.addChildNode(Self.sphere(0.42, color: color, at: SCNVector3(0, 0.16, -0.08), scale: SCNVector3(1, 0.88, 0.95)))
        case 4:
            head.addChildNode(dome(color, radius: 0.32))
        case 5:
            head.addChildNode(dome(color))
            head.addChildNode(Self.sphere(0.13, color: color, at: SCNVector3(0, 0.36, -0.1)))
        default:
            break
        }
    }

    private func addHat(to head: SCNNode, color: UIColor) {
        switch look.hat {
        case 3:
            head.addChildNode(dome(color, radius: 0.33, lift: 0.12, scale: SCNVector3(1, 1, 1)))
            let cuff = SCNTorus(ringRadius: 0.3, pipeRadius: 0.05)
            cuff.firstMaterial = Self.material(color.darker(0.12))
            let node = SCNNode(geometry: cuff)
            node.position = SCNVector3(0, 0.1, -0.01)
            head.addChildNode(node)
        default:
            head.addChildNode(dome(color, radius: 0.32, lift: 0.11, scale: SCNVector3(1, 0.85, 1)))
            head.addChildNode(Self.sphere(0.03, color: color, at: SCNVector3(0, 0.39, -0.02)))
            let forward: Float = look.hat == 1 ? 1 : -1
            let brim = SCNCylinder(radius: 0.2, height: 0.025)
            brim.firstMaterial = Self.material(color.darker(0.06))
            let node = SCNNode(geometry: brim)
            node.position = SCNVector3(0, 0.13, 0.25 * forward)
            node.scale = SCNVector3(1.1, 1, 0.8)
            node.eulerAngles = SCNVector3(0.12 * forward, 0, 0)
            head.addChildNode(node)
            if look.hat == 2 {
                head.addChildNode(Self.box(0.12, 0.05, 0.02, chamfer: 0.01, color: UIColor(hex: 0xE9E3D0), at: SCNVector3(0, 0.12, 0.3)))
            }
        }
    }

    // MARK: Helpers

    private static func box(_ width: CGFloat, _ height: CGFloat, _ length: CGFloat, chamfer: CGFloat,
                            color: UIColor, at position: SCNVector3) -> SCNNode {
        let geometry = SCNBox(width: width, height: height, length: length, chamferRadius: chamfer)
        geometry.firstMaterial = material(color)
        let node = SCNNode(geometry: geometry)
        node.position = position
        node.castsShadow = true
        return node
    }

    private static func capsule(_ radius: CGFloat, _ height: CGFloat, color: UIColor, at position: SCNVector3) -> SCNNode {
        let geometry = SCNCapsule(capRadius: radius, height: max(height, radius * 2))
        geometry.firstMaterial = material(color)
        let node = SCNNode(geometry: geometry)
        node.position = position
        node.castsShadow = true
        return node
    }

    private static func sphere(_ radius: CGFloat, color: UIColor, at position: SCNVector3,
                               scale: SCNVector3 = SCNVector3(1, 1, 1)) -> SCNNode {
        let geometry = SCNSphere(radius: radius)
        geometry.segmentCount = 32
        geometry.firstMaterial = material(color)
        let node = SCNNode(geometry: geometry)
        node.position = position
        node.scale = scale
        node.castsShadow = true
        return node
    }

    static func material(_ color: UIColor, emission: UIColor? = nil, metal: Bool = false) -> SCNMaterial {
        let material = SCNMaterial()
        material.lightingModel = .physicallyBased
        material.diffuse.contents = color
        material.roughness.contents = metal ? 0.3 : 0.7
        material.metalness.contents = metal ? 0.9 : 0.0
        if let emission { material.emission.contents = emission }
        return material
    }

    private static func labelImage(_ text: String, badge: String?) -> UIImage {
        let nameFont = UIFont.systemFont(ofSize: 40, weight: .heavy)
        let badgeFont = UIFont.systemFont(ofSize: 30, weight: .black)
        let nameSize = (text as NSString).size(withAttributes: [.font: nameFont])
        let badgeSize = badge.map { ($0.uppercased() as NSString).size(withAttributes: [.font: badgeFont]) } ?? .zero
        let width = max(nameSize.width, badgeSize.width) + 40
        let height: CGFloat = 120
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height)).image { _ in
            if let badge {
                let rect = CGRect(x: (width - badgeSize.width - 24) / 2, y: 0, width: badgeSize.width + 24, height: 44)
                UIColor(hex: 0x8B6CFF).setFill()
                UIBezierPath(roundedRect: rect, cornerRadius: 22).fill()
                (badge.uppercased() as NSString).draw(at: CGPoint(x: rect.minX + 12, y: rect.minY + 4),
                                                      withAttributes: [.font: badgeFont, .foregroundColor: UIColor.white])
            }
            let rect = CGRect(x: (width - nameSize.width - 24) / 2, y: 54, width: nameSize.width + 24, height: 60)
            UIColor(white: 0, alpha: 0.6).setFill()
            UIBezierPath(roundedRect: rect, cornerRadius: 30).fill()
            (text as NSString).draw(at: CGPoint(x: rect.minX + 12, y: rect.minY + 6),
                                    withAttributes: [.font: nameFont, .foregroundColor: UIColor.white])
        }
    }
}

extension UIColor {
    func darker(_ amount: CGFloat) -> UIColor {
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getHue(&h, saturation: &s, brightness: &b, alpha: &a)
        return UIColor(hue: h, saturation: s, brightness: max(0, min(1, b - amount)), alpha: a)
    }
}
