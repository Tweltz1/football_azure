import ActivityKit
import Foundation

/// What the back-seat camera phone thinks the baby is doing.
enum BabyMood: String, Codable, Hashable {
    case quiet, moving, noise, fussing, crying, offline

    var title: String {
        switch self {
        case .quiet: return "Quiet"
        case .moving: return "Moving"
        case .noise: return "Making sounds"
        case .fussing: return "Fussing"
        case .crying: return "Crying"
        case .offline: return "Not connected"
        }
    }

    var symbol: String {
        switch self {
        case .quiet: return "moon.zzz.fill"
        case .moving: return "figure.wave"
        case .noise: return "waveform"
        case .fussing: return "exclamationmark.bubble.fill"
        case .crying: return "speaker.wave.3.fill"
        case .offline: return "wifi.slash"
        }
    }
}

/// The "baby card" Live Activity. iOS 26 shows it on the CarPlay Dashboard, and every
/// iPhone shows it on the Lock Screen. ActivityKit caps the whole state at 4 KB, so the
/// picture is a tiny JPEG (kept under ~2.3 KB) carried right inside the state. That needs
/// no App Group or server.
struct BabyActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var mood: BabyMood
        var thumb: Data?
        var updated: Date
        /// When the current mood started, so the card can say "Quiet for 12:03".
        var since: Date?
        /// The picture stopped arriving (camera phone locked); sound and alerts may still be working.
        var paused: Bool?
    }

    var seatName: String
}
