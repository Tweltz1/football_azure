import AuthenticationServices
import Foundation
import RogueEngine
import Security
import UIKit

/// Wins and games, kept on the phone and, once signed in, on the Hood League Supabase project.
struct Stats: Codable, Equatable {
    var games = 0
    var wins = 0
    var crewWins = 0
    var narcWins = 0
    var snitchWins = 0

    func merged(with other: Stats) -> Stats {
        Stats(games: max(games, other.games), wins: max(wins, other.wins), crewWins: max(crewWins, other.crewWins),
              narcWins: max(narcWins, other.narcWins), snitchWins: max(snitchWins, other.snitchWins))
    }
}

/// A row of `hood_protocol_profiles`.
struct Profile: Codable, Identifiable, Equatable {
    var id: String { userId }
    var userId: String
    var displayName: String
    var look: String
    var games: Int
    var wins: Int
    var crewWins: Int
    var narcWins: Int
    var snitchWins: Int

    var stats: Stats {
        Stats(games: games, wins: wins, crewWins: crewWins, narcWins: narcWins, snitchWins: snitchWins)
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id", displayName = "display_name", look, games, wins
        case crewWins = "crew_wins", narcWins = "narc_wins", snitchWins = "snitch_wins"
    }
}

enum AccountError: LocalizedError {
    case notSetUp
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notSetUp: return "Accounts aren't set up in this build."
        case let .server(message): return message
        }
    }
}

/// Sign-in (email and password, or Google) against Supabase Auth, spoken over plain HTTPS
/// so the app needs no extra packages. Tokens live in the Keychain.
@MainActor
final class Account: NSObject, ObservableObject {
    static let shared = Account()
    static let redirect = "com.tweltz1.hoodprotocol://auth"

    struct Session: Codable {
        var accessToken: String
        var refreshToken: String
        var expiresAt: Date
        var userId: String
        var email: String?
    }

    @Published private(set) var session: Session?
    @Published private(set) var profile: Profile?
    @Published private(set) var localStats: Stats

    var isSignedIn: Bool { session != nil }

    /// What unlocks are based on: the best of this phone and the account.
    var stats: Stats { profile.map { localStats.merged(with: $0.stats) } ?? localStats }

    private static let statsKey = "stats"
    private var authSession: ASWebAuthenticationSession?

    private override init() {
        localStats = (UserDefaults.standard.data(forKey: Self.statsKey)).flatMap { try? JSONDecoder().decode(Stats.self, from: $0) } ?? Stats()
        session = Keychain.load(Session.self, key: "session")
        super.init()
        if session != nil {
            Task { await self.refreshProfile() }
        }
    }

    // MARK: Signing in

    enum SignUpResult { case signedIn, checkEmail }

    func signUp(email: String, password: String) async throws -> SignUpResult {
        let json = try await auth("signup", query: ["redirect_to": Self.redirect], body: ["email": email, "password": password])
        if json["access_token"] != nil {
            try await adopt(json)
            return .signedIn
        }
        return .checkEmail
    }

    func signIn(email: String, password: String) async throws {
        let json = try await auth("token", query: ["grant_type": "password"], body: ["email": email, "password": password])
        try await adopt(json)
    }

    func sendPasswordReset(email: String) async throws {
        _ = try await auth("recover", query: ["redirect_to": Self.redirect], body: ["email": email])
    }

