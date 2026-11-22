import ActivityKit
import Foundation

/// What the back-seat camera phone thinks the baby is doing.
enum BabyMood: String, Codable, Hashable {
    case quiet, moving, crying, offline

    var title: String {
        switch self {
        case .quiet: return "Quiet"
        case .moving: return "Moving"
        case .crying: return "Crying"
        case .offline: return "Camera off"
        }
    }

    var symbol: String {
        switch self {
        case .quiet: return "moon.zzz.fill"
        case .moving: return "figure.wave"
        case .crying: return "speaker.wave.3.fill"
        case .offline: return "video.slash.fill"
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
    }

    var seatName: String
}
