import CryptoKit
import Foundation
import UIKit

/// Shows the back seat on a car's own screen (a Tesla, or any car with a web browser), over the internet.
///
/// The car opens weltzcraft.com/storkview/car and types the 6-digit code this phone shows. The page then
/// asks to connect, and this phone pops up "Allow this car screen?". On Allow, the phone hands the page a
/// private room name + AES-256 key, sealed with a one-time key exchange (P-256 ECDH) so nobody watching the
/// pairing can read it. After that, pictures, sound and the Quiet / Moving / Crying status go through the
/// studio's Supabase Realtime relay (the same one the home monitor uses), encrypted on the phone; the relay
/// only sees scrambled bytes. The page keeps the room for next time, so later it connects by itself.
///
/// Tesla pauses all browser video once the car leaves Park; the page watches a tiny hidden video for that
/// and tells the phone. Parked: about 3 pictures a second. Driving: one still photo every 5 seconds.
@MainActor
final class CarScreen: ObservableObject {
    @Published private(set) var on = false
    /// The 6-digit code to type on the car screen (new each time the switch is turned on).
    @Published private(set) var code = ""
    /// A car screen asked to connect and is waiting for Allow / Don't Allow.
    @Published private(set) var asking = false
    @Published private(set) var carWatching = false
    @Published private(set) var connected = false
    @Published private(set) var problem: String?

    private var lobby: PlainChannel?
    private var room: InternetRelay?
    private var askKey: Data?
    private var timer: Timer?

    // What the car is doing, from its "hello" every few seconds.
    private var lastHello = Date.distantPast
    private var parked = true
    private var wantsSound = false

    // What the page shows, fed by the camera phone or the driver's phone.
    private var mood: BabyMood = .offline
    private var moodSince = Date()
    private var paused = false
    private var turns = 0
    private var phoneSound = false
    private var night = false
    private var nightOK = false
    /// A camera command from the car screen ("flip", "night-on", "night-off").
    var onCamera: ((String) -> Void)?
    private var lastFrameSent = Date.distantPast
    private var lastStatusSent = Date.distantPast
    private var soundBuffer = Data()

    /// The camera takes pictures faster while a parked car screen is watching.
    var wantsFastPictures: Bool { on && carWatching && parked }

    var wanted: Bool {
        get { UserDefaults.standard.object(forKey: "carScreenOn") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "carScreenOn"); newValue ? start() : stop() }
    }

    /// This phone's private car room. Made once; "Disconnect all car screens" makes a new one.
    private var pass: InternetRelay.Pass {
        if let data = UserDefaults.standard.data(forKey: "carScreenPass"),
           let pass = try? JSONDecoder().decode(InternetRelay.Pass.self, from: data) { return pass }
        let pass = InternetRelay.Pass.make()
        UserDefaults.standard.set(try? JSONEncoder().encode(pass), forKey: "carScreenPass")
        return pass
    }

    // MARK: Switch on / off

    func start() {
        guard !on else { return }
        guard InternetRelay.available else {
            problem = "This build is missing the internet relay key, so the car screen can't start."
            return
        }
        problem = nil
        on = true
        code = String(format: "%06d", Int.random(in: 0...999_999))
        openLobby()
        openRoom()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    func stop() {
        on = false
        timer?.invalidate()
        timer = nil
        lobby?.stop()
        lobby = nil
        room?.stop()
        room = nil
        asking = false
        askKey = nil
        carWatching = false
        connected = false
        soundBuffer.removeAll()
    }

    /// Every car screen allowed so far loses access (they'll need the code + Allow again).
    func forgetAll() {
        UserDefaults.standard.removeObject(forKey: "carScreenPass")
        guard on else { return }
        room?.stop()
        room = nil
        lastHello = .distantPast
        carWatching = false
        openRoom()
    }

    // MARK: Pairing

    private func openLobby() {
        let lobby = PlainChannel(topic: "realtime:stork-car-\(code)")
        lobby.onEvent = { [weak self] event, payload in
            MainActor.assumeIsolated {
                guard let self, event == "ask", !self.asking,
                      let text = payload["pub"] as? String, let key = Data(base64Encoded: text), key.count == 65 else { return }
                self.askKey = key
                self.asking = true
            }
        }
        lobby.start()
        self.lobby = lobby
    }

    func allow() {
        defer { asking = false; askKey = nil }
        guard let askKey, let theirs = try? P256.KeyAgreement.PublicKey(x963Representation: askKey) else { return }
        let mine = P256.KeyAgreement.PrivateKey()
        guard let shared = try? mine.sharedSecretFromKeyAgreement(with: theirs),
              let secret = try? JSONEncoder().encode(pass) else { return }
        let key = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: Data("stork-car".utf8), sharedInfo: Data(), outputByteCount: 32)
        guard let box = try? AES.GCM.seal(secret, using: key).combined else { return }
        lobby?.send("pass", ["eph": mine.publicKey.x963Representation.base64EncodedString(), "box": box.base64EncodedString()])
    }

    func deny() {
        guard asking else { return }
        asking = false
        askKey = nil
        lobby?.send("no", [:])
    }

    // MARK: The car's room

    private func openRoom() {
        let room = InternetRelay(pass: pass)
        room.onPacket = { [weak self] type, payload in
            MainActor.assumeIsolated {
                guard let self else { return }
                if type == .control {
                    if let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
                       let command = json["camera"] as? String { self.onCamera?(command) }
                    return
                }
                guard type == .hello else { return }
                let flags = payload.first ?? 1
                let wasWatching = self.carWatching
                self.lastHello = Date()
                self.parked = flags & 1 != 0
                self.wantsSound = flags & 2 != 0
                if !wasWatching { self.carWatching = true; self.sendStatus(force: true) }
            }
        }
        room.start()
        self.room = room
    }

    private func tick() {
        connected = room?.joined ?? false
        let watching = Date().timeIntervalSince(lastHello) < 12
        if watching != carWatching { carWatching = watching }
        sendStatus()
    }

    // MARK: Feeding the page

    func show(picture jpeg: Data) {
        paused = false
        guard on, carWatching else { return }
        let now = Date()
        guard now.timeIntervalSince(lastFrameSent) >= (parked ? 0.3 : 5) else { return }
        lastFrameSent = now
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let small = Self.smaller(jpeg) else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.room?.send(.frame, small) }
            }
        }
    }

    func show(mood new: BabyMood, paused: Bool, turns: Int = 0, phoneSound: Bool) {
        let changed = new != mood || paused != self.paused
        if new != mood { mood = new; moodSince = Date() }
        self.paused = paused
        self.turns = turns
        self.phoneSound = phoneSound
        if changed { sendStatus(force: true) }
    }

    /// Night view state for the page's Night view button.
    func setCamera(night: Bool, nightOK: Bool) {
        guard night != self.night || nightOK != self.nightOK else { return }
        self.night = night
        self.nightOK = nightOK
        sendStatus(force: true)
    }

    /// 16 kHz sound from the camera; sent at 8 kHz in half-second pieces, only while the car has sound on.
    func hear(_ pcm: Data) {
        guard on, carWatching, wantsSound else { soundBuffer.removeAll(); return }
        soundBuffer.append(InternetRelay.shrink(pcm))
        if soundBuffer.count >= 8_000 { // 0.5 s at 8 kHz, 16-bit
            room?.send(.audio, soundBuffer)
            soundBuffer.removeAll(keepingCapacity: true)
        }
    }

    private func sendStatus(force: Bool = false) {
        guard on, carWatching else { return }
        let now = Date()
        guard force || now.timeIntervalSince(lastStatusSent) >= 2 else { return }
        lastStatusSent = now
        let json: [String: Any] = [
            "mood": mood.rawValue,
            "title": mood.title,
            "since": mood == .offline ? 0 : moodSince.timeIntervalSince1970,
            "paused": paused,
            "turns": turns,
            "phoneSound": phoneSound,
            "night": night,
            "nightOK": nightOK,
        ]
        if let body = try? JSONSerialization.data(withJSONObject: json) { room?.send(.status, body) }
    }

    /// About 360 px and 8-12 KB, so the relay stays quick and phone data use stays reasonable.
    nonisolated static func smaller(_ jpeg: Data) -> Data? {
        guard let image = UIImage(data: jpeg) else { return nil }
        let scale = min(1, 360 / max(image.size.width, image.size.height, 1))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }.jpegData(compressionQuality: 0.45)
    }
}

