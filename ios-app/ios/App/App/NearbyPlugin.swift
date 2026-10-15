import Foundation
import Capacitor
import MultipeerConnectivity

/// Lets iPhones in the same room talk with no internet (Bluetooth and
/// peer-to-peer Wi-Fi), for the offline draft.
///
/// The commissioner's phone calls `host`, everyone else calls `join` and
/// connects to the host automatically. Messages are JSON strings. The host
/// decides who receives what, so sealed bids can go to the host only.
///
/// Events: `peerFound` {peerId, name}, `peerLost` {peerId},
/// `peerState` {peerId, name, state: connecting|connected|disconnected},
/// `message` {peerId, name, data}.
@objc(NearbyPlugin)
public class NearbyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NearbyPlugin"
    public let jsName = "Nearby"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "host", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "join", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "peers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // Bonjour service name; must match NSBonjourServices in Info.plist.
    private static let serviceType = "hl-draft"

    private var myPeer: MCPeerID?
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var roomCode = ""
    private var peersById: [String: MCPeerID] = [:]
    private var idsByPeer: [MCPeerID: String] = [:]

    private func start(name: String, room: String) {
        stopAll()
        let peer = MCPeerID(displayName: String(name.prefix(60)))
        let s = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
        s.delegate = self
        myPeer = peer
        session = s
        roomCode = room
    }

    /// Commissioner: advertise a draft room. Options: name, room (code players must match).
    @objc func host(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Commissioner"
        let room = call.getString("room") ?? ""
        DispatchQueue.main.async {
            self.start(name: name, room: room)
            guard let peer = self.myPeer else { return call.reject("Could not start") }
            let ad = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["room": room], serviceType: NearbyPlugin.serviceType)
            ad.delegate = self
            ad.startAdvertisingPeer()
            self.advertiser = ad
            call.resolve(["peerId": self.key(peer)])
        }
    }

    /// Player: look for the room with this code and connect to its host.
    @objc func join(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Player"
        let room = call.getString("room") ?? ""
        DispatchQueue.main.async {
            self.start(name: name, room: room)
            guard let peer = self.myPeer else { return call.reject("Could not start") }
            let br = MCNearbyServiceBrowser(peer: peer, serviceType: NearbyPlugin.serviceType)
            br.delegate = self
            br.startBrowsingForPeers()
            self.browser = br
            call.resolve(["peerId": self.key(peer)])
        }
    }

    /// Send a JSON string. Options: data, to (array of peerIds; omitted = everyone connected).
    @objc func send(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let s = self.session, let text = call.getString("data"), let payload = text.data(using: .utf8) else {
                return call.reject("Not connected")
            }
            var targets = s.connectedPeers
            if let to = call.getArray("to", String.self) {
                targets = to.compactMap { self.peersById[$0] }.filter { s.connectedPeers.contains($0) }
            }
            if targets.isEmpty { return call.reject("Nobody to send to") }
            do {
                try s.send(payload, toPeers: targets, with: .reliable)
                call.resolve(["sent": targets.count])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func peers(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let list = (self.session?.connectedPeers ?? []).map { ["peerId": self.key($0), "name": $0.displayName] }
            call.resolve(["peers": list])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopAll()
            call.resolve()
        }
    }

    private func stopAll() {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        session?.disconnect()
        advertiser = nil
        browser = nil
        session = nil
        peersById = [:]
        idsByPeer = [:]
    }

    /// Stable id for a peer during this session (display names can repeat).
    private func key(_ peer: MCPeerID) -> String {
        if let id = idsByPeer[peer] { return id }
        let id = UUID().uuidString
        idsByPeer[peer] = id
        peersById[id] = peer
        return id
    }
}

extension NearbyPlugin: MCNearbyServiceAdvertiserDelegate {
    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                           withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Only let in players who know this room's code.
        let theirRoom = context.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        DispatchQueue.main.async {
            invitationHandler(theirRoom == self.roomCode, self.session)
        }
    }

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        notifyListeners("error", data: ["message": error.localizedDescription])
    }
}

extension NearbyPlugin: MCNearbyServiceBrowserDelegate {
    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async {
            guard info?["room"] == self.roomCode, let s = self.session else { return }
            let id = self.key(peerID)
            self.notifyListeners("peerFound", data: ["peerId": id, "name": peerID.displayName])
            browser.invitePeer(peerID, to: s, withContext: self.roomCode.data(using: .utf8), timeout: 20)
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async {
            self.notifyListeners("peerLost", data: ["peerId": self.key(peerID)])
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        notifyListeners("error", data: ["message": error.localizedDescription])
    }
}

extension NearbyPlugin: MCSessionDelegate {
    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let label: String
        switch state {
        case .connected: label = "connected"
        case .connecting: label = "connecting"
        default: label = "disconnected"
        }
        DispatchQueue.main.async {
            let id = self.key(peerID)
            self.notifyListeners("peerState", data: ["peerId": id, "name": peerID.displayName, "state": label])
        }
    }

    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            let id = self.key(peerID)
            self.notifyListeners("message", data: ["peerId": id, "name": peerID.displayName, "data": text])
        }
    }

    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
