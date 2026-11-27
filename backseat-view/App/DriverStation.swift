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
        case babyOnly, noiseOnly, always

        var title: String {
            switch self {
            case .babyOnly: return "Baby sounds only"
            case .noiseOnly: return "Any noise"
            case .always: return "All the time"
            }
        }

        var short: String {
            switch self {
            case .babyOnly: return "Baby only"
            case .noiseOnly: return "Any noise"
            case .always: return "All sounds"
            }
        }
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
    /// Live loudness of the baby's room (0...1) and when sound last came in, so the parent can see it's not frozen.
    @Published private(set) var soundLevel: Float = 0
    @Published private(set) var lastSound: Date?
    /// Soothing sound playing on the baby phone (from its status).
    @Published private(set) var babyMusic: Soothing?
    /// The parent is talking to the baby right now.
    @Published private(set) var talking = false
    /// Recording the parent's own soothing sound right now (since when).
    @Published private(set) var recordingSince: Date?
    @Published private(set) var hasRecording = Soothing.hasMine
    private var recorded = Data()
    // Failsafes: each warning goes out once until things are fine again.
    private var lastConnect = Date()
    private var warnedSilent = false
    private var warnedBattery = false
    private var warnedHot = false
    private var warnedVolume = false
    private var lastDeadman = Date.distantPast
    @Published private(set) var micProblem: String?
    private let mic = ParentMic()
    private var lastLevelPublish = Date.distantPast
    private var talkStarted = Date.distantPast
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
        carScreen.onCamera = { [weak self] command in self?.cameraCommand(command) }
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

    /// Breathing readout from the baby phone's night view (BreathReading code), nil when it's off.
    /// The camera phone's night view (nil = camera off or unknown) and whether it has one.
    @Published private(set) var cameraNight: Bool?
    @Published private(set) var cameraNightOK = false
    @Published private(set) var babyBreath: String?
    @Published private(set) var babyBreaths: Int?
    /// Beta: alert when no breathing movement is seen for a while. Off unless the parent turns it on.
    var breathAlerts: Bool {
        get { UserDefaults.standard.bool(forKey: "homeBreathAlerts") }
        set { UserDefaults.standard.set(newValue, forKey: "homeBreathAlerts"); objectWillChange.send() }
    }
    static let breathAlertSeconds = 20

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
    private let babyGate = BabyGate()
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

    /// A phone nearby that this one can tap to connect to (AirDrop-style).
    struct Nearby: Identifiable, Equatable {
        let id: String
        let name: String
        let saved: Bool
    }

    @Published private(set) var nearby: [Nearby] = []
    /// This phone has been allowed by at least one nearby phone, so "Listen"/"Watch" just works.
    @Published private(set) var hasSaved = false
    /// Why the last try stopped (shown on the start screen).
    @Published private(set) var problem: String?
    private var kind: String { home ? "baby" : "car" }
    /// The phone the person tapped (nil: any phone that allowed this one before).
    private var target: String?
    /// Pairing id of the phone the link is talking to (nil for the mini camera / older builds).
    private var linkPeer: String?
    private var ticker: Timer?
    /// The car's own screen (Tesla browser). This phone plays the baby's sound itself.
    let carScreen: CarScreen

    /// Keep the nearby list up to date before Listen / Watch is tapped.
    func look() {
        hasSaved = !Pairing.saved(kind).isEmpty
        if browser == nil { browse() }
    }

    /// Forget the phones that allowed this one.
    func forgetSaved() {
        Pairing.setSaved(kind, [:])
        hasSaved = false
        if let browser { updateNearby(browser.browseResults) }
    }

    func start(code: String = "", target: String? = nil) {
        lastRoute = nil
        guard !running else { return }
        self.code = code
        self.target = target
        problem = nil
        hasSaved = !Pairing.saved(kind).isEmpty
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
        babyGate.reset()
        watcher.onCry = { [weak self] score in
            guard score > 0.5 else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.lastCry = Date() } }
        }
        watcher.onBaby = { [weak self] score in
            guard score > 0.3 else { return }
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.babyGate.lastBaby = Date() } }
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
        if browser == nil { browse() } else if let browser { pickCamera(from: browser.browseResults) }
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
        if talking { talking = false; mic.stop() }
        babyBreath = nil
        babyBreaths = nil
        cameraNight = nil
        lastSound = nil
        soundLevel = 0
        dropLink()
        relay?.stop()
        relay = nil
        localUp = false
        relayUp = false
        route = nil
        speaker.stop()
        BabyNotifier.disarm()
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
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: BVLink.service, domain: nil), using: BVLink.parameters())
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            MainActor.assumeIsolated {
                self?.updateNearby(results)
                self?.pickCamera(from: results)
            }
        }
        browser.stateUpdateHandler = { [weak self, weak browser] state in
            MainActor.assumeIsolated {
                guard let self, let browser, browser === self.browser else { return }
                if case .failed = state {
                    self.browser?.cancel()
                    self.browser = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        MainActor.assumeIsolated { if self.browser == nil { self.browse() } }
                    }
                }
            }
        }
        browser.start(queue: .main)
        self.browser = browser
    }

    private static func info(_ result: NWBrowser.Result) -> (id: String?, kind: String?, name: String) {
        var name = "Phone"
        if case .service(let service, _, _, _) = result.endpoint { name = service }
        if case .bonjour(let txt) = result.metadata { return (txt["id"], txt["kind"], name) }
        return (nil, nil, name)
    }

    private func updateNearby(_ results: Set<NWBrowser.Result>) {
        let saved = Pairing.saved(kind)
        var seen = Set<String>()
        nearby = results.compactMap { result -> Nearby? in
            let info = Self.info(result)
            guard let id = info.id, info.kind == kind, seen.insert(id).inserted else { return nil }
            return Nearby(id: id, name: info.name, saved: saved[id] != nil)
        }
        .sorted { $0.name < $1.name }
    }

    private func pickCamera(from results: Set<NWBrowser.Result>) {
        guard running, link == nil else { return }
        let saved = Pairing.saved(kind)
        let choice = results.first { result in
            guard !wrongCode.contains(result.endpoint) else { return false }
            let info = Self.info(result)
            if let id = info.id {
                guard info.kind == nil || info.kind == kind else { return false }
                return target.map { $0 == id } ?? (saved[id] != nil)
            }
            // The mini camera (and older builds) don't say who they are: car mode, no phone tapped.
            return !home && target == nil
        }
        guard let choice else {
            tryHotspotAddresses()
            return
        }
        connect(to: choice.endpoint, peer: Self.info(choice).id)
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
                        if found { self.connect(to: endpoint, peer: nil) }
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

    private func connect(to endpoint: NWEndpoint, peer: String?) {
        status = "Connecting to the \(other)..."
        let link = FramedConnection(NWConnection(to: endpoint, using: BVLink.parameters()))
        self.link = link
        linkEndpoint = endpoint
        linkPeer = peer
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
                    if let peer = self.linkPeer {
                        let token = Pairing.saved(self.kind)[peer]
                        let join = JoinRequest(device: Pairing.myID(), name: Pairing.name(or: self.home ? "Parent phone" : "Driver's phone"), token: token)
                        if token == nil { self.status = "Tap Allow on the \(self.other)" }
                        link.send(.hello, (try? JSONEncoder().encode(join)) ?? Data())
                    } else {
                        link.send(.hello, Data(self.code.utf8))
                    }
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
            if let answer = try? JSONDecoder().decode(JoinAnswer.self, from: payload) {
                var saved = Pairing.saved(kind)
                saved[answer.id] = answer.token
                Pairing.setSaved(kind, saved)
                // Both ways, so the phones can swap jobs later without asking again.
                if home { Pairing.allowed[answer.id] = answer.token }
                hasSaved = true
                if let browser { updateNearby(browser.browseResults) }
            }
            localUp = true
            relayUp = false
            if !connected { lastConnect = Date() }
            connected = true
            // Hand the baby phone the parent's own recording (only over the local link; it's big).
            if home { sendClip() }
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
            if let peer = linkPeer {
                var saved = Pairing.saved(kind)
                saved[peer] = nil
                Pairing.setSaved(kind, saved)
                let message = "The \(other) didn't allow this phone. Tap it again to ask."
                stop()
                problem = message
                look()
                return
            }
            if let linkEndpoint { wrongCode.insert(linkEndpoint) }
            status = "That camera wants a different code."
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
            cameraNight = message.night
            cameraNightOK = message.nightOK ?? false
            if !home { carScreen.setCamera(night: message.night ?? false, nightOK: message.nightOK ?? false) }
            if home {
                checkBabyPhone(message)
                babyBreath = message.breath
                babyBreaths = message.breaths
                if breathAlerts, let quiet = message.breathQuiet, quiet >= Self.breathAlertSeconds {
                    tell(title: "Check on the baby",
                         body: "Stork View hasn't seen breathing movement for \(quiet) seconds. This Beta alert can be wrong, so go look.",
                         kind: "breath")
                }
            }
            babyMusic = message.music.flatMap(Soothing.init(rawValue:))
            // Over the internet sound only comes on noise, so the status level is the live meter.
            if relayUp { noteSound(message.level) }
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
        linkPeer = nil
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
            }
            // Show "Not connected" on the card right away (the chime above still waits).
            pushCard(force: true)
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

    // MARK: Failsafes

    private func failsafes() {
        let now = Date()
        // If iOS closes the app, this notification (pushed back every 20 s while running) goes off.
        if running, now.timeIntervalSince(lastDeadman) >= 20 {
            lastDeadman = now
            BabyNotifier.armDeadman()
        }
        // Connected phone to phone (where sound comes all the time) but nothing heard for 30 s.
        if connected, localUp, !talking, recordingSince == nil {
            let heard = max(lastSound ?? .distantPast, lastConnect)
            if now.timeIntervalSince(heard) > 30 {
                if !warnedSilent {
                    warnedSilent = true
                    tell(title: "Not hearing the baby phone", body: "Connected, but no sound has come from the baby phone for 30 seconds. Check that Stork View is still listening on it.", kind: "silent")
                }
            } else {
                warnedSilent = false
            }
        }
        // Parent phone turned all the way down.
        let volume = AVAudioSession.sharedInstance().outputVolume
        if volume < 0.01 {
            if !warnedVolume && connected {
                warnedVolume = true
                tell(title: "Your volume is all the way down", body: "Turn up this phone's volume to hear the baby.", kind: "volume")
            }
        } else if volume > 0.05 {
            warnedVolume = false
        }
    }

    private func checkBabyPhone(_ message: StatusMessage) {
        let low = message.battery >= 0 && message.battery < 0.2 && message.charging == false
        if low && !warnedBattery {
            warnedBattery = true
            tell(title: "Baby phone battery is low", body: "The baby phone is at \(Int(message.battery * 100))% and not charging. Plug it in so it keeps listening.", kind: "battery")
        } else if message.charging == true || message.battery > 0.3 {
            warnedBattery = false
        }
        if message.hot == true && !warnedHot {
            warnedHot = true
            tell(title: "Baby phone is getting hot", body: "Move it out of the sun or off the blanket, or turn its camera off. A hot phone may stop listening.", kind: "hot")
        } else if message.hot == false {
            warnedHot = false
        }
    }

    private func noteSound(_ level: Float) {
        lastSound = Date()
        guard Date().timeIntervalSince(lastLevelPublish) > 0.2 else { return }
        lastLevelPublish = Date()
        soundLevel = level
    }

    // MARK: Talk back + soothing sounds

    private func sendToBaby(_ type: Packet, _ payload: Data) {
        if localUp, let link {
            link.send(type, payload)
        } else if relayUp, let relay {
            relay.send(type, type == .talk ? InternetRelay.shrink(payload) : payload)
        }
    }

    /// Record your own soothing sound (up to 30 s): tap to start, tap again to save.
    func toggleRecord() {
        if recordingSince != nil { finishRecording(); return }
        stopTalking()
        Task { @MainActor in
            guard await ParentMic.ask() else {
                micProblem = "Microphone access is off. Turn it on in Settings > Stork View to record a sound."
                return
            }
            recorded = Data()
            mic.onSound = { [weak self] pcm in
                MainActor.assumeIsolated {
                    guard let self, self.recordingSince != nil else { return }
                    self.recorded.append(pcm)
                    if self.recorded.count >= Soothing.mineMaxBytes { self.finishRecording() }
                }
            }
            do {
                try mic.start()
                micProblem = nil
                recordingSince = Date()
            } catch {
                micProblem = "The microphone couldn't start: \(error.localizedDescription)"
            }
        }
    }

    private func finishRecording() {
        guard recordingSince != nil else { return }
        recordingSince = nil
        mic.stop()
        speaker.refresh()
        let clip = recorded.prefix(Soothing.mineMaxBytes)
        recorded = Data()
        guard clip.count >= 16_000 else {
            micProblem = "That recording was too short. Hold on a little longer next time."
            return
        }
        try? Data(clip).write(to: Soothing.mineURL, options: .atomic)
        hasRecording = true
        sendClip()
        if !localUp && connected {
            micProblem = "Saved. It goes to the baby phone the next time both phones are on the same Wi-Fi or nearby."
        }
    }

    private func sendClip() {
        guard localUp, let link, let data = try? Data(contentsOf: Soothing.mineURL) else { return }
        link.send(.clip, data)
    }

    /// Tap to talk to the baby (tap again to stop; stops by itself after 2 minutes).
    func toggleTalk() {
        if talking { stopTalking(); return }
        if recordingSince != nil { finishRecording() }
        Task { @MainActor in
            guard await ParentMic.ask() else {
                micProblem = "Microphone access is off. Turn it on in Settings > Stork View to talk to the baby."
                return
            }
            mic.onSound = { [weak self] pcm in
                MainActor.assumeIsolated { self?.sendToBaby(.talk, pcm) }
            }
            do {
                try mic.start()
                micProblem = nil
                talking = true
                let started = Date()
                talkStarted = started
                DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
                    MainActor.assumeIsolated { if self.talking && self.talkStarted == started { self.stopTalking() } }
                }
            } catch {
                micProblem = "The microphone couldn't start: \(error.localizedDescription)"
            }
        }
    }

    func stopTalking() {
        guard talking else { return }
        talking = false
        mic.stop()
        speaker.refresh()
    }

    /// Flip the camera phone's camera, or turn its night view on or off.
    func cameraCommand(_ command: String) {
        let control = ControlMessage(music: nil, volume: nil, minutes: nil, camera: command)
        if let data = try? JSONEncoder().encode(control) { sendToBaby(.control, data) }
        if command == "night-on" { cameraNight = true }
        if command == "night-off" || command == "flip" { cameraNight = false }
    }

    /// Start (or with nil stop) a soothing sound on the baby phone.
    func soothe(_ sound: Soothing?, minutes: Int?, volume: Float) {
        let control = ControlMessage(music: sound?.rawValue ?? "off", volume: volume, minutes: minutes)
        if let data = try? JSONEncoder().encode(control) { sendToBaby(.control, data) }
        babyMusic = sound
    }

    private func takeAudio(_ payload: Data) {
        guard let sound = BabySpeaker.decode(payload) else { return }
        noteSound(InternetRelay.rms(sound))
        if !home { carScreen.hear(payload) }
        watcher.hear(sound)
        gate.listen(to: sound)
        // While the parent talks, don't play the room back (it would echo their own voice).
        let babyPart = babyGate.pass(sound)
        if talking {
            _ = gate.pass(sound)
        } else if home && soundMode == .babyOnly {
            _ = gate.pass(sound)
            babyPart.forEach(speaker.play)
        } else if home && soundMode == .noiseOnly {
            gate.pass(sound).forEach(speaker.play)
        } else {
            speaker.play(sound)
        }
    }

    private func tick() {
        speaker.keepAlive()
        if home { failsafes() }
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
        if now.timeIntervalSince(lastCry) < 4 { babyGate.lastBaby = max(babyGate.lastBaby, lastCry) }
        switch soundMode {
        case _ where !home: hearing = true
        case .always: hearing = true
        case .noiseOnly: hearing = gate.isOpen
        case .babyOnly: hearing = babyGate.isOpen
        }
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
        } else {
            // Keep the card fresh even with no picture coming (sound-only, or picture paused), so its
            // "updated" time moves and a dropped update fixes itself within a few seconds.
            pushCard()
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

    /// Make sure playback is running again (after the parent's microphone switched the audio setup).
    func refresh() { restart() }

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

    /// "Stork View stopped listening": goes off 90 s from now unless pushed back again. The app
    /// pushes it back every 20 s while it runs, so it only fires if iOS closes the app.
    static func armDeadman() {
        let content = UNMutableNotificationContent()
        content.title = "Stork View stopped listening"
        content.body = "The baby monitor isn't running on this phone any more. Open Stork View to start it again."
        content.sound = .default
        content.threadIdentifier = "baby-monitor"
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 90, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "stork-stopped", content: content, trigger: trigger))
    }

    static func disarm() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["stork-stopped"])
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

    /// The newest card waiting to go out, and whether a send is already running. Updates go out one
    /// at a time and only the newest is kept, so an older update can never land after a newer one
    /// and leave the card on an old mood.
    private var pending: (content: ActivityContent<BabyActivityAttributes.ContentState>, alert: AlertConfiguration?)?
    private var sending = false

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
        // The card was swiped away or ended by iOS (they last 8 hours at most): start a fresh one.
        if let activity, activity.activityState == .ended || activity.activityState == .dismissed {
            self.activity = nil
        }
        if activity != nil {
            let sound = alert.map { AlertConfiguration(title: "\($0.title)", body: "\($0.body)", sound: .default) }
            // Keep an alert that hasn't gone out yet even if a newer picture replaces its state.
            pending = (content, sound ?? pending?.alert)
            sendNext()
            return nil
        }
        // A new card can only be started while the app is on screen. Until then the next update tries again.
        guard UIApplication.shared.applicationState == .active else { return nil }
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

    private func sendNext() {
        guard !sending, let activity, let next = pending else { return }
        pending = nil
        sending = true
        Task { @MainActor in
            await activity.update(next.content, alertConfiguration: next.alert)
            self.sending = false
            self.sendNext()
        }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        pending = nil
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
