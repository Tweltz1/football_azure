import AVFoundation
import CoreImage
import ImageIO
import Network
import SoundAnalysis
import UIKit

/// Runs on the spare iPhone mounted in the back seat. Shares a small picture, the baby's
/// sound and a Quiet / Moving / Crying guess with the driver's phone.
@MainActor
final class CameraStation: ObservableObject {
    @Published private(set) var preview: UIImage?
    @Published private(set) var mood: BabyMood = .quiet
    @Published private(set) var viewers = 0
    @Published private(set) var running = false
    @Published private(set) var problem: String?
    @Published private(set) var tooDark = false
    @Published private(set) var level: Float = 0

    let code: String
    private let rig = CaptureRig()
    private var listener: NWListener?
    private var links: [ObjectIdentifier: FramedConnection] = [:]
    private var paired: Set<ObjectIdentifier> = []
    private var lastCry = Date.distantPast
    private var lastMotion = Date.distantPast
    private var motionStreak = 0
    private var ticker: Timer?

    init() {
        let defaults = UserDefaults.standard
        if let saved = defaults.string(forKey: "cameraCode"), saved.count == 4 {
            code = saved
        } else {
            code = String(format: "%04d", Int.random(in: 0...9999))
            defaults.set(code, forKey: "cameraCode")
        }
    }

    var rotation: Int {
        get { UserDefaults.standard.object(forKey: "cameraRotation") as? Int ?? 90 }
        set {
            UserDefaults.standard.set(newValue, forKey: "cameraRotation")
            rig.rotation = newValue
            objectWillChange.send()
        }
    }

    var useFrontCamera: Bool {
        get { UserDefaults.standard.bool(forKey: "cameraFront") }
        set {
            UserDefaults.standard.set(newValue, forKey: "cameraFront")
            objectWillChange.send()
            if running { try? rig.startVideo(front: newValue) }
        }
    }