/// A plain (not encrypted) Supabase Realtime broadcast channel, used only for pairing: the car's
/// "ask" with its public key, and this phone's sealed answer. Nothing secret goes through it unsealed.
final class PlainChannel: NSObject, URLSessionWebSocketDelegate {
    var onEvent: ((String, [String: Any]) -> Void)?
    private let topic: String
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var heartbeat: Timer?
    private var ref = 0
    private var running = false

    init(topic: String) {
        self.topic = topic
    }

    func start() {
        guard !running else { return }
        running = true
        open()
    }

    func stop() {
        running = false
        heartbeat?.invalidate()
        heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
    }

    func send(_ event: String, _ payload: [String: Any]) {
        write(["topic": topic, "event": "broadcast", "ref": nextRef(), "join_ref": "1",
               "payload": ["type": "broadcast", "event": event, "payload": payload]])
    }

    private func open() {
        guard running, let url = InternetRelay.endpoint else { return }
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        let socket = session.webSocketTask(with: url)
        self.session = session
        self.socket = socket
        socket.resume()
        write(["topic": topic, "event": "phx_join", "ref": nextRef(), "join_ref": "1",
               "payload": ["config": ["broadcast": ["self": false, "ack": false], "presence": ["key": ""], "private": false]]])
        receive(on: socket)
        heartbeat?.invalidate()
        heartbeat = Timer.scheduledTimer(withTimeInterval: 25, repeats: true) { [weak self] _ in
            self?.write(["topic": "phoenix", "event": "heartbeat", "payload": [String: Any](), "ref": self?.nextRef() ?? "0"])
        }
    }

    private func receive(on socket: URLSessionWebSocketTask) {
        socket.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self, socket === self.socket else { return }
                switch result {
                case .success(let message):
                    if case .string(let text) = message,
                       let json = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any],
                       (json["event"] as? String) == "broadcast",
                       let outer = json["payload"] as? [String: Any],
                       let event = outer["event"] as? String {
                        self.onEvent?(event, outer["payload"] as? [String: Any] ?? [:])
                    }
                    self.receive(on: socket)
                case .failure:
                    self.reopen()
                }
            }
        }
    }

    private func reopen() {
        heartbeat?.invalidate()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        guard running else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.running, self.socket == nil else { return }
            self.open()
        }
    }

    private func write(_ object: [String: Any]) {
        guard let socket, let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        socket.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
    }

    private func nextRef() -> String {
        ref += 1
        return String(ref)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        if webSocketTask === socket { reopen() }
    }
}
