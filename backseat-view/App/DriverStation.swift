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

    var volume: Float {
        get { UserDefaults.standard.object(forKey: "babyVolume") as? Float ?? 0.6 }
        set { UserDefaults.standard.set(newValue, forKey: "babyVolume"); speaker.volume = newValue; objectWillChange.send() }
    }

    private let speaker = BabySpeaker()
    private let card = CarCard()
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
        status = "Looking for the camera phone..."
        speaker.volume = volume
        speaker.start()
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
            if !results.isEmpty { status = "Found a camera phone, but its code doesn't match. Check the code." }
            return
        }
        connect(to: result.endpoint)
    }

    private func connect(to endpoint: NWEndpoint) {
        status = "Connecting to the camera phone..."
        let link = FramedConnection(NWConnection(to: endpoint, using: BVLink.parameters()))
        self.link = link
        linkEndpoint = endpoint
        let speaker = self.speaker
        link.onPacket = { [weak self] type, payload in
            if type == .audio {
                speaker.play(payload)
                return
            }
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
            status = "The camera phone shows a different code. Check the code."
            dropLink()
        case .frame:
            lastSeen = Date()
            if let image = UIImage(data: payload) { picture = image }
            pushCard()
        case .status:
            lastSeen = Date()
            guard let message = try? JSONDecoder().decode(StatusMessage.self, from: payload) else { return }
            cameraBattery = message.battery
            cameraTooDark = message.dark
            if message.mood != mood {
                let startedCrying = message.mood == .crying
                mood = message.mood
                pushCard(force: true, alert: startedCrying && cryAlerts)
            }
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
        if connected { status = "Lost the camera phone. Reconnecting..." }
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
    private let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
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

    /// 16 kHz mono 16-bit samples from the camera phone.
    func play(_ pcm: Data) {
        let count = pcm.count / 2
        guard count > 0 else { return }
        lock.lock(); let backlog = queued; lock.unlock()
        if backlog > 6 { return } // fell behind: skip to stay live
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)),
              let out = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(count)
        pcm.withUnsafeBytes { raw in
            for i in 0..<count {
                out[i] = Float(Int16(littleEndian: raw.loadUnaligned(fromByteOffset: i * 2, as: Int16.self))) / 32_768
            }
        }
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
