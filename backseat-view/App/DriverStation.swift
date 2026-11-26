import ActivityKit
import AVFoundation
import Network
import UIKit
import UserNotifications

/// Runs on the driver's iPhone. Finds the camera phone, shows its picture, plays the baby's
/// sound through the car, and keeps the baby card on the CarPlay Dashboard / Lock Screen up to date.
/// Playing the baby's sound is also what keeps the app running while the phone is locked.
/// With `home` it is the parent's side of the home sound monitor: it listens to the baby phone,
/// either all the time or only when there's a noise, and the card says "Baby's room".
@MainActor
final class DriverStation: ObservableObject {
    enum SoundMode: String, CaseIterable {
        case always, noiseOnly

        var title: String { self == .always ? "All the time" : "Only when there's a noise" }
    }

    @Published private(set) var picture: UIImage?
    @Published private(set) var mood: BabyMood = .offline
    @Published private(set) var status = "Not started"
    @Published private(set) var running = false
    @Published private(set) var connected = false
    @Published private(set) var lastSeen: Date?
    @Published private(set) var cameraBattery: Float = -1
    @Published private(set) var cameraTooDark = false
    @Published private(set) var cardProblem: String?
    /// Home monitor: true while the baby's sound is coming through (always true in "All the time").
    @Published private(set) var hearing = false
    /// Pictures were coming in but stopped (usually the camera phone locked). Sound may still be live.
    @Published private(set) var picturePaused = false
    /// How the phones are connected right now.
    enum Route: Equatable {
        /// Through the home Wi-Fi router.
        case wifi
        /// Straight to each other (Apple peer-to-peer Wi-Fi, like AirDrop). Happens by itself when the router drops.
        case direct
        /// Over the internet relay (parent phone away from home, on cellular or other Wi-Fi).
        case internet

        var label: String? {
            switch self {
            case .wifi: return nil
            case .direct: return "phone to phone"
            case .internet: return "over the internet"
            }
        }
    }

    @Published private(set) var route: Route?
    /// Short pop-up text when the connection route changes ("Now connected phone to phone").
    @Published private(set) var routeNotice: String?
    /// The route of the last working connection, to spot a switch.
    private var lastRoute: Route?
    /// Local link (Wi-Fi or phone to phone) is up and paired.
    private var localUp = false
    /// Internet backup is bringing the baby phone's packets.
    private var relayUp = false
    private var relay: InternetRelay?
    private var lastListenSent = Date.distantPast
    /// This parent phone has the baby phone's internet pass (it gets it the first time they connect at home).
    @Published private(set) var awayReady = InternetRelay.Pass.saved != nil
    private var lastFrame: Date?
    private var lostSince: Date?

    let home: Bool
    private var other: String { home ? "baby phone" : "camera" }

    init(home: Bool = false) {
        self.home = home
        carScreen = CarScreen()
        card = CarCard(place: home ? "Baby's room" : "Back seat")
    }

