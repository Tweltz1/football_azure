import Foundation
import Network

/// Message types sent between the camera phone and the driver's phone.
enum Packet: UInt8 {
    case hello = 1    // driver -> camera: the 4-digit pairing code
    case welcome = 2  // camera -> driver: code accepted
    case denied = 3   // camera -> driver: wrong code
    case status = 4   // camera -> driver: StatusMessage JSON, once a second
    case frame = 5    // camera -> driver: JPEG picture, about two a second
    case audio = 6    // camera -> driver: 16 kHz mono 16-bit PCM
    case relay = 7    // baby phone -> parent phone at home: InternetRelay.Pass JSON (room + key)
    case talk = 8     // parent -> baby phone: the parent's voice, 16 kHz mono 16-bit PCM
    case control = 9  // parent -> baby phone: ControlMessage JSON (soothing sounds)
}

struct StatusMessage: Codable {
    var mood: BabyMood
    var level: Float
    var dark: Bool
    var battery: Float
    /// Soothing sound playing on the baby phone (Soothing raw value), if any.
    var music: String? = nil
    /// The baby phone is playing the parent's voice right now.
    var talking: Bool? = nil
}

enum BVLink {
    static let service = "_backseatview._tcp"

    /// Phone-to-phone link. includePeerToPeer lets the two iPhones reach each other
    /// directly (Apple's peer-to-peer Wi-Fi, the same thing AirDrop uses), so no
    /// Wi-Fi network or cell signal is needed in the car.
    static func parameters() -> NWParameters {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 2
        tcp.connectionTimeout = 6
        let parameters = NWParameters(tls: nil, tcp: tcp)
        parameters.includePeerToPeer = true
        return parameters
    }
}

/// One TCP connection carrying [type: 1 byte][length: 4 bytes big-endian][payload] messages.
/// Everything runs on the main queue so callers can hop straight onto the main actor.
final class FramedConnection {
    let connection: NWConnection
    var onPacket: ((Packet, Data) -> Void)?
    var onState: ((NWConnection.State) -> Void)?
    private var picturesInFlight = 0

    init(_ connection: NWConnection) {
        self.connection = connection
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in self?.onState?(state) }
        connection.start(queue: .main)
        readHeader()
    }

    func cancel() {
        connection.cancel()
    }

    func send(_ type: Packet, _ payload: Data = Data()) {
        // Pictures are skipped while the link is busy so audio and status stay live.
        if type == .frame {
            if picturesInFlight >= 2 { return }
            picturesInFlight += 1
        }
        var message = Data([type.rawValue])
        let length = UInt32(payload.count)
        message.append(contentsOf: [UInt8(length >> 24 & 0xff), UInt8(length >> 16 & 0xff), UInt8(length >> 8 & 0xff), UInt8(length & 0xff)])
        message.append(payload)
        connection.send(content: message, completion: .contentProcessed { [weak self] _ in
            if type == .frame { self?.picturesInFlight -= 1 }
        })
    }

    private func readHeader() {
        connection.receive(minimumIncompleteLength: 5, maximumLength: 5) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            guard error == nil, let data, data.count == 5 else {
                if isComplete || error != nil { self.connection.cancel() }
                return
            }
            let bytes = [UInt8](data)
            let length = Int(UInt32(bytes[1]) << 24 | UInt32(bytes[2]) << 16 | UInt32(bytes[3]) << 8 | UInt32(bytes[4]))
            guard length <= 2_000_000 else { self.connection.cancel(); return }
            if length == 0 {
                self.deliver(bytes[0], Data())
                self.readHeader()
                return
            }
            self.connection.receive(minimumIncompleteLength: length, maximumLength: length) { body, _, _, error in
                guard error == nil, let body, body.count == length else { self.connection.cancel(); return }
                self.deliver(bytes[0], body)
                self.readHeader()
            }
        }
    }

    private func deliver(_ raw: UInt8, _ payload: Data) {
        if let type = Packet(rawValue: raw) { onPacket?(type, payload) }
    }
}

/// AirDrop-style pairing: the watching phone taps a nearby phone, the sending phone shows
/// "Allow?" once, and both remember each other with a random token after that.
/// (A 4-digit hello is still accepted from older builds and the mini camera.)
struct JoinRequest: Codable {
    var device: String
    var name: String
    var token: String?
}

struct JoinAnswer: Codable {
    var id: String
    var token: String
}

enum Pairing {
    /// Bonjour TXT keys on the sending phone's service: "id" (stable) and "kind" ("baby" or "car").
    static func myID() -> String {
        if let id = UserDefaults.standard.string(forKey: "pairingID") { return id }
        let id = randomHex(4)
        UserDefaults.standard.set(id, forKey: "pairingID")
        return id
    }

    /// The name this phone shows to the other phone (blank = "Baby Phone" / "Parent phone").
    static var myName: String {
        (UserDefaults.standard.string(forKey: "phoneName") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func name(or fallback: String) -> String {
        myName.isEmpty ? fallback : String(myName.prefix(30))
    }

    static func randomHex(_ bytes: Int) -> String {
        var raw = [UInt8](repeating: 0, count: bytes)
        _ = SecRandomCopyBytes(kSecRandomDefault, raw.count, &raw)
        return raw.map { String(format: "%02x", $0) }.joined()
    }

    /// Sending phone: watching phones it allowed, device id -> token.
    static var allowed: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "pairingAllowed") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "pairingAllowed") }
    }

    /// Watching phone: sending phones that allowed it, their id -> token (one list per kind).
    static func saved(_ kind: String) -> [String: String] {
        UserDefaults.standard.dictionary(forKey: "pairingSaved-\(kind)") as? [String: String] ?? [:]
    }

    static func setSaved(_ kind: String, _ value: [String: String]) {
        UserDefaults.standard.set(value, forKey: "pairingSaved-\(kind)")
    }
}
