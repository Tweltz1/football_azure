import AVFoundation
import CoreImage
import ImageIO
import Network
import SoundAnalysis
import UIKit

/// Runs on the spare iPhone mounted in the back seat. Shares a small picture, the baby's
/// sound and a Quiet / Moving / Crying guess with the driver's phone.
/// With `home` it is the "baby phone" of the home monitor. With `audioOnly` (the default there) it's
/// microphone only and keeps listening with the screen locked (background audio mode); with the
/// camera on it also sends the picture, which pauses while the phone is locked (iOS rule) but the
/// sound keeps going.
@MainActor
final class CameraStation: ObservableObject {
    @Published private(set) var preview: UIImage?
    @Published private(set) var mood: BabyMood = .quiet
    @Published private(set) var viewers = 0
    @Published private(set) var running = false
    @Published private(set) var problem: String?
    @Published private(set) var tooDark = false
    @Published private(set) var level: Float = 0
    /// A nearby phone tapped this one and is waiting for Allow / Don't Allow.
    @Published private(set) var request: (name: String, device: String)?
    private var requestLink: FramedConnection?

    let code: String
    let home: Bool
    private(set) var audioOnly: Bool
    private let rig = CaptureRig()
    private var listener: NWListener?
    private var links: [ObjectIdentifier: FramedConnection] = [:]
    private var paired: Set<ObjectIdentifier> = []
    private var lastCry = Date.distantPast
    private var lastMotion = Date.distantPast
    private var lastNoise = Date.distantPast
    private var motionStreak = 0
    private var ticker: Timer?
    /// Internet backup (home baby phone only): waits in its room and sends only while a parent
    /// phone away from home says it's listening.
    private var relay: InternetRelay?
    private var remoteListen = Date.distantPast
    private var lastRelayFrame = Date.distantPast
    private var lastRelayStatus = Date.distantPast
    /// A parent phone is listening over the internet right now.
    @Published private(set) var remoteViewer = false
    /// Soothing sound the parent started on this phone.
    @Published private(set) var music: Soothing?
    @Published private(set) var talking = false
    private var musicUntil: Date?
    private var lastTalk = Date.distantPast
    /// The car's own screen (Tesla browser), when this phone is the camera and the hotspot.
    let carScreen: CarScreen