    var soundMode: SoundMode {
        get { SoundMode(rawValue: UserDefaults.standard.string(forKey: "homeSoundMode") ?? "") ?? .noiseOnly }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "homeSoundMode"); objectWillChange.send() }
    }

    var sensitivity: SoundGate.Sensitivity {
        get { SoundGate.Sensitivity(rawValue: UserDefaults.standard.object(forKey: "homeSensitivity") as? Int ?? 1) ?? .medium }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "homeSensitivity"); gate.sensitivity = newValue; objectWillChange.send() }
    }

    var fussAlerts: Bool {
        get { UserDefaults.standard.object(forKey: "homeFussAlerts") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "homeFussAlerts"); objectWillChange.send() }
    }

    @Published private(set) var notificationsOff = false
    private let notifier = BabyNotifier()

    var motionAlerts: Bool {
        get { UserDefaults.standard.object(forKey: "homeMotionAlerts") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "homeMotionAlerts"); objectWillChange.send() }
    }

    var noiseAlerts: Bool {
        get { UserDefaults.standard.object(forKey: "homeNoiseAlerts") as? Bool ?? false }
        set { UserDefaults.standard.set(newValue, forKey: "homeNoiseAlerts"); objectWillChange.send() }
    }

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
    private let card: CarCard
    private let gate = SoundGate()
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
    /// The car's own screen (Tesla browser). This phone plays the baby's sound itself.
    let carScreen: CarScreen

    func start(code: String) {
        lastRoute = nil
        guard !running else { return }
        self.code = code
        gate.reset()
        gate.sensitivity = sensitivity
        if home {
            Task { [weak self] in
                let allowed = await BabyNotifier.ask()
                self?.notificationsOff = !allowed
            }
        }
        wrongCode.removeAll()
        running = true
        status = "Looking for the \(other)..."
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
        startRelay()
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
        relay?.stop()
        relay = nil
        localUp = false
        relayUp = false
        route = nil
        speaker.stop()
        card.end()
        connected = false
        hearing = false
        mood = .offline
        picture = nil
        picturePaused = false
        lastFrame = nil
        status = "Not started"
        carScreen.show(mood: .offline, paused: false, phoneSound: true)
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
            if !results.isEmpty { status = "Found a \(other), but its code doesn't match. Check the code." }
            return
        }
        connect(to: result.endpoint)
    }

    /// iPhone Personal Hotspot hands out 172.20.10.2-14. If Bonjour doesn't find the mini camera
    /// within a few seconds, knock on each of those addresses directly.
    private func tryHotspotAddresses() {
        guard !home, running, link == nil, hotspotTries.isEmpty, Date().timeIntervalSince(lookingSince) > 4 else { return }
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
        status = "Connecting to the \(other)..."
        let link = FramedConnection(NWConnection(to: endpoint, using: BVLink.parameters()))
        self.link = link
        linkEndpoint = endpoint
        link.onPacket = { [weak self] type, payload in
            MainActor.assumeIsolated {
                guard let self else { return }
                if type == .audio { self.takeAudio(payload); return }
                if type == .frame { self.watcher.look(at: payload) }
                self.handle(type, payload)
            }
        }
        link.onState = { [weak self, weak link] state in
            MainActor.assumeIsolated {
                guard let self, let link, link === self.link else { return }
                switch state {
                case .ready:
                    self.route = Self.isDirect(link.connection.currentPath) ? .direct : .wifi
                    link.send(.hello, Data(self.code.utf8))
                case .failed, .cancelled:
                    self.lostCamera()
                default:
                    break
                }
            }
        }
        // If the Wi-Fi router drops, the old route dies quietly. Notice within ~2 s and reconnect,
        // which picks the direct phone-to-phone route (Bonjour also advertises over peer-to-peer Wi-Fi).
        link.connection.viabilityUpdateHandler = { [weak self, weak link] viable in
            guard !viable else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                MainActor.assumeIsolated {
                    guard let self, let link, link === self.link,
                          link.connection.currentPath?.status != .satisfied || !Self.viable(link) else { return }
                    self.lostCamera()
                }
            }
        }
        link.connection.pathUpdateHandler = { [weak self, weak link] path in
            MainActor.assumeIsolated {
                guard let self, let link, link === self.link else { return }
                guard self.localUp else { return }
                self.route = Self.isDirect(path) ? .direct : .wifi
                self.announceRoute()
            }
        }
        link.start()
    }

    /// Pops up "Now connected ..." when the route differs from the last working one.
    private func announceRoute() {
        guard let route else { return }
        defer { lastRoute = route }
        guard let before = lastRoute, before != route else { return }
        let text: String
        switch route {
        case .direct: text = before == .wifi ? "Wi-Fi dropped. Now connected phone to phone." : "Now connected phone to phone."
        case .internet: text = "Now connected over the internet."
        case .wifi: text = "Now connected over Wi-Fi again."
        }
        routeNotice = text
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            MainActor.assumeIsolated { if self.routeNotice == text { self.routeNotice = nil } }
        }
        if home, UIApplication.shared.applicationState != .active {
            tell(title: "Baby monitor still connected", body: text, kind: "route")
        }
    }

    private static func viable(_ link: FramedConnection) -> Bool {
        link.connection.state == .ready && link.connection.currentPath?.status == .satisfied
    }

    /// Apple's peer-to-peer Wi-Fi shows up as an "awdl"/"llw" interface.
    private static func isDirect(_ path: NWPath?) -> Bool {
        guard let path else { return false }
        return path.availableInterfaces.first.map { $0.name.hasPrefix("awdl") || $0.name.hasPrefix("llw") } ?? false
    }

    private func handle(_ type: Packet, _ payload: Data) {
        switch type {
        case .welcome:
            localUp = true
            relayUp = false
            connected = true
            lostSince = nil
            lastSeen = Date()
            if route == nil || route == .internet { route = .wifi }
            status = route == .direct ? "Connected phone to phone" : "Connected"
            announceRoute()
        case .relay:
            guard home, let pass = try? JSONDecoder().decode(InternetRelay.Pass.self, from: payload) else { return }
            if InternetRelay.Pass.saved != pass {
                InternetRelay.Pass.saved = pass
                awayReady = true
                relay?.stop()
                relay = nil
                startRelay()
            }
        case .denied:
            if let linkEndpoint { wrongCode.insert(linkEndpoint) }
            status = home ? "That baby phone wants a different code. Check the code on the baby phone."
                          : "That camera wants a different code. Check the code on the camera iPhone or iPad."
            dropLink()
        case .frame:
            lastSeen = Date()
            if let image = UIImage(data: payload) {
                picture = turned(image)
                if !home { carScreen.show(picture: payload) }
                lastFrame = Date()
                picturePaused = false
            }
            pushCard()
        case .status:
            lastSeen = Date()
            guard let message = try? JSONDecoder().decode(StatusMessage.self, from: payload) else { return }
            cameraBattery = message.battery
            // Over the internet the sound only comes when there's a noise, so also trust the baby phone's own guess.
            if relayUp {
                if message.mood == .crying { lastCry = Date() }
                if message.mood == .moving { lastMotion = Date() }
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
        localUp = false
        guard running else { return }
        if connected { status = "Lost the \(other). Reconnecting..." }
        if !relayUp { wentOffline() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            MainActor.assumeIsolated {
                guard self.running, self.link == nil, let browser = self.browser else { return }
                self.pickCamera(from: browser.browseResults)
            }
        }
    }

    private func lostRelay() {
        relayUp = false
        guard running, !localUp else { return }
        status = "Lost the \(other). Reconnecting..."
        wentOffline()
    }

    private func wentOffline() {
        connected = false
        hearing = false
        route = nil
        if mood != .offline {
            mood = .offline
            if home {
                // At home the parent may be asleep: chime so they know the monitor stopped. Wait a bit
                // first, because a Wi-Fi drop usually reconnects phone to phone within a few seconds.
                let since = Date()
                lostSince = since
                DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                    MainActor.assumeIsolated {
                        guard self.running, !self.connected, self.lostSince == since else { return }
                        self.tell(title: "Baby monitor lost the baby phone", body: "Check that Stork View is still listening on the baby phone, and that Wi-Fi and Bluetooth are on on both phones.", kind: "lost")
                    }
                }
            } else {
                pushCard(force: true)
            }
        }
    }

    // MARK: Internet backup (home monitor, parent phone away from home)

    private func startRelay() {
        guard home, relay == nil, let pass = InternetRelay.Pass.saved, InternetRelay.available else { return }
        let relay = InternetRelay(pass: pass)
        relay.onPacket = { [weak self] type, payload in
            MainActor.assumeIsolated { self?.fromRelay(type, payload) }
        }
        relay.start()
        self.relay = relay
    }

    private func fromRelay(_ type: Packet, _ payload: Data) {
        // The local link wins whenever it works (faster, no data use).
        guard running, !localUp, [.status, .frame, .audio].contains(type) else { return }
        if !relayUp {
            relayUp = true
            connected = true
            lostSince = nil
            lastSeen = Date()
            route = .internet
            status = "Connected over the internet"
            announceRoute()
        }
        switch type {
        case .audio:
            takeAudio(InternetRelay.grow(payload))
        case .frame:
            watcher.look(at: payload)
            handle(.frame, payload)
        default:
            handle(type, payload)
        }
    }

    private func takeAudio(_ payload: Data) {
        guard let sound = BabySpeaker.decode(payload) else { return }
        if !home { carScreen.hear(payload) }
        watcher.hear(sound)
        gate.listen(to: sound)
        if home && soundMode == .noiseOnly {
            gate.pass(sound).forEach(speaker.play)
        } else {
            speaker.play(sound)
        }
    }

    private func tick() {
        speaker.keepAlive()
        let since = lastSeen.map { Date().timeIntervalSince($0) } ?? 0
        if localUp, since > 8 { lostCamera() }
        if relayUp, since > 15 { lostRelay() }
        if running, link == nil, let browser { pickCamera(from: browser.browseResults) }
        // Away from home: tell the baby phone (through the internet relay) to send.
        if let relay, relay.joined, !localUp, Date().timeIntervalSince(lastListenSent) >= 4 {
            lastListenSent = Date()
            relay.send(.hello)
        }
        guard connected else { return }
        let now = Date()
        // Never leave an old picture up looking live: drop it once frames stop for 10 s.
        if picture != nil, let lastFrame, now.timeIntervalSince(lastFrame) > 10 {
            picture = nil
            picturePaused = true
            pushCard(force: true)
        }
        hearing = !home || soundMode == .always || gate.isOpen
        let newMood: BabyMood
        if now.timeIntervalSince(lastCry) < 4 {
            newMood = .crying
        } else if home && gate.isFussing {
            newMood = .fussing
        } else if home && now.timeIntervalSince(gate.lastNoise) < 6 {
            newMood = .noise
        } else if now.timeIntervalSince(lastMotion) < 8 {
            newMood = .moving
        } else {
            newMood = .quiet
        }
        if newMood != mood {
            let wasQuiet = mood == .quiet
            let wasCrying = mood == .crying
            mood = newMood
            if !home {
                pushCard(force: true, alert: newMood == .crying && cryAlerts ? (title: "Baby is crying", body: "Stork View hears crying.") : nil)
            } else if newMood == .crying && cryAlerts {
                tell(title: "Baby is crying", body: "Stork View hears crying in the baby's room.", kind: "cry")
            } else if newMood == .fussing && !wasCrying && fussAlerts {
                tell(title: "Baby is fussing", body: "Stork View has heard on-and-off sounds in the baby's room.", kind: "fuss")
            } else if newMood == .moving && wasQuiet && motionAlerts {
                tell(title: "Baby is moving", body: "Stork View sees movement in the baby's room.", kind: "move")
            } else if newMood == .noise && wasQuiet && noiseAlerts {
                tell(title: "Sound in the baby's room", body: "Stork View hears the baby.", kind: "noise")
            } else {
                pushCard(force: true)
            }
        }
    }

    private func turned(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage else { return image }
        let orientation: UIImage.Orientation = [.up, .right, .down, .left][turns % 4]
        return UIImage(cgImage: cg, scale: 1, orientation: orientation)
    }

    /// Home monitor: a real phone notification (shows even with the app open), or the card's
    /// own chime if notifications are turned off.
    private func tell(title: String, body: String, kind: String) {
        if notificationsOff {
            pushCard(force: true, alert: (title: title, body: body))
        } else {
            notifier.post(title: title, body: body, kind: kind)
            pushCard(force: true)
        }
    }

    private func pushCard(force: Bool = false, alert: CardAlert? = nil) {
        if !home { carScreen.show(mood: running ? mood : .offline, paused: picturePaused, turns: turns, phoneSound: true) }
        guard running else { return }
        let error = card.update(mood: mood, picture: showPictureInCar || home ? picture : nil, paused: picturePaused, force: force, alert: alert)
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

/// Phone notifications for the home monitor: crying, fussing, any sound, and a lost baby phone.
/// The same kind isn't repeated within a minute so a long cry doesn't buzz nonstop.
final class BabyNotifier: NSObject, UNUserNotificationCenterDelegate {
    private var lastSent: [String: Date] = [:]

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    static func ask() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .denied: return false
        default: return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        }
    }

    func post(title: String, body: String, kind: String) {
        let now = Date()
        if let last = lastSent[kind], now.timeIntervalSince(last) < 60 { return }
        lastSent[kind] = now
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "baby-monitor"
        let request = UNNotificationRequest(identifier: "baby-\(kind)-\(Int(now.timeIntervalSince1970))", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}

/// Title and text of the alert that pops up with a card update.
typealias CardAlert = (title: String, body: String)

/// The baby card (Live Activity). CarPlay in iOS 26 shows it on the Dashboard by itself.
@MainActor
final class CarCard {
    private var activity: Activity<BabyActivityAttributes>?
    private var lastSent = Date.distantPast
    private var lastMood: BabyMood?
    private var moodSince = Date()
    private let place: String

    init(place: String) {
        self.place = place
        // Clear any card left behind by an earlier run.
        for old in Activity<BabyActivityAttributes>.activities {
            Task { await old.end(nil, dismissalPolicy: .immediate) }
        }
    }

    /// Returns a message for the user when the card can't be shown.
    func update(mood: BabyMood, picture: UIImage?, paused: Bool, force: Bool, alert: CardAlert?) -> String? {
        let now = Date()
        // iOS throttles Live Activity updates from a locked phone. At home (no CarPlay) refresh the
        // picture every 5 s while locked (Tyler asked for 5) so the card keeps updating instead of freezing.
        // Mood changes (force) still go out right away.
        let every: TimeInterval = place != "Back seat" && UIApplication.shared.applicationState != .active ? 5 : 4
        guard force || now.timeIntervalSince(lastSent) >= every else { return nil }
        lastSent = now
        if mood != lastMood { lastMood = mood; moodSince = now }
        let state = BabyActivityAttributes.ContentState(mood: mood, thumb: picture.flatMap(Self.tinyJPEG), updated: now,
                                                        since: mood == .offline ? nil : moodSince, paused: paused)
        let content = ActivityContent(state: state, staleDate: now.addingTimeInterval(60))
        if let activity {
            let sound = alert.map { AlertConfiguration(title: "\($0.title)", body: "\($0.body)", sound: .default) }
            Task { await activity.update(content, alertConfiguration: sound) }
            return nil
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return "Live Activities are off for Stork View. Turn them on in Settings > Stork View so the baby card can show on your Lock Screen and car screen."
        }
        do {
            activity = try Activity.request(attributes: BabyActivityAttributes(seatName: place), content: content, pushType: nil)
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
