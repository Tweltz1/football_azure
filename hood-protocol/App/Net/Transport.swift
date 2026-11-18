import Foundation

/// Moves bytes between the host phone and the players' phones.
/// Callbacks always arrive on the main queue.
protocol Transport: AnyObject {
    /// Data from a peer. On the host, `from` identifies the sending phone; on a player's phone it is the host.
    var onReceive: ((_ from: String, _ data: Data) -> Void)? { get set }
    /// Human-readable connection status for the lobby.
    var onStatus: ((String) -> Void)? { get set }
    /// The link is ready to send (a player's phone reached the host, or the host is listening).
    var onReady: (() -> Void)? { get set }
    /// Whether messages must be encrypted per player because other phones can overhear them.
    var needsSealing: Bool { get }
    /// Send to one peer, or with `nil`: from the host to everyone, from a player to the host.
    func send(_ data: Data, to peer: String?)
    func stop()
}
