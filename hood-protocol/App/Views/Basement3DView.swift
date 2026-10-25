import SceneKit
import SwiftUI

/// The 3D basement in SwiftUI. `night` runs from 0 (8 PM) to 1 (sunrise).
struct Basement3DView: View {
    var guests: [Guest3D]
    var night: Double = 0
    var showClock = false

    var body: some View {
        BasementSceneView(guests: guests, night: night)
            .aspectRatio(1.4, contentMode: .fit)
            .overlay(alignment: .topLeading) {
                if showClock {
                    Text(Self.clock(night))
                        .font(.system(size: 15, weight: .black, design: .monospaced))
                        .foregroundStyle(Color(red: 1, green: 0.35, blue: 0.3))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 6))
                        .padding(8)
                }
            }
    }

    /// "8:00 PM" at the start of the night, close to 6 AM by the end.
    static func clock(_ night: Double) -> String {
        let minutes = 20 * 60 + Int(night * 9.7 * 60)
        let hour24 = (minutes / 60) % 24
        let hour = hour24 % 12 == 0 ? 12 : hour24 % 12
        return String(format: "%d:%02d %@", hour, minutes % 60, hour24 < 12 ? "AM" : "PM")
    }
}

private struct BasementSceneView: UIViewRepresentable {
    var guests: [Guest3D]
    var night: Double

    func makeCoordinator() -> BasementWorld { BasementWorld() }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero)
        view.scene = context.coordinator.scene
        view.pointOfView = context.coordinator.camera
        view.backgroundColor = .black
        view.antialiasingMode = .multisampling4X
        view.preferredFramesPerSecond = 30
        view.isPlaying = true
        view.rendersContinuously = true
        view.allowsCameraControl = false
        context.coordinator.update(guests: guests, night: night)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        context.coordinator.update(guests: guests, night: night)
    }

    static func dismantleUIView(_ view: SCNView, coordinator: BasementWorld) {
        coordinator.stop()
        view.isPlaying = false
    }
}

/// One character on a turntable, for the appearance editor.
struct CharacterPreview: UIViewRepresentable {
    var look: Look

    final class Coordinator {
        let scene = SCNScene()
        let stand = SCNNode()
        var character: CharacterNode?
        var look: Look?

        init() {
            scene.background.contents = UIColor(hex: 0x111318)
            let camera = SCNNode()
            camera.camera = SCNCamera()
            camera.camera?.fieldOfView = 32
            camera.position = SCNVector3(0, 1.3, 4.4)
            camera.look(at: SCNVector3(0, 0.95, 0))
            camera.name = "camera"
            scene.rootNode.addChildNode(camera)

            let key = SCNNode()
            key.light = SCNLight()
            key.light?.type = .directional
            key.light?.intensity = 900
            key.light?.castsShadow = true
            key.eulerAngles = SCNVector3(-0.8, 0.5, 0)
            scene.rootNode.addChildNode(key)
            let fill = SCNNode()
            fill.light = SCNLight()
            fill.light?.type = .ambient
            fill.light?.intensity = 450
            fill.light?.color = UIColor(red: 0.7, green: 0.65, blue: 1, alpha: 1)
            scene.rootNode.addChildNode(fill)

            let disc = SCNCylinder(radius: 0.8, height: 0.06)
            disc.firstMaterial = CharacterNode.material(UIColor(hex: 0x8B6CFF).darker(0.35))
            let discNode = SCNNode(geometry: disc)
            discNode.position = SCNVector3(0, -0.03, 0)
            stand.addChildNode(discNode)
            scene.rootNode.addChildNode(stand)
            stand.runAction(.repeatForever(.rotateBy(x: 0, y: CGFloat.pi * 2, z: 0, duration: 9)))
        }

        func show(_ look: Look) {
            guard look != self.look else { return }
            self.look = look
            character?.removeFromParentNode()
            let node = CharacterNode(look: look)
            stand.addChildNode(node)
            character = node
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero)
        view.scene = context.coordinator.scene
        view.pointOfView = context.coordinator.scene.rootNode.childNode(withName: "camera", recursively: false)
        view.antialiasingMode = .multisampling4X
        view.isPlaying = true
        view.rendersContinuously = true
        context.coordinator.show(look)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        context.coordinator.show(look)
    }
}