    func start() async {
        guard !running else { return }
        problem = nil
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            problem = "Camera access is off. Turn it on in Settings > Backseat View."
            return
        }
        let micAllowed = await withCheckedContinuation { done in
            AVAudioApplication.requestRecordPermission { done.resume(returning: $0) }
        }
        rig.rotation = rotation
        rig.onFrame = { [weak self] jpeg, motion, brightness in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.gotFrame(jpeg, motion: motion, brightness: brightness) } }
        }
        rig.onAudio = { [weak self] pcm, rms in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.gotAudio(pcm, rms: rms) } }
        }
        rig.onCry = { [weak self] score in
            DispatchQueue.main.async { MainActor.assumeIsolated { if score > 0.5 { self?.lastCry = Date() } } }
        }
        do {
            try rig.startVideo(front: useFrontCamera)
            if micAllowed { try rig.startAudio() } else { problem = "Microphone is off, so crying can't be heard. Turn it on in Settings > Backseat View." }
        } catch {
            problem = "Camera couldn't start: \(error.localizedDescription)"
            return
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        UIApplication.shared.isIdleTimerDisabled = true
        running = true
        listen()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    func stop() {
        ticker?.invalidate()
        ticker = nil
        listener?.cancel()
        listener = nil
        links.values.forEach { $0.cancel() }
        links.removeAll()
        paired.removeAll()
        viewers = 0
        rig.stop()
        UIApplication.shared.isIdleTimerDisabled = false
        running = false
    }

    // MARK: Network

    private func listen() {
        do {
            let listener = try NWListener(using: BVLink.parameters())
            listener.service = NWListener.Service(name: "Backseat Camera", type: BVLink.service)
            listener.newConnectionHandler = { [weak self] connection in
                MainActor.assumeIsolated { self?.accept(connection) }
            }
            listener.stateUpdateHandler = { [weak self] state in
                MainActor.assumeIsolated {
                    guard let self, self.running else { return }
                    if case .failed = state {
                        self.listener?.cancel()
                        self.listener = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            MainActor.assumeIsolated { if self.running && self.listener == nil { self.listen() } }
                        }
                    }
                }
            }
            listener.start(queue: .main)
            self.listener = listener
        } catch {
            problem = "Couldn't share the camera: \(error.localizedDescription)"
        }
    }

    private func accept(_ connection: NWConnection) {
        let link = FramedConnection(connection)
        let id = ObjectIdentifier(link)
        links[id] = link
        link.onPacket = { [weak self, weak link] type, payload in
            MainActor.assumeIsolated {
                guard let self, let link, type == .hello else { return }
                if String(decoding: payload, as: UTF8.self) == self.code {
                    self.paired.insert(id)
                    self.viewers = self.paired.count
                    link.send(.welcome)
                } else {
                    link.send(.denied)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { link.cancel() }
                }
            }
        }
        link.onState = { [weak self] state in
            MainActor.assumeIsolated {
                switch state {
                case .failed, .cancelled:
                    self?.links[id] = nil
                    self?.paired.remove(id)
                    self?.viewers = self?.paired.count ?? 0
                default: break
                }
            }
        }
        link.start()
    }

    private func broadcast(_ type: Packet, _ payload: Data) {
        for id in paired { links[id]?.send(type, payload) }
    }

    // MARK: Camera + microphone

    private func gotFrame(_ jpeg: Data, motion: Double, brightness: Double) {
        preview = UIImage(data: jpeg)
        tooDark = brightness < 0.06
        // Two busy pictures in a row counts as movement; one alone is usually a passing shadow.
        motionStreak = motion > 0.05 ? motionStreak + 1 : 0
        if motionStreak >= 2 { lastMotion = Date() }
        broadcast(.frame, jpeg)
    }

    private func gotAudio(_ pcm: Data, rms: Float) {
        level = rms
        broadcast(.audio, pcm)
    }

    private func tick() {
        let now = Date()
        if now.timeIntervalSince(lastCry) < 4 {
            mood = .crying
        } else if now.timeIntervalSince(lastMotion) < 8 {
            mood = .moving
        } else {
            mood = .quiet
        }
        let status = StatusMessage(mood: mood, level: level, dark: tooDark, battery: UIDevice.current.batteryLevel)
        if let data = try? JSONEncoder().encode(status) { broadcast(.status, data) }
    }
}

