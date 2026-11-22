import ActivityKit
import AVFoundation
import Network
import UIKit

/// Runs on the driver's iPhone. Finds the camera phone, shows its picture, plays the baby's
/// sound through the car, and keeps the baby card on the CarPlay Dashboard / Lock Screen up to date.
/// Playing the baby's sound is also what keeps the app running while the phone is locked.
@MainActor
final class DriverStation: ObservableObject {
    @Published private(set) var picture: UIImage?
    @Published private(set) var mood: BabyMood = .offline
    @Published private(set) var status = "Not started"
    @Published private(set) var running = false
    @Published private(set) var connected = false
    @Published private(set) var lastSeen: Date?
    @Published private(set) var cameraBattery: Float = -1
    @Published private(set) var cameraTooDark = false
    @Published private(set) var cardProblem: String?

    var showPictureInCar: Bool {
        get { UserDefaults.standard.object(forKey: "showPictureInCar") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "showPictureInCar"); objectWillChange.send(); pushCard(force: true) }
    }

    var cryAlerts: Bool {
        get { UserDefaults.standard.object(forKey: "cryAlerts") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "cryAlerts"); objectWillChange.send() }
    }

    /// Quarter turns applied to the camera's picture (the mini camera can be mounted any way up).
    var turns: Int {
        get { UserDefaults.standard.integer(forKey: "pictureTurns") }
        set { UserDefaults.standard.set(newValue % 4, forKey: "pictureTurns"); objectWillChange.send() }
    }

    var volume: Float {
        get { UserDefaults.standard.object(forKey: "babyVolume") as? Float ?? 0.6 }
        set { UserDefaults.standard.set(newValue, forKey: "babyVolume"); speaker.volume = newValue; objectWillChange.send() }
    }

    private let speaker = BabySpeaker()
    private let card = CarCard()
    private let watcher = BabyWatcher(format: BabySpeaker.format)
    private var lastCry = Date.distantPast
    private var lastMotion = Date.distantPast
    private var motionStreak = 0
    private var hotspotTries: [NWConnection] = []
    private var lookingSince = Date()
    private var browser: NWBrowser?
    private var link: FramedConnection?
    private var linkEndpoint: NWEndpoint?
    private var wrongCode: Set<NWEndpoint> = []
    private var code = ""
    private var ticker: Timer?

    func start(code: String) {
        guard !running else { return }
        self.code = code
        wrongCode.removeAll()
        running = true
        status = "Looking for the camera..."
        speaker.volume = volume
        speaker.start()
        lastCry = .distantPast
        lastMotion = .distantPast
        lookingSince = Date()
        watcher.onCry = { [weak self] score in
            guard score > 0.5 else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.lastCry = Date() } }
        }
        watcher.onPicture = { [weak self] motion, brightness in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.cameraTooDark = brightness < 0.06
                    self.motionStreak = motion > 0.05 ? self.motionStreak + 1 : 0
                    if self.motionStreak >= 2 { self.lastMotion = Date() }
                }
            }
        }
        browse()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        UIApplication.shared.isIdleTimerDisabled = true
        pushCard(force: true)
    }

    func stop() {
        running = false
        ticker?.invalidate()
        ticker = nil
        browser?.cancel()
        browser = nil
        dropLink()
        speaker.stop()
        card.end()
        connected = false
        mood = .offline
        picture = nil
        status = "Not started"
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: Finding and talking to the camera phone

    private func browse() {
        let browser = NWBrowser(for: .bonjour(type: BVLink.service, domain: nil), using: BVLink.parameters())
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            MainActor.assumeIsolated { self?.pickCamera(from: results) }
        }
        browser.stateUpdateHandler = { [weak self] state in
            MainActor.assumeIsolated {
                guard let self, self.running else { return }
                if case .failed = state {
                    self.browser?.cancel()
                    self.browser = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        MainActor.assumeIsolated { if self.running && self.browser == nil { self.browse() } }
                    }
                }
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    private func pickCamera(from results: Set<NWBrowser.Result>) {
        guard running, link == nil else { return }
        guard let result = results.first(where: { !wrongCode.contains($0.endpoint) }) else {
            tryHotspotAddresses()
            if !results.isEmpty { status = "Found a camera, but its code doesn't match. Check the code." }
            return
        }
        connect(to: result.endpoint)
    }

    /// iPhone Personal Hotspot hands out 172.20.10.2-14. If Bonjour doesn't find the mini camera
    /// within a few seconds, knock on each of those addresses directly.
    private func tryHotspotAddresses() {
        guard running, link == nil, hotspotTries.isEmpty, Date().timeIntervalSince(lookingSince) > 4 else { return }
        for last in 2...14 {
            let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host("172.20.10.\(last)"), port: 8765)
            let tcp = NWProtocolTCP.Options()
            tcp.connectionTimeout = 3
            let attempt = NWConnection(to: endpoint, using: NWParameters(tls: nil, tcp: tcp))
            attempt.stateUpdateHandler = { [weak self, weak attempt] state in
                MainActor.assumeIsolated {
                    guard let self, let attempt else { return }
                    switch state {
                    case .ready:
                        let found = self.link == nil && self.running
                        self.hotspotTries.forEach { $0.cancel() }
                        self.hotspotTries.removeAll()
                        if found { self.connect(to: endpoint) }
                    case .failed, .cancelled:
                        self.hotspotTries.removeAll { $0 === attempt }
                    case .waiting:
                        attempt.cancel()
                    default:
                        break
                    }
                }
            }
            hotspotTries.append(attempt)
            attempt.start(queue: .main)
        }
    }

    private func connect(to endpoint: NWEndpoint) {
        status = "Connecting to the camera..."
        let link = FramedConnection(NWConnection(to: endpoint, using: BVLink.parameters()))
        self.link = link
        linkEndpoint = endpoint
        let speaker = self.speaker
        let watcher = self.watcher
        link.onPacket = { [weak self] type, payload in
            if type == .audio {
                if let sound = BabySpeaker.decode(payload) {
                    speaker.play(sound)
                    watcher.hear(sound)
                }
                return
            }
            if type == .frame { watcher.look(at: payload) }
            MainActor.assumeIsolated { self?.handle(type, payload) }
        }
        link.onState = { [weak self, weak link] state in
            MainActor.assumeIsolated {
                guard let self, let link, link === self.link else { return }
                switch state {
                case .ready:
                    link.send(.hello, Data(self.code.utf8))
                case .failed, .cancelled:
                    self.lostCamera()
                default:
                    break
                }
            }
        }
        link.start()
    }

    private func handle(_ type: Packet, _ payload: Data) {
        switch type {
        case .welcome:
            connected = true
            lastSeen = Date()
            status = "Connected"
        case .denied:
            if let linkEndpoint { wrongCode.insert(linkEndpoint) }
            status = "That camera wants a different code. Check the code on the camera iPhone or iPad."
            dropLink()
        case .frame:
            lastSeen = Date()
            if let image = UIImage(data: payload) { picture = turned(image) }
            pushCard()
        case .status:
            lastSeen = Date()
            guard let message = try? JSONDecoder().decode(StatusMessage.self, from: payload) else { return }
            cameraBattery = message.battery
        default:
            break
        }
    }

    private func dropLink() {
        let old = link
        link = nil
        linkEndpoint = nil
        old?.cancel()
    }

    private func lostCamera() {
        dropLink()
        guard running else { return }
        if connected { status = "Lost the camera. Reconnecting..." }
        connected = false
        if mood != .offline {
            mood = .offline
            pushCard(force: true)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            MainActor.assumeIsolated {
                guard self.running, self.link == nil, let browser = self.browser else { return }
                self.pickCamera(from: browser.browseResults)
            }
        }
    }

    private func tick() {
        speaker.keepAlive()
        if connected, let lastSeen, Date().timeIntervalSince(lastSeen) > 8 {
            lostCamera()
        }
        if running, link == nil, let browser { pickCamera(from: browser.browseResults) }
        guard connected else { return }
        let now = Date()
        let newMood: BabyMood
        if now.timeIntervalSince(lastCry) < 4 {
            newMood = .crying
        } else if now.timeIntervalSince(lastMotion) < 8 {
            newMood = .moving
        } else {
            newMood = .quiet
        }
        if newMood != mood {
            mood = newMood
            pushCard(force: true, alert: newMood == .crying && cryAlerts)
        }
    }

    private func turned(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage else { return image }
        let orientation: UIImage.Orientation = [.up, .right, .down, .left][turns % 4]
        return UIImage(cgImage: cg, scale: 1, orientation: orientation)
    }

    private func pushCard(force: Bool = false, alert: Bool = false) {
        guard running else { return }
        let error = card.update(mood: mood, picture: showPictureInCar ? picture : nil, force: force, alert: alert)
        if let error { cardProblem = error }
    }
}

