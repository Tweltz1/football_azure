import Foundation
import MultipeerConnectivity
import UIKit

/// Phones in the same room, no internet needed (Bluetooth and peer-to-peer Wi-Fi),
/// the same way Hood League runs its offline draft.
enum Nearby {
    /// Bonjour service name; must match NSBonjourServices in Info.plist.
    static let serviceType = "hood-protocol"
    /// An MCSession holds at most 8 phones, so the host opens another one for every 7 players.
    static let playersPerSession = kMCSessionMaximumNumberOfPeers - 1
}

/// The host's side: advertises the table and accepts every phone that asks to join.
final class NearbyHost: NSObject, Transport, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate {
    var onReceive: ((String, Data) -> Void)?
    var onStatus: ((String) -> Void)?
    var onReady: (() -> Void)?
    let needsSealing = false

    private let me: MCPeerID
    private let advertiser: MCNearbyServiceAdvertiser
    private var sessions: [MCSession] = []
    private var sessionOfPeer: [MCPeerID: MCSession] = [:]
    private var ids: [MCPeerID: String] = [:]
    private var peers: [String: MCPeerID] = [:]

    init(name: String, room: String) {
        me = MCPeerID(displayName: String(name.prefix(60)))
        advertiser = MCNearbyServiceAdvertiser(peer: me, discoveryInfo: ["room": room, "host": String(name.prefix(40))], serviceType: Nearby.serviceType)
        super.init()
        advertiser.delegate = self
        advertiser.startAdvertisingPeer()
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        DispatchQueue.main.async {
            self.onStatus?("Hosting nearby. Keep this phone unlocked.")
            self.onReady?()
        }
    }

    /// iOS stops advertising while the app is in the background; start again when it's back.
    @objc private func becameActive() {
        advertiser.stopAdvertisingPeer()
        advertiser.startAdvertisingPeer()
    }

    private func newSession() -> MCSession {
        let session = MCSession(peer: me, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
        sessions.append(session)
        return session
    }

    private func sessionWithRoom() -> MCSession {
        for session in sessions where sessionOfPeer.values.filter({ $0 === session }).count < Nearby.playersPerSession {
            return session
        }
        return newSession()
    }

    private func id(of peer: MCPeerID) -> String {
        if let id = ids[peer] { return id }
        let id = UUID().uuidString
        ids[peer] = id
        peers[id] = peer
        return id
    }

    func send(_ data: Data, to peer: String?) {
        let targets = peer.flatMap { peers[$0] }.map { [$0] } ?? Array(sessionOfPeer.keys)
        for target in targets {
            guard let session = sessionOfPeer[target], session.connectedPeers.contains(target) else { continue }
            try? session.send(data, toPeers: [target], with: .reliable)
        }
    }

    func stop() {
        advertiser.stopAdvertisingPeer()
        sessions.forEach { $0.disconnect() }
        sessions = []
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
    }

    // MARK: Advertiser

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                    withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        DispatchQueue.main.async {
            let session = self.sessionWithRoom()
            self.sessionOfPeer[peerID] = session
            invitationHandler(true, session)
        }
    }

    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        DispatchQueue.main.async { self.onStatus?("Couldn't host nearby: \(error.localizedDescription)") }
    }

    // MARK: Session

    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            if state == .notConnected, self.sessionOfPeer[peerID] === session {
                self.sessionOfPeer[peerID] = nil
            }
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        DispatchQueue.main.async { self.onReceive?(self.id(of: peerID), data) }
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

/// A nearby table someone is hosting.
struct NearbyTable: Identifiable, Equatable {
    let id: String
    let host: String
    let room: String
    fileprivate let peer: MCPeerID
}

/// A player's side: lists nearby tables, then connects to the chosen host.
final class NearbyPlayer: NSObject, ObservableObject, Transport, MCSessionDelegate, MCNearbyServiceBrowserDelegate {
    var onReceive: ((String, Data) -> Void)?
    var onStatus: ((String) -> Void)?
    var onReady: (() -> Void)?
    let needsSealing = false

    @Published private(set) var tables: [NearbyTable] = []

    private let me: MCPeerID
    private let browser: MCNearbyServiceBrowser
    private let session: MCSession
    private var chosen: NearbyTable?
    private var retry: Timer?

    init(name: String) {
        me = MCPeerID(displayName: String(name.prefix(60)))
        browser = MCNearbyServiceBrowser(peer: me, serviceType: Nearby.serviceType)
        session = MCSession(peer: me, securityIdentity: nil, encryptionPreference: .required)
        super.init()
        browser.delegate = self
        session.delegate = self
        browser.startBrowsingForPeers()
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
    }

    func join(_ table: NearbyTable) {
        chosen = table
        onStatus?("Connecting to \(table.host)…")
        invite()
        // iOS reports a phone only once, so keep knocking until the host answers.
        retry?.invalidate()
        retry = Timer.scheduledTimer(withTimeInterval: 6, repeats: true) { [weak self] _ in
            guard let self, self.session.connectedPeers.isEmpty else { return }
            self.browser.stopBrowsingForPeers()
            self.browser.startBrowsingForPeers()
            self.invite()
        }
    }

    private func invite() {
        guard let table = chosen else { return }
        browser.invitePeer(table.peer, to: session, withContext: nil, timeout: 20)
    }

    func send(_ data: Data, to peer: String?) {
        guard !session.connectedPeers.isEmpty else { return }
        try? session.send(data, toPeers: session.connectedPeers, with: .reliable)
    }

    func stop() {
        retry?.invalidate()
        browser.stopBrowsingForPeers()
        session.disconnect()
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
    }

    // MARK: Browser

    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async {
            let table = NearbyTable(id: "\(peerID.hash)", host: info?["host"] ?? peerID.displayName, room: info?["room"] ?? "", peer: peerID)
            self.tables.removeAll { $0.peer == peerID || ($0.room == table.room && $0.host == table.host) }
            self.tables.append(table)
            // Found again after a drop: point the retry at the fresh peer.
            if let chosen = self.chosen, chosen.room == table.room, chosen.host == table.host { self.chosen = table }
        }
    }

    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async { self.tables.removeAll { $0.peer == peerID } }
    }

    // MARK: Session

    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            switch state {
            case .connected:
                self.onStatus?("Connected to \(peerID.displayName).")
                self.onReady?()
            case .connecting:
                self.onStatus?("Connecting to \(peerID.displayName)…")
            case .notConnected:
                self.onStatus?("Lost the host. Reconnecting…")
            @unknown default:
                break
            }
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        DispatchQueue.main.async { self.onReceive?("host", data) }
    }

    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