    init(home: Bool = false) {
        self.home = home
        carScreen = CarScreen()
        audioOnly = home && !UserDefaults.standard.bool(forKey: "babyPhoneVideo")
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
            if running { try? rig.startVideo(front: newValue, night: nightView) }
        }
    }

    /// Night view: the Face ID (TrueDepth) camera's depth picture, lit by its own infrared light,
    /// so it works in total darkness. Front camera only; shows shapes in gray, not a color photo.
    static let nightViewAvailable = AVCaptureDevice.default(.builtInTrueDepthCamera, for: .video, position: .front) != nil

    var nightView: Bool {
        get { Self.nightViewAvailable && UserDefaults.standard.bool(forKey: "cameraNight") }
        set {
            UserDefaults.standard.set(newValue, forKey: "cameraNight")
            objectWillChange.send()
            if running {
                do { try rig.startVideo(front: useFrontCamera, night: newValue) }
                catch { problem = "Night view couldn't start: \(error.localizedDescription)" }
            }
        }
    }

    func start() async {
        guard !running else { return }
        problem = nil
        if !audioOnly {
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                problem = "Camera access is off. Turn it on in Settings > Stork View."
                return
            }
        }
        let micAllowed = await withCheckedContinuation { done in
            AVAudioApplication.requestRecordPermission { done.resume(returning: $0) }
        }
        if audioOnly && !micAllowed {
            problem = "Microphone access is off, so this phone can't listen. Turn it on in Settings > Stork View."
            return
        }
        rig.rotation = rotation
        rig.echoCancel = home
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
            if !audioOnly { try rig.startVideo(front: useFrontCamera, night: nightView) }
            if micAllowed { try rig.startAudio() } else { problem = "Microphone is off, so crying can't be heard. Turn it on in Settings > Stork View." }
        } catch {
            problem = audioOnly ? "The microphone couldn't start: \(error.localizedDescription)"
                                : "Camera couldn't start: \(error.localizedDescription)"
            return
        }
        UIDevice.current.isBatteryMonitoringEnabled = true
        // The baby phone may be locked (it keeps listening); the camera has to stay on screen.
        UIApplication.shared.isIdleTimerDisabled = !audioOnly
        running = true
        listen()
        if home && InternetRelay.available {
            let relay = InternetRelay(pass: .mine)
            relay.onPacket = { [weak self] type, payload in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    switch type {
                    case .hello: self.remoteListen = Date()
                    case .talk: self.hearParent(InternetRelay.grow(payload))
                    case .control: self.apply(payload)
                    default: break
                    }
                }
            }
            relay.start()
            self.relay = relay
        }
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    /// Home baby phone: switch the camera on or off (restarts the phone's side; the listening
    /// phone reconnects by itself).
    func setVideo(_ on: Bool) async {
        guard home else { return }
        UserDefaults.standard.set(on, forKey: "babyPhoneVideo")
        let wasRunning = running
        stop()
        audioOnly = !on
        preview = nil
        objectWillChange.send()
        if wasRunning { await start() }
    }

    func stop() {
        ticker?.invalidate()
        ticker = nil
        listener?.cancel()
        listener = nil
        music = nil
        musicUntil = nil
        talking = false
        request = nil
        requestLink = nil
        relay?.stop()
        relay = nil
        remoteViewer = false
        links.values.forEach { $0.cancel() }
        links.removeAll()
        paired.removeAll()
        viewers = 0
        rig.stop()
        UIApplication.shared.isIdleTimerDisabled = false
        running = false
        carScreen.show(mood: .offline, paused: false, phoneSound: false)
    }

    // MARK: Network

    private func listen() {
        do {
            let listener = try NWListener(using: BVLink.parameters())
            var txt = NWTXTRecord()
            txt["id"] = Pairing.myID()
            txt["kind"] = home ? "baby" : "car"
            listener.service = NWListener.Service(name: home ? "Baby Phone" : "Back-seat camera", type: BVLink.service, txtRecord: txt)
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
                guard let self, let link else { return }
                if type == .talk || type == .control {
                    guard self.paired.contains(id) else { return }
                    if type == .talk { self.hearParent(payload) } else { self.apply(payload) }
                    return
                }
                guard type == .hello else { return }
                if let join = try? JSONDecoder().decode(JoinRequest.self, from: payload) {
                    if let token = join.token, Pairing.allowed[join.device] == token {
                        self.welcome(link, answer: nil)
                    } else if self.request == nil {
                        // Ask on this phone, like AirDrop. No answer in a minute counts as no.
                        self.request = (name: join.name, device: join.device)
                        self.requestLink = link
                        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
                            MainActor.assumeIsolated { if self.requestLink === link { self.answer(false) } }
                        }
                    } else {
                        self.deny(link)
                    }
                } else if String(decoding: payload, as: UTF8.self) == self.code {
                    self.welcome(link, answer: nil)
                } else {
                    self.deny(link)
                }
            }
        }
        link.onState = { [weak self] state in
            MainActor.assumeIsolated {
                switch state {
                case .failed, .cancelled:
                    if let asking = self?.requestLink, ObjectIdentifier(asking) == id {
                        self?.request = nil
                        self?.requestLink = nil
                    }
                    self?.links[id] = nil
                    self?.paired.remove(id)
                    self?.viewers = self?.paired.count ?? 0
                default: break
                }
            }
        }
        link.start()
    }

    // MARK: Talk back + soothing sounds (from the parent phone)

    private func hearParent(_ pcm: Data) {
        lastTalk = Date()
        talking = true
        rig.playTalk(pcm)
    }

    private func apply(_ payload: Data) {
        guard let control = try? JSONDecoder().decode(ControlMessage.self, from: payload) else { return }
        let sound = control.music.flatMap(Soothing.init(rawValue:))
        let volume = control.volume ?? 0.5
        if sound != music {
            rig.setMusic(sound, volume: volume)
            music = sound
        } else {
            rig.setMusicVolume(volume)
        }
        musicUntil = sound != nil ? control.minutes.map { Date().addingTimeInterval(Double($0) * 60) } : nil
    }

    /// Stop the soothing sound from this phone.
    func stopMusic() {
        rig.setMusic(nil, volume: 0)
        music = nil
        musicUntil = nil
    }

    /// Allow / Don't Allow for the phone that tapped this one.
    func answer(_ allow: Bool) {
        guard let request, let link = requestLink else { return }
        self.request = nil
        requestLink = nil
        if allow {
            let token = Pairing.randomHex(16)
            Pairing.allowed[request.device] = token
            welcome(link, answer: JoinAnswer(id: Pairing.myID(), token: token))
        } else {
            deny(link)
        }
    }

    /// Forget every phone this one allowed (they'll have to ask again).
    func forgetPhones() {
        Pairing.allowed = [:]
        links.values.forEach { $0.cancel() }
    }

    private func welcome(_ link: FramedConnection, answer: JoinAnswer?) {
        let id = ObjectIdentifier(link)
        paired.insert(id)
        viewers = paired.count
        link.send(.welcome, answer.flatMap { try? JSONEncoder().encode($0) } ?? Data())
        // Hand the parent phone the internet backup's room + key (only ever over the local link).
        if home, InternetRelay.available, let pass = try? JSONEncoder().encode(InternetRelay.Pass.mine) {
            link.send(.relay, pass)
        }
    }

    private func deny(_ link: FramedConnection) {
        link.send(.denied)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { link.cancel() }
    }

    private func broadcast(_ type: Packet, _ payload: Data) {
        for id in paired { links[id]?.send(type, payload) }
    }

    // MARK: Camera + microphone

    private func gotFrame(_ jpeg: Data, motion: Double, brightness: Double) {
        preview = UIImage(data: jpeg)
        tooDark = brightness < 0.06
        // Two busy pictures in a row counts as movement; one alone is usually a passing shadow.
        // motion < 0: a between picture (faster pictures for the Tesla screen) with no movement check.
        if motion >= 0 {
            motionStreak = motion > 0.05 ? motionStreak + 1 : 0
            if motionStreak >= 2 { lastMotion = Date() }
        }
        broadcast(.frame, jpeg)
        if !home { carScreen.show(picture: jpeg) }
        if remoteViewer, Date().timeIntervalSince(lastRelayFrame) >= 4, let small = Self.small(jpeg) {
            lastRelayFrame = Date()
            relay?.send(.frame, small)
        }
    }

    /// A smaller, lower-quality picture for the internet backup (about 8-12 KB).
    private static func small(_ jpeg: Data) -> Data? {
        guard let image = UIImage(data: jpeg) else { return nil }
        let scale = 320 / max(image.size.width, image.size.height, 1)
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.jpegData(compressionQuality: 0.45)
    }

    private func gotAudio(_ pcm: Data, rms: Float) {
        level = rms
        if rms > SoundGate.Sensitivity.medium.threshold { lastNoise = Date() }
        broadcast(.audio, pcm)
        // Over the internet, sound only goes while there's a noise (and 8 s after), at 8 kHz.
        if remoteViewer, Date().timeIntervalSince(lastNoise) < 8 {
            relay?.send(.audio, InternetRelay.shrink(pcm))
        }
        if !home { carScreen.hear(pcm) }
    }

    private func tick() {
        // About 3 pictures a second while a parked Tesla is watching, otherwise 2.
        rig.frameInterval = carScreen.wantsFastPictures ? 0.33 : 0.5
        let now = Date()
        if now.timeIntervalSince(lastCry) < 4 {
            mood = .crying
        } else if home && now.timeIntervalSince(lastNoise) < 6 {
            mood = .noise
        } else if now.timeIntervalSince(lastMotion) < 8 {
            mood = .moving
        } else {
            mood = .quiet
        }
        if let musicUntil, now > musicUntil { stopMusic() }
        if talking && now.timeIntervalSince(lastTalk) > 1.5 { talking = false }
        let status = StatusMessage(mood: mood, level: level, dark: tooDark, battery: UIDevice.current.batteryLevel,
                                   music: music?.rawValue, talking: talking)
        if let data = try? JSONEncoder().encode(status) {
            broadcast(.status, data)
            remoteViewer = relay != nil && now.timeIntervalSince(remoteListen) < 15
            if remoteViewer, now.timeIntervalSince(lastRelayStatus) >= 2 {
                lastRelayStatus = now
                relay?.send(.status, data)
            }
        }
        if !home { carScreen.show(mood: mood, paused: false, phoneSound: false) }
    }
}