    func signInWithGoogle() async throws {
        guard let config = SupabaseConfig.current else { throw AccountError.notSetUp }
        var parts = URLComponents(url: config.url.appendingPathComponent("auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        parts.queryItems = [URLQueryItem(name: "provider", value: "google"),
                            URLQueryItem(name: "redirect_to", value: Self.redirect),
                            URLQueryItem(name: "prompt", value: "select_account")]
        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: parts.url!, callbackURLScheme: "com.tweltz1.hoodprotocol") { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: error ?? AccountError.server("Sign-in didn't finish."))
                }
            }
            session.presentationContextProvider = self
            authSession = session
            session.start()
        }
        authSession = nil
        try await handle(callback)
    }

    /// The link in a confirmation or password email, or the Google sign-in coming back.
    func handle(_ url: URL) async throws {
        guard url.scheme == "com.tweltz1.hoodprotocol" else { return }
        var values: [String: String] = [:]
        for source in [url.fragment, URLComponents(url: url, resolvingAgainstBaseURL: false)?.query] {
            for pair in (source ?? "").split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1).map { String($0).removingPercentEncoding ?? String($0) }
                if kv.count == 2 { values[kv[0]] = kv[1].replacingOccurrences(of: "+", with: " ") }
            }
        }
        if let message = values["error_description"] ?? values["error"] { throw AccountError.server(message) }
        guard let access = values["access_token"], let refresh = values["refresh_token"] else { return }
        let expires = Double(values["expires_in"] ?? "") ?? 3600
        try await adopt(["access_token": access, "refresh_token": refresh, "expires_in": expires])
    }

    func signOut() {
        session = nil
        profile = nil
        Keychain.delete(key: "session")
    }

    /// Deletes this player's Hood Protocol profile and stats, then signs out.
    func deleteAccount() async throws {
        _ = try await rpc("hp_delete_profile", [:])
        localStats = Stats()
        saveLocal()
        signOut()
    }

    // MARK: Stats

    /// Counts a finished game. Returns the names of anything it unlocked.
    @discardableResult
    func recordGame(role: Role, won: Bool) -> [String] {
        let before = stats
        localStats.games += 1
        if won {
            localStats.wins += 1
            switch role {
            case .crew: localStats.crewWins += 1
            case .saboteur: localStats.narcWins += 1
            case .rogueAI: localStats.snitchWins += 1
            }
        }
        saveLocal()
        if isSignedIn {
            Task {
                let key: String
                switch role {
                case .crew: key = "crew"
                case .saboteur: key = "narc"
                case .rogueAI: key = "snitch"
                }
                if let row: Profile = try? await self.rpcRow("hp_record_game", ["p_role": key, "p_won": won]) {
                    self.profile = row
                }
            }
        }
        return Unlocks.newlyUnlocked(before: before, after: stats)
    }

    /// Saves name and look to the account and merges this phone's counts into it.
    func syncProfile(name: String, look: String) async {
        guard isSignedIn else { return }
        let merged = stats
        let row: Profile? = try? await rpcRow("hp_save_profile", [
            "p_name": name, "p_look": look, "p_games": merged.games, "p_wins": merged.wins,
            "p_crew_wins": merged.crewWins, "p_narc_wins": merged.narcWins, "p_snitch_wins": merged.snitchWins
        ])
        if let row { profile = row }
    }

    func refreshProfile() async {
        guard let session else { return }
        let rows: [Profile]? = try? await rest("hood_protocol_profiles", query: [
            "select": "*", "user_id": "eq.\(session.userId)"
        ])
        if let row = rows?.first { profile = row }
    }

    func leaderboard() async throws -> [Profile] {
        try await rest("hood_protocol_profiles", query: ["select": "*", "order": "wins.desc,games.asc", "limit": "50", "games": "gt.0"])
    }

    private func saveLocal() {
        if let data = try? JSONEncoder().encode(localStats) { UserDefaults.standard.set(data, forKey: Self.statsKey) }
    }

    // MARK: Network

    private func adopt(_ json: [String: Any]) async throws {
        guard let access = json["access_token"] as? String, let refresh = json["refresh_token"] as? String else {
            throw AccountError.server("Sign-in didn't return a session.")
        }
        let expiresIn = (json["expires_in"] as? Double) ?? (json["expires_in"] as? Int).map(Double.init) ?? 3600
        var user = json["user"] as? [String: Any]
        if user == nil {
            user = try await authGet("user", token: access)
        }
        guard let id = user?["id"] as? String else { throw AccountError.server("Couldn't read your account.") }
        let made = Session(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(expiresIn - 60),
                           userId: id, email: user?["email"] as? String)
        session = made
        Keychain.save(made, key: "session")
        await refreshProfile()
    }

    /// A fresh access token, refreshing the session when it has expired.
    private func token() async throws -> String {
        guard let current = session else { throw AccountError.server("Sign in first.") }
        if current.expiresAt > Date() { return current.accessToken }
        do {
            let json = try await auth("token", query: ["grant_type": "refresh_token"], body: ["refresh_token": current.refreshToken])
            try await adopt(json)
            return session?.accessToken ?? current.accessToken
        } catch {
            signOut()
            throw error
        }
    }

    private func request(_ path: String, query: [String: String] = [:], method: String = "GET",
                         body: [String: Any]? = nil, token: String? = nil) throws -> URLRequest {
        guard let config = SupabaseConfig.current else { throw AccountError.notSetUp }
        var parts = URLComponents(url: config.url.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { parts.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: parts.url!)
        request.httpMethod = method
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token ?? config.key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        return request
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = json?["msg"] ?? json?["error_description"] ?? json?["message"] ?? json?["error"]
            throw AccountError.server((message as? String) ?? "Something went wrong (\(status)).")
        }
        return data
    }

    private func auth(_ endpoint: String, query: [String: String], body: [String: Any]) async throws -> [String: Any] {
        let data = try await send(request("auth/v1/\(endpoint)", query: query, method: "POST", body: body))
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    }

    private func authGet(_ endpoint: String, token: String) async throws -> [String: Any] {
        let data = try await send(request("auth/v1/\(endpoint)", token: token))
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    }

    private func rpc(_ name: String, _ body: [String: Any]) async throws -> Data {
        try await send(request("rest/v1/rpc/\(name)", method: "POST", body: body, token: try await token()))
    }

    private func rpcRow<T: Decodable>(_ name: String, _ body: [String: Any]) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await rpc(name, body))
    }

    private func rest<T: Decodable>(_ table: String, query: [String: String]) async throws -> T {
        var token: String?
        if isSignedIn { token = try? await self.token() }
        return try JSONDecoder().decode(T.self, from: try await send(request("rest/v1/\(table)", query: query, token: token)))
    }
}

extension Account: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}

/// The Hood League Supabase project, filled in at build time (see project.yml).
enum SupabaseConfig {
    static var current: (url: URL, key: String)? {
        let info = Bundle.main.infoDictionary
        guard let raw = info?["SupabaseURL"] as? String, let key = info?["SupabaseAnonKey"] as? String,
              !key.isEmpty, !raw.contains("$("), let url = URL(string: raw) else { return nil }
        return (url, key)
    }
}

/// Small Keychain wrapper for the sign-in session.
enum Keychain {
    private static let service = "com.tweltz1.hoodprotocol"

    static func save<T: Encodable>(_ value: T, key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        delete(key: key)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: key, kSecValueData as String: data,
                                    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: key, kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func delete(key: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
    }
}