/// Plays the camera phone's microphone through whatever the iPhone is connected to (CarPlay = car speakers).
final class BabySpeaker {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    static let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
    private let format = BabySpeaker.format
    private let lock = NSLock()
    private var queued = 0
    private var observers: [NSObjectProtocol] = []

    var volume: Float = 0.6 {
        didSet { player.volume = volume }
    }

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func start() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in self?.restart() },
            center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in self?.restart() },
        ]
        restart()
    }

    func stop() {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        player.stop()
        engine.stop()
        lock.lock(); queued = 0; lock.unlock()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func restart() {
        guard !observers.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        if !engine.isRunning {
            engine.prepare()
            try? engine.start()
        }
        player.volume = volume
        if !player.isPlaying { player.play() }
    }

    /// Turns the camera's 16 kHz mono 16-bit samples into a playable buffer.
    static func decode(_ pcm: Data) -> AVAudioPCMBuffer? {
        let count = pcm.count / 2
        guard count > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let out = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = AVAudioFrameCount(count)
        pcm.withUnsafeBytes { raw in
            for i in 0..<count {
                out[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32_768
            }
        }
        return buffer
    }

    func play(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); let backlog = queued; lock.unlock()
        if backlog > 6 { return } // fell behind: skip to stay live
        schedule(buffer)
    }

    /// Fills gaps with a little silence so the sound (and so the app) keeps running while locked.
    func keepAlive() {
        lock.lock(); let backlog = queued; lock.unlock()
        guard backlog < 2, let silence = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_000) else { return }
        silence.frameLength = 4_000
        if let out = silence.floatChannelData?[0] { out.update(repeating: 0, count: 4_000) }
        schedule(silence)
    }

    private func schedule(_ buffer: AVAudioPCMBuffer) {
        guard engine.isRunning else { return }
        lock.lock(); queued += 1; lock.unlock()
        player.scheduleBuffer(buffer) { [weak self] in
            guard let self else { return }
            self.lock.lock(); self.queued -= 1; self.lock.unlock()
        }
        if !player.isPlaying { player.play() }
    }
}