/// Camera + microphone capture. Works off the main thread; reports through callbacks.
final class CaptureRig: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureDepthDataOutputDelegate {
    var onFrame: ((Data, Double, Double) -> Void)?
    var onAudio: ((Data, Float) -> Void)?
    var onCry: ((Double) -> Void)?
    var rotation = 90

    private let session = AVCaptureSession()
    private let videoQueue = DispatchQueue(label: "backseat.video")
    private let soundQueue = DispatchQueue(label: "backseat.sound")
    private let ci = CIContext(options: [.cacheIntermediates: false])
    private let engine = AVAudioEngine()
    /// Home baby phone: Apple's echo cancelling, so its own lullaby and the parent's voice
    /// don't count as the baby making noise.
    var echoCancel = false
    private let talkPlayer = AVAudioPlayerNode()
    private let musicPlayer = AVAudioPlayerNode()
    private var musicCache: [Soothing: AVAudioPCMBuffer] = [:]
    private let cryListener = CryListener()
    private var analyzer: SNAudioStreamAnalyzer?
    private var lastFrameTime = 0.0
    private var lastTinyTime = 0.0
    /// Seconds between pictures (0.5 normally; shorter while a parked Tesla screen is watching).
    var frameInterval = 0.5
    private var nightMode = false
    private var lastTiny: [Double] = []
    private var interruptionObserver: NSObjectProtocol?

