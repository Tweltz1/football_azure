import Darwin
import Foundation
import Network

/// Shows the back seat on a car's own screen (a Tesla, or any car with a web browser).
/// The phone runs a tiny web server; the car joins this phone's Personal Hotspot and opens
/// http://172.20.10.1:8080/?c=<code> in its browser. No internet or Stork View server is involved.
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

    let code: String
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
    private var wrongTries: [String: (count: Int, since: Date)] = [:]

    init() {
        let defaults = UserDefaults.standard
        if let saved = defaults.string(forKey: "carScreenCode"), saved.count == 4 {
            code = saved
        } else {
            code = String(format: "%04d", Int.random(in: 0...9999))
            defaults.set(code, forKey: "carScreenCode")
        }
    }

    var wanted: Bool {
        get { UserDefaults.standard.bool(forKey: "carScreenOn") }
        set { UserDefaults.standard.set(newValue, forKey: "carScreenOn"); newValue ? start() : stop() }
    }

    var link: String? { address.map { "http://\($0):\(Self.port)/?c=\(code)" } }

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
        let who: String = {
            if case .hostPort(let host, _) = connection.endpoint { return "\(host)" }
            return "?"
        }()

        if path == "/" || path == "/index.html" {
            return send(connection, status: "200 OK", type: "text/html; charset=utf-8", body: Data(CarScreenPage.html.utf8))
        }
        if path == "/favicon.ico" { return send(connection, status: "404 Not Found", type: "text/plain", body: Data()) }

        // Everything else needs the car screen code. Too many wrong codes from one device: wait 5 min.
        let now = Date()
        if let tries = wrongTries[who], tries.count >= 5, now.timeIntervalSince(tries.since) < 300 {
            return send(connection, status: "429 Too Many Requests", type: "text/plain", body: Data("wait".utf8))
        }
        guard query["c"] == code else {
            var tries = wrongTries[who] ?? (0, now)
            if now.timeIntervalSince(tries.since) >= 300 { tries = (0, now) }
            tries.count += 1
            wrongTries[who] = tries
            return send(connection, status: "401 Unauthorized", type: "text/plain", body: Data("code".utf8))
        }
        wrongTries[who] = nil
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
