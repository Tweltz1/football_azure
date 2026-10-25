import SceneKit
import UIKit

/// A blocky 3D person built from a `Look`. Faces +z, feet at y = 0, about 1.75 units tall.
final class CharacterNode: SCNNode {
    private(set) var look: Look
    private let body = SCNNode()
    private let leftLeg = SCNNode()
    private let rightLeg = SCNNode()
    private let leftArm = SCNNode()
    private let rightArm = SCNNode()
    private let label = SCNNode()
    private let ring = SCNNode()
    private var labelText = ""
    private var labelBadge: String?

    private static let hipY: Float = 0.62
    private static let shoulderY: Float = 1.14

    init(look: Look) {
        self.look = look
        super.init()
        addChildNode(body)
        build()
        addChildNode(label)
        label.constraints = [SCNBillboardConstraint()]

        let tube = SCNTube(innerRadius: 0.38, outerRadius: 0.48, height: 0.02)
        tube.firstMaterial = Self.material(UIColor(hex: 0x8B6CFF), emission: UIColor(hex: 0x8B6CFF))
        ring.geometry = tube
        ring.position = SCNVector3(0, 0.02, 0)
        ring.isHidden = true
        ring.runAction(.repeatForever(.sequence([.fadeOpacity(to: 0.35, duration: 0.6), .fadeOpacity(to: 1, duration: 0.6)])))
        addChildNode(ring)

        // Breathing, so nobody stands perfectly still.
        body.runAction(.repeatForever(.sequence([
            .moveBy(x: 0, y: 0.015, z: 0, duration: 1.1),
            .moveBy(x: 0, y: -0.015, z: 0, duration: 1.1)
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
        material.emission.contents = image
        material.lightingModel = .constant
        material.isDoubleSided = true
        material.readsFromDepthBuffer = false
        plane.firstMaterial = material
        label.geometry = plane
        label.renderingOrder = 10
        label.position = SCNVector3(0, 2.05, 0)
    }

    func setHighlighted(_ on: Bool) { ring.isHidden = !on }

    func setDimmed(_ on: Bool) {
        let target: CGFloat = on ? 0.3 : 1
        guard body.opacity != target else { return }
        body.runAction(.fadeOpacity(to: target, duration: 0.6))
    }

    // MARK: Motion

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

    /// Bends the legs forward to sit on a seat about 0.45 units high.
    func sit() {
        stopWalking()
        leftLeg.runAction(.rotateTo(x: -1.45, y: 0, z: 0, duration: 0.3))
        rightLeg.runAction(.rotateTo(x: -1.45, y: 0, z: 0, duration: 0.3))
        body.runAction(.move(to: SCNVector3(0, -0.16, 0), duration: 0.3), forKey: "posture")
    }

    func stand() {
        leftLeg.runAction(.rotateTo(x: 0, y: 0, z: 0, duration: 0.25))
        rightLeg.runAction(.rotateTo(x: 0, y: 0, z: 0, duration: 0.25))
        body.runAction(.move(to: SCNVector3(0, 0, 0), duration: 0.25), forKey: "posture")
    }

    /// A little wave, for when it's this person's turn.
    func wave() {
        rightArm.runAction(.sequence([
            .rotateTo(x: 0, y: 0, z: 2.6, duration: 0.25),
            .rotateTo(x: 0, y: 0, z: 2.2, duration: 0.2),
            .rotateTo(x: 0, y: 0, z: 2.6, duration: 0.2),
            .rotateTo(x: 0, y: 0, z: 0, duration: 0.3)
        ]))
    }

    // MARK: Building

    private func build() {
        let skin = UIColor(hex: Look.skins[look.skin])
        let hairColor = UIColor(hex: Look.hairColors[look.hairColor])
        let shirt = UIColor(hex: Look.clothes[look.topColor])
        let pants = UIColor(hex: Look.pantsColors[look.pants])
        let shoes = UIColor(hex: Look.shoeColors[look.shoes])
        let hatColor = UIColor(hex: Look.clothes[look.hatColor])

        // Legs swing from the hips.
        for (pivot, x) in [(leftLeg, Float(-0.12)), (rightLeg, Float(0.12))] {
            pivot.position = SCNVector3(x, Self.hipY, 0)
            body.addChildNode(pivot)
            pivot.addChildNode(Self.box(0.19, 0.52, 0.21, chamfer: 0.05, color: pants, at: SCNVector3(0, -0.28, 0)))
            pivot.addChildNode(Self.box(0.21, 0.1, 0.3, chamfer: 0.04, color: shoes, at: SCNVector3(0, -0.57, 0.04)))
        }

        // Torso
        let torsoHeight: CGFloat = 0.6
        body.addChildNode(Self.box(0.5, torsoHeight, 0.3, chamfer: 0.09, color: shirt, at: SCNVector3(0, 0.88, 0)))
        switch look.top {
        case 1:
            // Hoodie: hood behind the neck and a front pocket
            body.addChildNode(Self.box(0.4, 0.16, 0.16, chamfer: 0.07, color: shirt.darker(0.1), at: SCNVector3(0, 1.17, -0.13)))
            body.addChildNode(Self.box(0.3, 0.13, 0.02, chamfer: 0.03, color: shirt.darker(0.15), at: SCNVector3(0, 0.74, 0.155)))
        case 2:
            // Jersey: a stripe and a number panel
            body.addChildNode(Self.box(0.51, 0.07, 0.31, chamfer: 0.02, color: .white, at: SCNVector3(0, 0.98, 0)))
            body.addChildNode(Self.box(0.16, 0.18, 0.02, chamfer: 0.02, color: .white, at: SCNVector3(0, 0.8, 0.155)))
        default:
            break
        }
        if look.chain {
            let chain = SCNTorus(ringRadius: 0.12, pipeRadius: 0.015)
            chain.firstMaterial = Self.material(UIColor(hex: 0xF5C542), metal: true)
            let node = SCNNode(geometry: chain)
            node.position = SCNVector3(0, 1.1, 0.06)
            node.eulerAngles = SCNVector3(1.2, 0, 0)
            body.addChildNode(node)
        }

        // Arms swing from the shoulders.
        let longSleeves = look.top == 1
        for (pivot, x) in [(leftArm, Float(-0.33)), (rightArm, Float(0.33))] {
            pivot.position = SCNVector3(x, Self.shoulderY, 0)
            body.addChildNode(pivot)
            pivot.addChildNode(Self.box(0.15, longSleeves ? 0.5 : 0.22, 0.17, chamfer: 0.05, color: shirt,
                                        at: SCNVector3(0, longSleeves ? -0.25 : -0.11, 0)))
            if !longSleeves {
                pivot.addChildNode(Self.box(0.12, 0.3, 0.13, chamfer: 0.05, color: skin, at: SCNVector3(0, -0.36, 0)))
            }
            let hand = SCNSphere(radius: 0.075)
            hand.firstMaterial = Self.material(skin)
            let handNode = SCNNode(geometry: hand)
            handNode.position = SCNVector3(0, -0.55, 0)
            pivot.addChildNode(handNode)
        }

        // Head
        let head = SCNNode()
        head.position = SCNVector3(0, 1.43, 0)
        body.addChildNode(head)
        head.addChildNode(Self.box(0.44, 0.44, 0.42, chamfer: 0.13, color: skin, at: SCNVector3(0, 0, 0)))
        for x in [Float(-0.095), Float(0.095)] {
            let eye = SCNSphere(radius: 0.035)
            eye.firstMaterial = Self.material(UIColor(white: 0.08, alpha: 1))
            let node = SCNNode(geometry: eye)
            node.position = SCNVector3(x, 0.02, 0.205)
            head.addChildNode(node)
        }
        head.addChildNode(Self.box(0.12, 0.025, 0.02, chamfer: 0.01, color: UIColor(white: 0.15, alpha: 1), at: SCNVector3(0, -0.1, 0.21)))
        if look.glasses {
            for x in [Float(-0.095), Float(0.095)] {
                let lens = SCNTorus(ringRadius: 0.055, pipeRadius: 0.012)
                lens.firstMaterial = Self.material(UIColor(white: 0.05, alpha: 1))
                let node = SCNNode(geometry: lens)
                node.position = SCNVector3(x, 0.02, 0.225)
                node.eulerAngles = SCNVector3(Float.pi / 2, 0, 0)
                head.addChildNode(node)
            }
        }

        if look.hat == 0 {
            addHair(to: head, color: hairColor)
        } else {
            if look.hair == 4 {
                head.addChildNode(Self.box(0.46, 0.5, 0.12, chamfer: 0.05, color: hairColor, at: SCNVector3(0, -0.1, -0.19)))
            }
            addHat(to: head, color: hatColor)
        }
    }

    private func addHair(to head: SCNNode, color: UIColor) {
        switch look.hair {
        case 0:
            head.addChildNode(Self.box(0.46, 0.08, 0.44, chamfer: 0.04, color: color, at: SCNVector3(0, 0.2, 0)))
        case 1:
            head.addChildNode(Self.box(0.47, 0.14, 0.45, chamfer: 0.06, color: color, at: SCNVector3(0, 0.2, -0.01)))
            head.addChildNode(Self.box(0.47, 0.25, 0.1, chamfer: 0.04, color: color, at: SCNVector3(0, 0.07, -0.18)))
        case 2:
            for (x, z) in [(-0.13, 0.1), (0.0, 0.12), (0.13, 0.1), (-0.12, -0.08), (0.02, -0.06), (0.14, -0.1)] {
                let curl = SCNSphere(radius: 0.11)
                curl.firstMaterial = Self.material(color)
                let node = SCNNode(geometry: curl)
                node.position = SCNVector3(Float(x), 0.22, Float(z))
                head.addChildNode(node)
            }
        case 3:
            let afro = SCNSphere(radius: 0.36)
            afro.firstMaterial = Self.material(color)
            let node = SCNNode(geometry: afro)
            node.position = SCNVector3(0, 0.17, -0.06)
            node.scale = SCNVector3(1, 0.85, 0.9)
            head.addChildNode(node)
        case 4:
            head.addChildNode(Self.box(0.48, 0.13, 0.45, chamfer: 0.06, color: color, at: SCNVector3(0, 0.21, -0.01)))
            head.addChildNode(Self.box(0.48, 0.62, 0.12, chamfer: 0.05, color: color, at: SCNVector3(0, -0.06, -0.19)))
            head.addChildNode(Self.box(0.06, 0.4, 0.3, chamfer: 0.02, color: color, at: SCNVector3(-0.24, -0.02, -0.06)))
            head.addChildNode(Self.box(0.06, 0.4, 0.3, chamfer: 0.02, color: color, at: SCNVector3(0.24, -0.02, -0.06)))
        case 5:
            head.addChildNode(Self.box(0.47, 0.12, 0.45, chamfer: 0.06, color: color, at: SCNVector3(0, 0.2, -0.01)))
            let bun = SCNSphere(radius: 0.12)
            bun.firstMaterial = Self.material(color)
            let node = SCNNode(geometry: bun)
            node.position = SCNVector3(0, 0.33, -0.08)
            head.addChildNode(node)
        default:
            break
        }
    }

    private func addHat(to head: SCNNode, color: UIColor) {
        switch look.hat {
        case 3:
            let beanie = SCNSphere(radius: 0.25)
            beanie.firstMaterial = Self.material(color)
            let node = SCNNode(geometry: beanie)
            node.position = SCNVector3(0, 0.16, 0)
            node.scale = SCNVector3(1, 0.72, 1)
            head.addChildNode(node)
            head.addChildNode(Self.box(0.48, 0.08, 0.46, chamfer: 0.04, color: color.darker(0.12), at: SCNVector3(0, 0.12, 0)))
        default:
            head.addChildNode(Self.box(0.47, 0.13, 0.45, chamfer: 0.06, color: color, at: SCNVector3(0, 0.22, 0)))
            let forward: Float = look.hat == 1 ? 1 : -1
            head.addChildNode(Self.box(0.36, 0.03, 0.2, chamfer: 0.01, color: color.darker(0.1), at: SCNVector3(0, 0.17, 0.3 * forward)))
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

    static func material(_ color: UIColor, emission: UIColor? = nil, metal: Bool = false) -> SCNMaterial {
        let material = SCNMaterial()
        material.lightingModel = .physicallyBased
        material.diffuse.contents = color
        material.roughness.contents = metal ? 0.3 : 0.75
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
        return UIColor(hue: h, saturation: s, brightness: max(0, b - amount), alpha: a)
    }
}
