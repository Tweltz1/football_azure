import Foundation
import UIKit
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
/// `message` {peerId, name, data}, `status` {text} (what the radio is doing, shown while connecting),
/// `error` {message}, `hostFound` {peerId, name, room, league} and `hostLost` {peerId} (while scanning).
@objc(NearbyPlugin)
public class NearbyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NearbyPlugin"
    public let jsName = "Nearby"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "host", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "join", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "peers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    // Bonjour service name; must match NSBonjourServices in Info.plist.
    private static let serviceType = "hl-draft"

    private var myPeer: MCPeerID?
    // An MCSession holds at most 8 phones, so the host opens another one for every 7 players.
    private var sessions: [MCSession] = []
    private var sessionOfPeer: [MCPeerID: MCSession] = [:]
    private static let playersPerSession = kMCSessionMaximumNumberOfPeers - 1
    private var session: MCSession? { return sessions.first }
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var roomCode = ""
    // Scanning: list every nearby hosted draft (like AirDrop) without connecting to any.
    private var scanning = false
    private var peersById: [String: MCPeerID] = [:]
    private var idsByPeer: [MCPeerID: String] = [:]

    override public func load() {
        // iOS stops advertising and browsing while the app is in the background or the screen is locked.
        // Start them again as soon as the app is back on screen.
        NotificationCenter.default.addObserver(self, selector: #selector(appBecameActive),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func appBecameActive() {
        DispatchQueue.main.async {
            if let ad = self.advertiser {
                ad.stopAdvertisingPeer()
                ad.startAdvertisingPeer()
                self.status("Hosting again after the app came back on screen.")
            }
            if let br = self.browser {
                br.stopBrowsingForPeers()
                br.startBrowsingForPeers()
                self.status("Looking again after the app came back on screen.")
            }
        }
    }

    private func status(_ text: String) {
        notifyListeners("status", data: ["text": text])
    }

    private func start(name: String, room: String) {
        stopAll()
        let peer = MCPeerID(displayName: String(name.prefix(60)))
        myPeer = peer
        roomCode = room
        scanning = false
        sessions = [newSession(peer)]
    }

    private func newSession(_ peer: MCPeerID) -> MCSession {
        let s = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
        s.delegate = self
        return s
    }

    /// Host: a session with room for one more player (counting players still connecting).
    private func sessionWithRoom() -> MCSession? {
        guard let peer = myPeer else { return nil }
        for s in sessions where sessionOfPeer.values.filter({ $0 === s }).count < NearbyPlugin.playersPerSession {
            return s
        }
        let s = newSession(peer)
        sessions.append(s)
        return s
    }

    private var connectedPeers: [MCPeerID] {
        return sessions.flatMap { $0.connectedPeers }
    }

    /// Commissioner: advertise a draft room. Options: name, room (code players must match), league (shown to nearby phones).
    @objc func host(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Commissioner"
        let room = call.getString("room") ?? ""
        let league = String((call.getString("league") ?? "").prefix(60))
        DispatchQueue.main.async {
            self.start(name: name, room: room)
            guard let peer = self.myPeer else { return call.reject("Could not start") }
            let ad = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["room": room, "league": league], serviceType: NearbyPlugin.serviceType)
            ad.delegate = self
            ad.startAdvertisingPeer()
            self.advertiser = ad
            // The commissioner's phone must stay awake: a locked screen stops the radio.
            UIApplication.shared.isIdleTimerDisabled = true
            self.status("Hosting room \(room).")
            call.resolve(["peerId": self.key(peer)])
        }
    }

    /// Player: look for the room with this code and connect to its host.
    @objc func join(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Player"
        let room = call.getString("room") ?? ""
        DispatchQueue.main.async {
            // Already connected to this room (the page reloads after joining): keep the connection
            // and tell the page who is connected, instead of dropping it and searching again.
            if !self.scanning, self.advertiser == nil, self.browser != nil, self.roomCode == room,
               let peer = self.myPeer, peer.displayName == String(name.prefix(60)), !self.connectedPeers.isEmpty {
                call.resolve(["peerId": self.key(peer), "reused": true])
                for p in self.connectedPeers {
                    self.notifyListeners("peerState", data: ["peerId": self.key(p), "name": p.displayName, "state": "connected"])
                }
                self.status("Still connected to room \(room).")
                return
            }
            self.start(name: name, room: room)
            guard let peer = self.myPeer else { return call.reject("Could not start") }
            let br = MCNearbyServiceBrowser(peer: peer, serviceType: NearbyPlugin.serviceType)
            br.delegate = self
            br.startBrowsingForPeers()
            self.browser = br
            self.status("Looking for room \(room)...")
            call.resolve(["peerId": self.key(peer)])
        }
    }

    /// Player: list nearby hosted drafts (hostFound/hostLost events) without joining one.
    @objc func scan(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "Player"
        DispatchQueue.main.async {
            self.start(name: name, room: "")
            self.scanning = true
            guard let peer = self.myPeer else { return call.reject("Could not start") }
            let br = MCNearbyServiceBrowser(peer: peer, serviceType: NearbyPlugin.serviceType)
            br.delegate = self
            br.startBrowsingForPeers()
            self.browser = br
            self.status("Looking for nearby drafts...")
            call.resolve(["peerId": self.key(peer)])
        }
    }

    /// Send a JSON string. Options: data, to (array of peerIds; omitted = everyone connected).
    @objc func send(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard !self.sessions.isEmpty, let text = call.getString("data"), let payload = text.data(using: .utf8) else {
                return call.reject("Not connected")
            }
            let wanted = call.getArray("to", String.self).map { Set($0.compactMap { self.peersById[$0] }) }
            var sent = 0
            do {
                for s in self.sessions {
                    let targets = s.connectedPeers.filter { wanted?.contains($0) ?? true }
                    if targets.isEmpty { continue }
                    try s.send(payload, toPeers: targets, with: .reliable)
                    sent += targets.count
                }
            } catch {
                return call.reject(error.localizedDescription)
            }
            if sent == 0 { return call.reject("Nobody to send to") }
            call.resolve(["sent": sent])
        }
    }

    @objc func peers(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let list = self.connectedPeers.map { ["peerId": self.key($0), "name": $0.displayName] }
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
        sessions.forEach { $0.disconnect() }
        advertiser = nil
        browser = nil
        UIApplication.shared.isIdleTimerDisabled = false
        sessions = []
        sessionOfPeer = [:]
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
            guard theirRoom == self.roomCode, let s = self.sessionWithRoom() else {
                self.status("Turned away \(peerID.displayName): room \(theirRoom) isn't this room (\(self.roomCode)).")
                return invitationHandler(false, nil)
            }
            self.status("\(peerID.displayName) is joining...")
            self.sessionOfPeer[peerID] = s
            invitationHandler(true, s)
        }
    }

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        notifyListeners("error", data: ["message": "Couldn't start hosting: \(error.localizedDescription). Check Settings > Privacy & Security > Local Network > Hood League is on."])
    }
}

