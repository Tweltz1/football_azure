import Foundation

/// Online play over Supabase Realtime broadcast: everyone at a table joins the
/// channel for its room code. Speaks the Realtime websocket protocol directly,
/// so the app needs no extra packages.
///
/// Every phone on the channel can see every message, so `needsSealing` is true:
/// the tables encrypt anything private per player (see `Sealer`).
final class OnlineTransport: NSObject, Transport, URLSessionWebSocketDelegate {
    static let hostId = "host"

    var onReceive: ((String, Data) -> Void)?
    var onStatus: ((String) -> Void)?
    var onReady: (() -> Void)?
    let needsSealing = true

    /// Supabase project settings, filled in at build time (see project.yml).
    static var config: (url: URL, key: String)? {
        let info = Bundle.main.infoDictionary
        guard let raw = info?["SupabaseURL"] as? String, let key = info?["SupabaseAnonKey"] as? String,
              !key.isEmpty, !raw.contains("$("), var parts = URLComponents(string: raw) else { return nil }
        parts.scheme = "wss"
        parts.path = "/realtime/v1/websocket"
        parts.queryItems = [URLQueryItem(name: "apikey", value: key), URLQueryItem(name: "vsn", value: "1.0.0")]
        guard let url = parts.url else { return nil }
        return (url, key)
    }

    static var isAvailable: Bool { config != nil }

    private let me: String
    private let topic: String
    private let defaultTarget: String
    private var socket: URLSessionWebSocketTask?
    private lazy var urlSession = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    private var ref = 0
    private var joinRef = ""
    private var joined = false
    private var stopped = false
    private var outbox: [[String: Any]] = []
    private var heartbeat: Timer?
    private var attempts = 0

    /// `me` is this phone's id on the channel: `OnlineTransport.hostId` for the host, the player id otherwise.
    init(me: String, room: String) {
        self.me = me
        topic = "realtime:hood-protocol-\(room)"
        defaultTarget = me == Self.hostId ? "*" : Self.hostId
        super.init()
        connect()
    }

    func send(_ data: Data, to peer: String?) {
        let envelope: [String: Any] = ["f": me, "t": peer ?? defaultTarget, "b": data.base64EncodedString()]
        if joined { broadcast(envelope) } else { outbox.append(envelope) }
    }

    func stop() {
        stopped = true
        heartbeat?.invalidate()
        if joined { push(event: "phx_leave", payload: [:]) }
        socket?.cancel(with: .goingAway, reason: nil)
        urlSession.finishTasksAndInvalidate()
    }

    // MARK: Connection

    private func connect() {
        guard !stopped, let config = Self.config else {
            onStatus?("Online play isn't set up in this build.")
            return
        }
        onStatus?("Connecting…")
        joined = false
        let task = urlSession.webSocketTask(with: config.url)
        socket = task
        task.resume()
        receive(on: task)
        joinRef = push(event: "phx_join", payload: [
            "config": ["broadcast": ["self": false, "ack": false], "presence": ["key": ""], "private": false],
            "access_token": config.key
        ])
        heartbeat?.invalidate()
        heartbeat = Timer.scheduledTimer(withTimeInterval: 25, repeats: true) { [weak self] _ in
            self?.push(event: "heartbeat", payload: [:], topic: "phoenix")
        }
    }

    private func reconnect() {
        guard !stopped else { return }
        joined = false
        heartbeat?.invalidate()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        attempts += 1
        onStatus?("Connection lost. Reconnecting…")
        let delay = min(Double(attempts) * 1.5, 10)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.connect() }
    }

    @discardableResult
    private func push(event: String, payload: [String: Any], topic: String? = nil) -> String {
        ref += 1
        let message: [String: Any] = ["topic": topic ?? self.topic, "event": event, "payload": payload, "ref": String(ref)]
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let text = String(data: data, encoding: .utf8) else { return "" }
        socket?.send(.string(text)) { [weak self] error in
            if error != nil { DispatchQueue.main.async { self?.reconnect() } }
        }
        return String(ref)
    }

    private func broadcast(_ envelope: [String: Any]) {
        push(event: "broadcast", payload: ["type": "broadcast", "event": "m", "payload": envelope])
    }

    private func receive(on task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self, task === self.socket else { return }
                switch result {
                case let .success(.string(text)):
                    self.handle(text)
                    self.receive(on: task)
                case .success:
                    self.receive(on: task)
                case .failure:
                    self.reconnect()
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = message["event"] as? String,
              let payload = message["payload"] as? [String: Any] else { return }

        switch event {
        case "phx_reply" where message["ref"] as? String == joinRef:
            if payload["status"] as? String == "ok" {
                joined = true
                attempts = 0
                onStatus?("Connected.")
                let queued = outbox
                outbox = []
                queued.forEach(broadcast)
                onReady?()
            } else {
                onStatus?("The server refused the room. Retrying…")
                reconnect()
            }
        case "broadcast":
            guard let envelope = payload["payload"] as? [String: Any],
                  let from = envelope["f"] as? String, from != me,
                  let target = envelope["t"] as? String, target == me || target == "*",
                  let body = (envelope["b"] as? String).flatMap({ Data(base64Encoded: $0) }) else { return }
            onReceive?(from, body)
        case "phx_error", "phx_close":
            if message["topic"] as? String == topic { reconnect() }
        default:
            break
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        if webSocketTask === socket { reconnect() }
    }
}