/// Camera + microphone capture. Works off the main thread; reports through callbacks.
final class CaptureRig: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    var onFrame: ((Data, Double, Double) -> Void)?
    var onAudio: ((Data, Float) -> Void)?
    var onCry: ((Double) -> Void)?
    var rotation = 90

    private let session = AVCaptureSession()
    private let videoQueue = DispatchQueue(label: "backseat.video")
    private let soundQueue = DispatchQueue(label: "backseat.sound")
    private let ci = CIContext(options: [.cacheIntermediates: false])
    private let engine = AVAudioEngine()
    private let cryListener = CryListener()
    private var analyzer: SNAudioStreamAnalyzer?
    private var lastFrameTime = 0.0
    private var lastTiny: [Double] = []

    func startVideo(front: Bool) throws {
        session.beginConfiguration()
        session.sessionPreset = .vga640x480
        session.automaticallyConfiguresApplicationAudioSession = false
        session.inputs.forEach { session.removeInput($0) }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: front ? .front : .back) else {
            session.commitConfiguration()
            throw NSError(domain: "BackseatView", code: 1, userInfo: [NSLocalizedDescriptionKey: "No camera found"])
        }
        if (try? device.lockForConfiguration()) != nil {
            if device.isLowLightBoostSupported { device.automaticallyEnablesLowLightBoostWhenAvailable = true }
            device.unlockForConfiguration()
        }
        let input = try AVCaptureDeviceInput(device: device)
        if session.canAddInput(input) { session.addInput(input) }
        if session.outputs.isEmpty {
            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            output.setSampleBufferDelegate(self, queue: videoQueue)
            if session.canAddOutput(output) { session.addOutput(output) }
        }
        session.commitConfiguration()
        let running = self.session
        videoQueue.async { if !running.isRunning { running.startRunning() } }
    }

    func startAudio() throws {
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try audio.setActive(true)
        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0, inFormat.channelCount > 0 else { return }

        // Apple's built-in sound classifier knows "baby_crying" and "crying_sobbing".
        let analyzer = SNAudioStreamAnalyzer(format: inFormat)
        let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
        cryListener.onScore = { [weak self] score in self?.onCry?(score) }
        try analyzer.add(request, withObserver: cryListener)
        self.analyzer = analyzer

        guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else { return }
        let soundQueue = self.soundQueue
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buffer, when in
            guard let self else { return }
            soundQueue.async { analyzer.analyze(buffer, atAudioFramePosition: when.sampleTime) }

            var rms: Float = 0
            if let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                var sum: Float = 0
                for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
                rms = (sum / Float(buffer.frameLength)).squareRoot()
            }

            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16_000 / inFormat.sampleRate) + 64
            guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
            var fed = false
            var error: NSError?
            converter.convert(to: out, error: &error) { _, status in
                if fed {
                    status.pointee = .noDataNow
                    return nil
                }
                fed = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, out.frameLength > 0, let channel = out.int16ChannelData?[0] else { return }
            let pcm = Data(bytes: channel, count: Int(out.frameLength) * 2)
            self.onAudio?(pcm, rms)
        }
        engine.prepare()
        try engine.start()
    }

    func stop() {
        let running = self.session
        videoQueue.async { if running.isRunning { running.stopRunning() } }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        analyzer?.removeAllRequests()
        analyzer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        let now = CACurrentMediaTime()
        guard now - lastFrameTime >= 0.5, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastFrameTime = now

        let orientation: CGImagePropertyOrientation
        switch rotation {
        case 90: orientation = .right
        case 180: orientation = .down
        case 270: orientation = .left
        default: orientation = .up
        }
        var image = CIImage(cvPixelBuffer: pixels).oriented(orientation)
        image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
        let width = image.extent.width, height = image.extent.height
        guard width > 0, height > 0 else { return }

        let scale = 480 / max(width, height)
        let quality = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
        guard let jpeg = ci.jpegRepresentation(of: image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
                                               colorSpace: CGColorSpaceCreateDeviceRGB(),
                                               options: [quality: 0.55]) else { return }

        // 32x24 brightness grid for movement and darkness checks.
        let tiny = image.transformed(by: CGAffineTransform(scaleX: 32 / width, y: 24 / height))
        var rgba = [UInt8](repeating: 0, count: 32 * 24 * 4)
        ci.render(tiny, toBitmap: &rgba, rowBytes: 32 * 4, bounds: CGRect(x: 0, y: 0, width: 32, height: 24),
                  format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        var luma = [Double]()
        luma.reserveCapacity(32 * 24)
        for i in stride(from: 0, to: rgba.count, by: 4) {
            luma.append((0.3 * Double(rgba[i]) + 0.59 * Double(rgba[i + 1]) + 0.11 * Double(rgba[i + 2])) / 255)
        }
        let mean = luma.reduce(0, +) / Double(luma.count)
        var motion = 0.0
        if lastTiny.count == luma.count {
            // Remove the overall brightness change first so streetlights and tunnels
            // don't count as the baby moving.
            let lastMean = lastTiny.reduce(0, +) / Double(lastTiny.count)
            var diff = 0.0
            for i in 0..<luma.count { diff += abs((luma[i] - mean) - (lastTiny[i] - lastMean)) }
            motion = diff / Double(luma.count)
        }
        lastTiny = luma
        onFrame?(jpeg, motion, mean)
    }
}

/// Receives the sound classifier's results and reports the crying confidence (0...1).
final class CryListener: NSObject, SNResultsObserving {
    var onScore: ((Double) -> Void)?

    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let result = result as? SNClassificationResult else { return }
        let baby = result.classification(forIdentifier: "baby_crying")?.confidence ?? 0
        let sobbing = result.classification(forIdentifier: "crying_sobbing")?.confidence ?? 0
        onScore?(max(baby, sobbing))
    }
}
