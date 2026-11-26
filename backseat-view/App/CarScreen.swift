import Darwin
import Foundation
import Network
import Security

/// Shows the back seat on a car's own screen (a Tesla, or any car with a web browser).
/// The phone runs a tiny web server; the car joins this phone's Personal Hotspot and opens
/// http://172.20.10.1:8080/ (or weltzcraft.com/storkview/car) in its browser.
/// The first time, the car's page shows a 6-digit number and the phone asks "Allow this car screen?";
/// only after Allow does that browser get a long random key, which it keeps for next time. No internet or Stork View server is involved.
///
/// While the car is parked the page shows the live picture (about 2 a second). Tesla pauses all
/// video once the car leaves Park; the page watches a tiny hidden video for that and, while driving,
/// switches to a still photo every 5 seconds plus the big Quiet / Moving / Crying card.
@MainActor
final class CarScreen: ObservableObject {
    static let port: UInt16 = 8080

    @Published private(set) var on = false
    @Published private(set) var address: String?
    @Published private(set) var carWatching = false
    @Published private(set) var problem: String?

    /// A car screen waiting for Allow on this phone: the 6-digit number it shows.
    @Published private(set) var pendingNumber: String?
    @Published private(set) var allowedCount = 0
    private var listener: NWListener?
    private var addressTimer: Timer?
    private var lastRequest = Date.distantPast

    // What the page shows, fed by the camera phone or the driver's phone.
    private var picture: Data?
    private var mood: BabyMood = .offline
    private var moodSince = Date()
    private var paused = false
    private var turns = 0
    private var phoneSound = false
    private var sounds: [(seq: Int, pcm: Data)] = []
    private var soundSeq = 0
    private var pending: (number: String, since: Date)?
    private var answered: [String: String] = [:] // number -> key, or "" for denied
    private var keys: Set<String>

    init() {
        keys = Set(UserDefaults.standard.stringArray(forKey: "carScreenKeys") ?? [])
        allowedCount = keys.count
    }

    func allow() {
        guard let number = pending?.number else { return }
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let key = bytes.map { String(format: "%02x", $0) }.joined()
        keys.insert(key)
        saveKeys()
        answered[number] = key
        pending = nil
        pendingNumber = nil
    }

    func deny() {
        guard let number = pending?.number else { return }
        answered[number] = ""
        pending = nil
        pendingNumber = nil
    }

    /// Disconnect every car screen allowed so far (each will have to ask again).
    func forgetAll() {
        keys.removeAll()
        saveKeys()
    }

    private func saveKeys() {
        UserDefaults.standard.set(Array(keys), forKey: "carScreenKeys")
        allowedCount = keys.count
    }

    var wanted: Bool {
        get { UserDefaults.standard.bool(forKey: "carScreenOn") }
        set { UserDefaults.standard.set(newValue, forKey: "carScreenOn"); newValue ? start() : stop() }
    }

    var link: String? { address.map { "http://\($0):\(Self.port)/" } }

    // MARK: Feeding the page

    func show(picture jpeg: Data) {
        picture = jpeg
        paused = false
    }

    func show(mood new: BabyMood, paused: Bool, turns: Int = 0, phoneSound: Bool) {
        if new != mood { mood = new; moodSince = Date() }
        self.paused = paused
        if paused || new == .offline { picture = nil }
        self.turns = turns
        self.phoneSound = phoneSound
    }

    func hear(_ pcm: Data) {
        guard on, Date().timeIntervalSince(lastRequest) < 5 else { return }
        soundSeq += 1
        sounds.append((soundSeq, pcm))
        if sounds.count > 30 { sounds.removeFirst(sounds.count - 30) }
    }

    // MARK: Server