    func startVideo(front: Bool, night: Bool = false) throws {
        session.beginConfiguration()
        session.sessionPreset = .vga640x480
        session.automaticallyConfiguresApplicationAudioSession = false
        session.inputs.forEach { session.removeInput($0) }
        session.outputs.forEach { session.removeOutput($0) }
        let device: AVCaptureDevice?
        if night {
            device = AVCaptureDevice.default(.builtInTrueDepthCamera, for: .video, position: .front)
        } else {
            device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: front ? .front : .back)
        }
        guard let device else {
            session.commitConfiguration()
            throw NSError(domain: "BackseatView", code: 1, userInfo: [NSLocalizedDescriptionKey: night ? "This iPhone has no Face ID camera" : "No camera found"])
        }
        if !night, (try? device.lockForConfiguration()) != nil {
            if device.isLowLightBoostSupported { device.automaticallyEnablesLowLightBoostWhenAvailable = true }
            device.unlockForConfiguration()
        }
        let input = try AVCaptureDeviceInput(device: device)
        if session.canAddInput(input) { session.addInput(input) }
        nightMode = night
        // A video output is always attached (depth needs a running video stream); in night view its
        // color frames are ignored and the pictures come from the depth map instead.
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: videoQueue)
        if session.canAddOutput(output) { session.addOutput(output) }
        if night {
            let depth = AVCaptureDepthDataOutput()
            depth.isFilteringEnabled = true // fills small holes so the picture is smoother
            depth.alwaysDiscardsLateDepthData = true
            if session.canAddOutput(depth) { session.addOutput(depth) }
            depth.setDelegate(self, callbackQueue: videoQueue)
            depth.connection(with: .depthData)?.isEnabled = true
            // Sharpest depth the camera offers (more detail on the face).
            let best = device.activeFormat.supportedDepthDataFormats
                .filter { [kCVPixelFormatType_DepthFloat32, kCVPixelFormatType_DisparityFloat32]
                    .contains(CMFormatDescriptionGetMediaSubType($0.formatDescription)) }
                .max { CMVideoFormatDescriptionGetDimensions($0.formatDescription).width < CMVideoFormatDescriptionGetDimensions($1.formatDescription).width }
            if let best, (try? device.lockForConfiguration()) != nil {
                device.activeDepthDataFormat = best
                device.unlockForConfiguration()
            }
        }
        session.commitConfiguration()
        let running = self.session
        videoQueue.async { if !running.isRunning { running.startRunning() } }
    }

    /// Night view: turns the depth map into a gray picture, near = bright, far = dark (about 0.3 to 2.5 m).
    func depthDataOutput(_ output: AVCaptureDepthDataOutput, didOutput depthData: AVDepthData,
                         timestamp: CMTime, connection: AVCaptureConnection) {
        let now = CACurrentMediaTime()
        guard now - lastFrameTime >= frameInterval - 0.02 else { return }
        lastFrameTime = now
        let map = depthData.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32).depthDataMap
        CVPixelBufferLockBaseAddress(map, .readOnly)
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let rowBytes = CVPixelBufferGetBytesPerRow(map)
        guard let base = CVPixelBufferGetBaseAddress(map), width > 0, height > 0 else {
            CVPixelBufferUnlockBaseAddress(map, .readOnly)
            return
        }
        // Distance in meters per pixel (0 = no reading).
        let count = width * height
        var z = [Float](repeating: 0, count: count)
        for y in 0..<height {
            let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
            for x in 0..<width {
                let d = row[x]
                if d.isFinite, d > 0.2 { z[y * width + x] = 1 / d }
            }
        }
        CVPixelBufferUnlockBaseAddress(map, .readOnly)
        let gray = Self.nightPicture(z, width: width, height: height)
        guard let provider = CGDataProvider(data: Data(gray) as CFData),
              let cg = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: width,
                               space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                               provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return }
        process(CIImage(cgImage: cg), now: now, night: true)
    }

    /// Night view picture from distances: the contrast is fitted to the nearest ~50 cm (the baby, not
    /// the car behind), and relief shading lit from the upper left brings out eyes, nose and mouth.
    static func nightPicture(_ z: [Float], width: Int, height: Int) -> [UInt8] {
        let count = width * height
        var gray = [UInt8](repeating: 0, count: count)
        // Nearest thing in view (3rd percentile, so a few stray dots don't count).
        var sample = [Float]()
        sample.reserveCapacity(count / 16)
        var i = 0
        while i < count { if z[i] > 0 { sample.append(z[i]) }; i += 16 }
        guard sample.count > 20 else { return gray }
        sample.sort()
        let near = sample[sample.count * 3 / 100]
        let span: Float = 0.5

        // Light 3x3 smoothing so sensor noise doesn't look like texture.
        var smooth = z
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let c = y * width + x
                guard z[c] > 0 else { continue }
                var sum: Float = 0, n: Float = 0
                for dy in -1...1 {
                    for dx in -1...1 {
                        let v = z[c + dy * width + dx]
                        if v > 0, abs(v - z[c]) < 0.05 { sum += v; n += 1 }
                    }
                }
                smooth[c] = sum / n
            }
        }

        // Shading: surface tilt from neighbouring distances, lit from the upper left and front.
        let light: (Float, Float, Float) = (-0.45, -0.55, 0.7)
        let pixelAngle: Float = 1.0 / Float(width) // about 57 degrees across the picture
        let relief: Float = 2.5 // exaggerate small bumps (eyes, mouth)
        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let c = y * width + x
                let d = smooth[c]
                guard d > 0 else { continue }
                let l = smooth[c - 1], r = smooth[c + 1], u = smooth[c - width], b = smooth[c + width]
                let step = d * pixelAngle * 2
                let gx = (l > 0 && r > 0) ? (r - l) / step * relief : 0
                let gy = (u > 0 && b > 0) ? (b - u) / step * relief : 0
                let norm = (gx * gx + gy * gy + 1).squareRoot()
                let shade = max(0, (-gx * light.0 - gy * light.1 + light.2) / norm)
                let closeness = min(max(1 - (d - near) / span, 0), 1)
                // Things far behind the baby fade to dark so the face stands out.
                let value = closeness * (0.25 + 0.75 * shade)
                gray[c] = UInt8(min(255, 20 + 235 * value))
            }
        }
        return gray
    }

    func startAudio() throws {
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try audio.setActive(true)
        let input = engine.inputNode
        if echoCancel {
            try? input.setVoiceProcessingEnabled(true)
            input.isVoiceProcessingAGCEnabled = false
        }
        if !engine.attachedNodes.contains(talkPlayer) {
            engine.attach(talkPlayer)
            engine.attach(musicPlayer)
            engine.connect(talkPlayer, to: engine.mainMixerNode, format: BabySpeaker.format)
            engine.connect(musicPlayer, to: engine.mainMixerNode, format: BabySpeaker.format)
        }
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
        // A phone call or alarm stops the microphone; start it again when it's over.
        if interruptionObserver == nil {
            interruptionObserver = NotificationCenter.default.addObserver(
                forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
            ) { [weak self] note in
                guard let self,
                      let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
                try? AVAudioSession.sharedInstance().setActive(true)
                if !self.engine.isRunning { self.engine.prepare(); try? self.engine.start() }
            }
        }
    }

    func stop() {
        let running = self.session
        videoQueue.async { if running.isRunning { running.stopRunning() } }
        if let interruptionObserver { NotificationCenter.default.removeObserver(interruptionObserver) }
        interruptionObserver = nil
        engine.inputNode.removeTap(onBus: 0)
        talkPlayer.stop()
        musicPlayer.stop()
        engine.stop()
        analyzer?.removeAllRequests()
        analyzer = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Plays the parent's voice (16 kHz mono 16-bit) through this phone's speaker.
    func playTalk(_ pcm: Data) {
        guard engine.isRunning, let buffer = BabySpeaker.decode(pcm) else { return }
        talkPlayer.volume = 1
        talkPlayer.scheduleBuffer(buffer)
        if !talkPlayer.isPlaying { talkPlayer.play() }
    }

    /// Starts (or with nil stops) a soothing sound, looping.
    func setMusic(_ sound: Soothing?, volume: Float) {
        musicPlayer.stop()
        guard let sound, engine.isRunning else { return }
        if musicCache[sound] == nil { musicCache[sound] = sound.makeBuffer() }
        guard let buffer = musicCache[sound] else { return }
        musicPlayer.volume = volume
        musicPlayer.scheduleBuffer(buffer, at: nil, options: .loops)
        musicPlayer.play()
    }

    func setMusicVolume(_ volume: Float) { musicPlayer.volume = volume }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard !nightMode else { return }
        let now = CACurrentMediaTime()
        guard now - lastFrameTime >= frameInterval - 0.02, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastFrameTime = now
        process(CIImage(cvPixelBuffer: pixels), now: now, night: false)
    }

    /// Turns one camera (or night view) picture into the shared JPEG + movement + brightness check.
    private func process(_ source: CIImage, now: CFTimeInterval, night: Bool) {
        let orientation: CGImagePropertyOrientation
        switch rotation {
        case 90: orientation = .right
        case 180: orientation = .down
        case 270: orientation = .left
        default: orientation = .up
        }
        var image = source.oriented(orientation)
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
        // Night view lights the scene itself, so it's never "too dark".
        let mean = luma.reduce(0, +) / Double(luma.count)
        let brightness = night ? 1 : mean
        // Movement is always measured over about half a second, however often pictures are taken.
        guard now - lastTinyTime >= 0.45 else {
            onFrame?(jpeg, -1, brightness)
            return
        }
        lastTinyTime = now
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
        onFrame?(jpeg, motion, brightness)
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
