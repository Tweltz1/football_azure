import AVFoundation
import CryptoKit
import Foundation

/// Internet backup for the home baby monitor, for when the parent phone is away from home Wi-Fi
/// (on cellular, at work, at a friend's house). Both phones join a private room on Supabase Realtime
/// (the studio's free hosted relay) and pass the same packets as the phone-to-phone link.
///
/// Privacy: the room name and an AES-256 key are made on the baby phone and handed to the parent
/// phone only over the local link at home. Everything is encrypted on the phone (AES-GCM) before it
/// leaves, so the relay only ever sees scrambled bytes.
///
/// Data use: the baby phone only sends while a parent phone is listening from away, sends sound only
/// when there is a noise (at 8 kHz), a small picture every 4 seconds and a status every 2 seconds.
final class InternetRelay: NSObject, URLSessionWebSocketDelegate {
    /// The pairing secret the baby phone hands to the parent phone.
    struct Pass: Codable, Equatable {
        var room: String
        var key: Data

        static func make() -> Pass {
            var bytes = [UInt8](repeating: 0, count: 16)
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            let room = bytes.map { String(format: "%02x", $0) }.joined()
            return Pass(room: room, key: SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) })
        }

        /// Baby phone: its own pass, made once and kept.
        static var mine: Pass {
            if let data = UserDefaults.standard.data(forKey: "relayPassMine"),
               let pass = try? JSONDecoder().decode(Pass.self, from: data) { return pass }
            let pass = make()
            UserDefaults.standard.set(try? JSONEncoder().encode(pass), forKey: "relayPassMine")
            return pass
        }

        /// Parent phone: the pass it got from the baby phone at home (nil until then).
        static var saved: Pass? {
            get {
                guard let data = UserDefaults.standard.data(forKey: "relayPassSaved") else { return nil }
                return try? JSONDecoder().decode(Pass.self, from: data)
            }
            set { UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "relayPassSaved") }
        }
    }

    /// Filled in at build time (backseat-view.yml). Without it the internet backup is simply off.
    static var endpoint: URL? {
        guard let base = Bundle.main.object(forInfoDictionaryKey: "StorkRelayURL") as? String, !base.isEmpty,
              let key = Bundle.main.object(forInfoDictionaryKey: "StorkRelayKey") as? String, !key.isEmpty,
              var parts = URLComponents(string: base) else { return nil }
        parts.queryItems = [URLQueryItem(name: "apikey", value: key), URLQueryItem(name: "vsn", value: "1.0.0")]
        return parts.url
    }

    static var available: Bool { endpoint != nil }

    /// Called on the main queue for every packet from the other phone.
    var onPacket: ((Packet, Data) -> Void)?
    private(set) var joined = false

    private let pass: Pass
    private let topic: String
    private var session: URLSession?
    private var socket: URLSessionWebSocketTask?
    private var ref = 0
    private var heartbeat: Timer?
    private var running = false
    private var retryDelay: TimeInterval = 2

    init(pass: Pass) {
        self.pass = pass
        topic = "realtime:stork-\(pass.room)"
    }

    func start() {
        guard !running, Self.available else { return }
        running = true
        open()
    }

    func stop() {
        running = false
        joined = false
        heartbeat?.invalidate()
        heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
    }

    /// Encrypts and sends one packet. Dropped quietly while not connected.
    func send(_ type: Packet, _ payload: Data = Data()) {
        guard joined, let socket,
              let sealed = try? AES.GCM.seal(Data([type.rawValue]) + payload, using: SymmetricKey(data: pass.key)).combined
        else { return }
        let message: [String: Any] = [
            "topic": topic, "event": "broadcast", "ref": nextRef(), "join_ref": "1",
            "payload": ["type": "broadcast", "event": "p", "payload": ["d": sealed.base64EncodedString()]],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        socket.send(.string(String(decoding: data, as: UTF8.self))) { _ in }
    }

    // MARK: Phoenix channel plumbing (Supabase Realtime speaks the Phoenix protocol)

    private func open() {
        guard running, let url = Self.endpoint else { return }
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        let socket = session.webSocketTask(with: url)
        socket.maximumMessageSize = 1_000_000
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
                    switch message {
                    case .string(let text): self.handle(Data(text.utf8))
                    case .data(let data): self.handle(data)
                    @unknown default: break
                    }
                    self.receive(on: socket)
                case .failure:
                    self.dropped()
                }
            }
        }
    }

    private func handle(_ data: Data) {
        guard let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = message["event"] as? String else { return }
        switch event {
        case "phx_reply":
            if (message["topic"] as? String) == topic,
               let payload = message["payload"] as? [String: Any], (payload["status"] as? String) == "ok" {
                joined = true
                retryDelay = 2
            }
        case "phx_error", "phx_close":
            if (message["topic"] as? String) == topic { dropped() }
        case "broadcast":
            guard let outer = message["payload"] as? [String: Any],
                  let inner = outer["payload"] as? [String: Any],
                  let text = inner["d"] as? String, let sealed = Data(base64Encoded: text),
                  let box = try? AES.GCM.SealedBox(combined: sealed),
                  let plain = try? AES.GCM.open(box, using: SymmetricKey(data: pass.key)),
                  let first = plain.first, let type = Packet(rawValue: first) else { return }
            onPacket?(type, plain.dropFirst())
        default:
            break
        }
    }

    private func dropped() {
        joined = false
        heartbeat?.invalidate()
        heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        session?.invalidateAndCancel()
        session = nil
        guard running else { return }
        let wait = retryDelay
        retryDelay = min(retryDelay * 2, 30)
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
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
        if webSocketTask === socket { dropped() }
    }

    // MARK: Sound size (16 kHz on the local link, 8 kHz over the internet)

    /// Loudness (RMS) of a float buffer, for the parent's live sound meter.
    static func rms(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += data[i] * data[i] }
        return (sum / Float(buffer.frameLength)).squareRoot()
    }

    /// 16 kHz Int16 mono -> 8 kHz (average each pair of samples).
    static func shrink(_ pcm: Data) -> Data {
        let samples = pcm.withUnsafeBytes { Array($0.bindMemory(to: Int16.self)) }
        var out = [Int16]()
        out.reserveCapacity(samples.count / 2)
        var i = 0
        while i + 1 < samples.count {
            out.append(Int16((Int32(samples[i]) + Int32(samples[i + 1])) / 2))
            i += 2
        }
        return out.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    /// 8 kHz Int16 mono -> 16 kHz (straight-line fill between samples).
    static func grow(_ pcm: Data) -> Data {
        let samples = pcm.withUnsafeBytes { Array($0.bindMemory(to: Int16.self)) }
        var out = [Int16]()
        out.reserveCapacity(samples.count * 2)
        for (i, sample) in samples.enumerated() {
            out.append(sample)
            let next = i + 1 < samples.count ? samples[i + 1] : sample
            out.append(Int16((Int32(sample) + Int32(next)) / 2))
        }
        return out.withUnsafeBufferPointer { Data(buffer: $0) }
    }
}