    func start() {
        guard listener == nil else { return }
        problem = nil
        do {
            let tcp = NWProtocolTCP.Options()
            tcp.noDelay = true
            let parameters = NWParameters(tls: nil, tcp: tcp)
            parameters.allowLocalEndpointReuse = true
            let listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: Self.port)!)
            listener.newConnectionHandler = { [weak self] connection in
                MainActor.assumeIsolated { self?.serve(connection) }
            }
            listener.stateUpdateHandler = { [weak self] state in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if case .failed(let error) = state {
                        self.problem = "The car screen couldn't start: \(error.localizedDescription)"
                        self.listener?.cancel()
                        self.listener = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                            MainActor.assumeIsolated { if self.on && self.listener == nil { self.start() } }
                        }
                    }
                }
            }
            listener.start(queue: .main)
            self.listener = listener
            on = true
        } catch {
            problem = "The car screen couldn't start: \(error.localizedDescription)"
        }
        refreshAddress()
        addressTimer?.invalidate()
        addressTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.refreshAddress()
                if let waiting = self.pending, Date().timeIntervalSince(waiting.since) > 120 {
                    self.pending = nil
                    self.pendingNumber = nil
                }
                let watching = Date().timeIntervalSince(self.lastRequest) < 5
                if watching != self.carWatching { self.carWatching = watching }
            }
        }
    }

    func stop() {
        on = false
        listener?.cancel()
        listener = nil
        addressTimer?.invalidate()
        addressTimer = nil
        carWatching = false
        sounds.removeAll()
    }

    private func refreshAddress() {
        let found = Self.localAddress()
        if found != address { address = found }
    }

    /// The phone's own address the car can reach: the Personal Hotspot one (172.20.10.1) first,
    /// otherwise its Wi-Fi address.
    static func localAddress() -> String? {
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return nil }
        defer { freeifaddrs(head) }
        var found: [String: String] = [:]
        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let entry = pointer.pointee
            guard let socket = entry.ifa_addr, socket.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: entry.ifa_name)
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(socket, socklen_t(socket.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let ip = String(cString: host)
            if ip.hasPrefix("127.") || ip.hasPrefix("169.254.") { continue }
            found[name] = ip
        }
        if let hotspot = found.first(where: { $0.key.hasPrefix("bridge") })?.value { return hotspot }
        return found["en0"]
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: .main)
        read(connection, buffer: Data())
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { connection.cancel() }
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8_192) { [weak self] data, _, done, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var buffer = buffer
                if let data { buffer.append(data) }
                if buffer.range(of: Data("\r\n\r\n".utf8)) != nil || buffer.count > 16_384 {
                    self.answer(connection, request: String(decoding: buffer, as: UTF8.self))
                } else if done || error != nil {
                    connection.cancel()
                } else {
                    self.read(connection, buffer: buffer)
                }
            }
        }
    }

    private func answer(_ connection: NWConnection, request: String) {
        let target = request.split(separator: " ", maxSplits: 2).dropFirst().first.map(String.init) ?? "/"
        let parts = URLComponents(string: "http://phone" + target)
        let path = parts?.path ?? "/"
        let query = Dictionary((parts?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })

        if path == "/" || path == "/index.html" {
            return send(connection, status: "200 OK", type: "text/html; charset=utf-8", body: Data(CarScreenPage.html.utf8))
        }
        if path == "/favicon.ico" { return send(connection, status: "404 Not Found", type: "text/plain", body: Data()) }

        // Pairing: the page shows a 6-digit number; this phone shows it too and asks Allow / Don't allow.
        // Only one request can wait at a time, and an unanswered one expires after 2 minutes.
        let now = Date()
        if path == "/pair" {
            let number = query["n"] ?? ""
            guard number.count == 6, number.allSatisfy(\.isNumber) else {
                return send(connection, status: "400 Bad Request", type: "text/plain", body: Data())
            }
            if let answer = answered[number] {
                answered[number] = nil
                let state = answer.isEmpty ? "denied" : "ok"
                let body = try? JSONSerialization.data(withJSONObject: ["state": state, "key": answer])
                return send(connection, status: "200 OK", type: "application/json", body: body ?? Data())
            }
            if let waiting = pending, waiting.number != number, now.timeIntervalSince(waiting.since) < 120 {
                return send(connection, status: "200 OK", type: "application/json", body: Data(#"{"state":"busy"}"#.utf8))
            }
            if pending?.number != number {
                pending = (number, now)
                pendingNumber = number
                if answered.count > 20 { answered.removeAll() }
            }
            return send(connection, status: "200 OK", type: "application/json", body: Data(#"{"state":"waiting"}"#.utf8))
        }

        // Everything else needs a key this phone handed out with Allow.
        guard let key = query["k"], key.count == 48, keys.contains(key) else {
            return send(connection, status: "401 Unauthorized", type: "text/plain", body: Data("pair".utf8))
        }
        lastRequest = now
        if !carWatching { carWatching = true }

        switch path {
        case "/status":
            let json: [String: Any] = [
                "mood": mood.rawValue,
                "title": mood.title,
                "since": mood == .offline ? 0 : moodSince.timeIntervalSince1970,
                "paused": paused,
                "turns": turns,
                "phoneSound": phoneSound,
            ]
            let body = (try? JSONSerialization.data(withJSONObject: json)) ?? Data("{}".utf8)
            send(connection, status: "200 OK", type: "application/json", body: body)
        case "/frame.jpg":
            if let picture {
                send(connection, status: "200 OK", type: "image/jpeg", body: picture)
            } else {
                send(connection, status: "404 Not Found", type: "text/plain", body: Data())
            }
        case "/sound":
            let after = Int(query["after"] ?? "") ?? 0
            // A new page (or a phone restart) starts from the newest few pieces, not old ones.
            let fresh = after > soundSeq || after < soundSeq - 30 ? Array(sounds.suffix(3)) : sounds.filter { $0.seq > after }
            var body = Data()
            fresh.forEach { body.append($0.pcm) }
            send(connection, status: "200 OK", type: "application/octet-stream", body: body,
                 extra: "X-Seq: \(soundSeq)\r\nAccess-Control-Expose-Headers: X-Seq\r\n")
        default:
            send(connection, status: "404 Not Found", type: "text/plain", body: Data())
        }
    }

    private func send(_ connection: NWConnection, status: String, type: String, body: Data, extra: String = "") {
        var head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\n"
        head += "Cache-Control: no-store\r\nConnection: close\r\n\(extra)\r\n"
        var out = Data(head.utf8)
        out.append(body)
        connection.send(content: out, completion: .contentProcessed { _ in connection.cancel() })
    }
}