extension NearbyPlugin: MCNearbyServiceBrowserDelegate {
    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        DispatchQueue.main.async {
            if self.scanning {
                self.status("Found \(peerID.displayName)'s draft.")
                self.notifyListeners("hostFound", data: ["peerId": self.key(peerID), "name": peerID.displayName,
                                                         "room": info?["room"] ?? "", "league": info?["league"] ?? ""])
                return
            }
            guard info?["room"] == self.roomCode, let s = self.session else {
                self.status("Found \(peerID.displayName), but it's hosting room \(info?["room"] ?? "?"), not \(self.roomCode).")
                return
            }
            self.status("Found \(peerID.displayName)'s phone. Connecting...")
            let id = self.key(peerID)
            self.notifyListeners("peerFound", data: ["peerId": id, "name": peerID.displayName])
            browser.invitePeer(peerID, to: s, withContext: self.roomCode.data(using: .utf8), timeout: 20)
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async {
            self.notifyListeners(self.scanning ? "hostLost" : "peerLost", data: ["peerId": self.key(peerID)])
        }
    }

    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        notifyListeners("error", data: ["message": "Couldn't look for nearby phones: \(error.localizedDescription). Check Settings > Privacy & Security > Local Network > Hood League is on."])
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
            if state == .notConnected { self.sessionOfPeer[peerID] = nil }
            self.status("\(peerID.displayName): \(label).")
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
