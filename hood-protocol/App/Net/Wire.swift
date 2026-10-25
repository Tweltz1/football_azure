import CryptoKit
import Foundation
import RogueEngine

/// What a phone says when it joins a table.
struct Hello: Codable {
    var playerId: String
    var name: String
    var avatar: Int
    /// Curve25519 public key, sent only on transports that need sealing (online).
    var publicKey: Data?
}

struct LobbyPlayer: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var avatar: Int
}

/// The host's public table state, sent to every phone.
struct LobbyState: Codable, Equatable {
    var room: String
    var players: [LobbyPlayer]
    var seatCount: Int
    var boardMode: BoardMode
    var started: Bool
    var hostKey: Data?
}

enum Wire: Codable {
    case hello(Hello)
    case lobby(LobbyState)
    case view(PlayerView)
    case action(Action)
    /// Asks the host to send this phone's view again.
    case sync
    /// Another `Wire`, encrypted for one player.
    case sealed(Data)
    case closed(String)

    func encoded() -> Data { (try? JSONEncoder().encode(self)) ?? Data() }

    static func decode(_ data: Data) -> Wire? { try? JSONDecoder().decode(Wire.self, from: data) }
}

/// Encrypts messages between the host and one player, so other phones on the
/// same online channel can't read roles, hands or votes, or act for someone else.
struct Sealer {
    private let key: SymmetricKey

    init(myKey: Curve25519.KeyAgreement.PrivateKey, theirKey: Data, room: String) throws {
        let theirs = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: theirKey)
        let secret = try myKey.sharedSecretFromKeyAgreement(with: theirs)
        key = secret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data(room.utf8),
            sharedInfo: Data("hood-protocol".utf8),
            outputByteCount: 32
        )
    }

    func seal(_ wire: Wire) -> Wire? {
        guard let box = try? ChaChaPoly.seal(wire.encoded(), using: key) else { return nil }
        return .sealed(box.combined)
    }

    func open(_ data: Data) -> Wire? {
        guard let box = try? ChaChaPoly.SealedBox(combined: data),
              let plain = try? ChaChaPoly.open(box, using: key) else { return nil }
        return Wire.decode(plain)
    }
}

enum RoomCode {
    private static let letters = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")

    static func make() -> String { String((0..<4).map { _ in letters.randomElement()! }) }

    static func clean(_ text: String) -> String {
        String(text.uppercased().filter { letters.contains($0) }.prefix(4))
    }
}