/// The baby card (Live Activity). CarPlay in iOS 26 shows it on the Dashboard by itself.
@MainActor
final class CarCard {
    private var activity: Activity<BabyActivityAttributes>?
    private var lastSent = Date.distantPast

    init() {
        // Clear any card left behind by an earlier run.
        for old in Activity<BabyActivityAttributes>.activities {
            Task { await old.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// Returns a message for the user when the card can't be shown.
    func update(mood: BabyMood, picture: UIImage?, force: Bool, alert: Bool) -> String? {
        let now = Date()
        guard force || now.timeIntervalSince(lastSent) >= 4 else { return nil }
        lastSent = now
        let state = BabyActivityAttributes.ContentState(mood: mood, thumb: picture.flatMap(Self.tinyJPEG), updated: now)
        let content = ActivityContent(state: state, staleDate: now.addingTimeInterval(60))
        if let activity {
            let sound = alert ? AlertConfiguration(title: "Baby is crying", body: "Backseat View hears crying.", sound: .default) : nil
            Task { await activity.update(content, alertConfiguration: sound) }
            return nil
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return "Live Activities are off for Backseat View. Turn them on in Settings > Backseat View so the baby card can show in your car."
        }
        do {
            activity = try Activity.request(attributes: BabyActivityAttributes(seatName: "Back seat"), content: content, pushType: nil)
            return nil
        } catch {
            return "The baby card couldn't start: \(error.localizedDescription)"
        }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        lastSent = .distantPast
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    /// Live Activity data must stay under 4 KB in total, so the car picture is a tiny JPEG.
    static func tinyJPEG(_ image: UIImage) -> Data? {
        guard image.size.width > 0, image.size.height > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        for width in [128.0, 100.0, 80.0] {
            let size = CGSize(width: width, height: (width * image.size.height / image.size.width).rounded())
            let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: size))
            }
            for quality in [0.55, 0.4, 0.25, 0.12] {
                if let data = small.jpegData(compressionQuality: quality), data.count <= 2_300 { return data }
            }
        }
        return nil
    }
}
