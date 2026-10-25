import SwiftUI
import UIKit

/// How a player's character looks. Sent to the table as a short code, so the engine
/// and the wire format only ever carry a string.
struct Look: Equatable {
    var skin = 2
    var hair = 1
    var hairColor = 0
    var hat = 0
    var hatColor = 0
    var top = 0
    var topColor = 0
    var pants = 0
    var shoes = 0
    var glasses = false
    var chain = false

    // MARK: Choices

    static let skins: [UInt32] = [0xF6D7C3, 0xEBB998, 0xD39A6E, 0xB0774B, 0x8A5634, 0x5E3A22]
    static let hairStyles = ["Buzz", "Short", "Curly", "Afro", "Long", "Bun", "Bald"]
    static let hairColors: [UInt32] = [0x1C1410, 0x4A2E1D, 0x8B5A2B, 0xD8B26A, 0xB8432F, 0x9A9A9A, 0x7B5CFF]
    static let hats = ["None", "Cap", "Backwards cap", "Beanie"]
    static let tops = ["Tee", "Hoodie", "Jersey"]
    static let clothes: [UInt32] = [0x8B6CFF, 0x3DDC97, 0xFF6B6B, 0xF5B84A, 0x2F80ED, 0x111318, 0xF2F2F2, 0x6B4E3D, 0xFF8BD0, 0x3A5A40]
    static let pantsColors: [UInt32] = [0x2B3A55, 0x1A1A1A, 0x6E6A60, 0xC2B280, 0x5A6B7A, 0x7A2E2E]
    static let shoeColors: [UInt32] = [0xF2F2F2, 0x111111, 0xFF6B6B, 0x2F80ED, 0xF5B84A]

    // MARK: Code

    /// "2.1.0.0.0.0.0.0.0.0.0": every field in order. Unknown or missing parts fall back to defaults.
    var code: String {
        [skin, hair, hairColor, hat, hatColor, top, topColor, pants, shoes, glasses ? 1 : 0, chain ? 1 : 0]
            .map(String.init).joined(separator: ".")
    }

    init() {}

    init(code: String) {
        let parts = code.split(separator: ".").map { Int($0) ?? 0 }
        func part(_ index: Int, _ count: Int) -> Int {
            guard parts.indices.contains(index) else { return 0 }
            return min(max(parts[index], 0), count - 1)
        }
        skin = part(0, Self.skins.count)
        hair = part(1, Self.hairStyles.count)
        hairColor = part(2, Self.hairColors.count)
        hat = part(3, Self.hats.count)
        hatColor = part(4, Self.clothes.count)
        top = part(5, Self.tops.count)
        topColor = part(6, Self.clothes.count)
        pants = part(7, Self.pantsColors.count)
        shoes = part(8, Self.shoeColors.count)
        glasses = part(9, 2) == 1
        chain = part(10, 2) == 1
    }

    static func random<G: RandomNumberGenerator>(using rng: inout G) -> Look {
        var look = Look()
        look.skin = Int.random(in: 0..<skins.count, using: &rng)
        look.hair = Int.random(in: 0..<hairStyles.count, using: &rng)
        look.hairColor = Int.random(in: 0..<5, using: &rng)
        look.hat = Bool.random(using: &rng) ? 0 : Int.random(in: 1..<hats.count, using: &rng)
        look.hatColor = Int.random(in: 0..<clothes.count, using: &rng)
        look.top = Int.random(in: 0..<tops.count, using: &rng)
        look.topColor = Int.random(in: 0..<clothes.count, using: &rng)
        look.pants = Int.random(in: 0..<pantsColors.count, using: &rng)
        look.shoes = Int.random(in: 0..<shoeColors.count, using: &rng)
        look.glasses = Int.random(in: 0..<4, using: &rng) == 0
        look.chain = Int.random(in: 0..<3, using: &rng) == 0
        return look
    }

    static func random() -> Look {
        var rng = SystemRandomNumberGenerator()
        return random(using: &rng)
    }

    /// The same look every time for a given Hood crew member, so bots are recognizable.
    static func crew(_ index: Int) -> Look {
        var rng = LookRNG(seed: UInt64(index + 1) &* 0x9E37_79B9_7F4A_7C15)
        return random(using: &rng)
    }
}

/// Small seeded generator for the crew's fixed looks.
private struct LookRNG: RandomNumberGenerator {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

/// A flat, blocky head-and-shoulders picture of a look, for lists and buttons.
struct LookPortrait: View {
    let look: Look
    var size: CGFloat = 44
    var dimmed = false

    init(look: Look, size: CGFloat = 44, dimmed: Bool = false) {
        self.look = look
        self.size = size
        self.dimmed = dimmed
    }

    init(code: String, size: CGFloat = 44, dimmed: Bool = false) {
        self.init(look: Look(code: code), size: size, dimmed: dimmed)
    }

    var body: some View {
        let s = size
        let skin = Color(hex: Look.skins[look.skin])
        let hair = Color(hex: Look.hairColors[look.hairColor])
        let shirt = Color(hex: Look.clothes[look.topColor])
        let hat = Color(hex: Look.clothes[look.hatColor])
        ZStack {
            Circle().fill(Theme.panel2)
            // Shoulders
            UnevenRoundedRectangle(topLeadingRadius: s * 0.2, topTrailingRadius: s * 0.2)
                .fill(shirt)
                .frame(width: s * 0.78, height: s * 0.3)
                .offset(y: s * 0.36)
            if look.chain {
                Capsule().stroke(Color(hex: 0xF5C542), lineWidth: s * 0.03)
                    .frame(width: s * 0.26, height: s * 0.12)
                    .offset(y: s * 0.27)
            }
            // Hair behind the head for long styles
            if look.hair == 4 {
                RoundedRectangle(cornerRadius: s * 0.1).fill(hair)
                    .frame(width: s * 0.54, height: s * 0.5)
                    .offset(y: s * 0.02)
            }
            if look.hair == 3 && look.hat == 0 {
                Circle().fill(hair).frame(width: s * 0.66).offset(y: -s * 0.14)
            }
            // Head
            RoundedRectangle(cornerRadius: s * 0.12).fill(skin)
                .frame(width: s * 0.46, height: s * 0.46)
                .offset(y: -s * 0.04)
            // Eyes
            HStack(spacing: s * 0.1) {
                Circle().fill(.black).frame(width: s * 0.06)
                Circle().fill(.black).frame(width: s * 0.06)
            }
            .offset(y: -s * 0.04)
            if look.glasses {
                HStack(spacing: s * 0.03) {
                    RoundedRectangle(cornerRadius: s * 0.02).stroke(.black, lineWidth: s * 0.025).frame(width: s * 0.13, height: s * 0.09)
                    RoundedRectangle(cornerRadius: s * 0.02).stroke(.black, lineWidth: s * 0.025).frame(width: s * 0.13, height: s * 0.09)
                }
                .offset(y: -s * 0.04)
            }
            // Hair on top
            if look.hat == 0 {
                switch look.hair {
                case 0: Rectangle().fill(hair).frame(width: s * 0.46, height: s * 0.06).offset(y: -s * 0.24)
                case 1, 4, 5:
                    UnevenRoundedRectangle(topLeadingRadius: s * 0.12, topTrailingRadius: s * 0.12)
                        .fill(hair).frame(width: s * 0.5, height: s * 0.13).offset(y: -s * 0.25)
                    if look.hair == 5 { Circle().fill(hair).frame(width: s * 0.18).offset(y: -s * 0.36) }
                case 2:
                    HStack(spacing: -s * 0.04) {
                        ForEach(0..<4, id: \.self) { _ in Circle().fill(hair).frame(width: s * 0.15) }
                    }
                    .offset(y: -s * 0.27)
                default: EmptyView()
                }
            } else {
                hatView(color: hat, size: s)
            }
        }
        .frame(width: s, height: s)
        .clipShape(Circle())
        .saturation(dimmed ? 0 : 1)
        .opacity(dimmed ? 0.45 : 1)
    }

    @ViewBuilder private func hatView(color: Color, size s: CGFloat) -> some View {
        switch look.hat {
        case 3:
            UnevenRoundedRectangle(topLeadingRadius: s * 0.2, topTrailingRadius: s * 0.2)
                .fill(color).frame(width: s * 0.52, height: s * 0.2).offset(y: -s * 0.25)
        default:
            UnevenRoundedRectangle(topLeadingRadius: s * 0.16, topTrailingRadius: s * 0.16)
                .fill(color).frame(width: s * 0.5, height: s * 0.15).offset(y: -s * 0.26)
            Capsule().fill(color)
                .frame(width: s * 0.3, height: s * 0.05)
                .offset(x: look.hat == 1 ? s * 0.2 : -s * 0.2, y: -s * 0.19)
        }
    }
}
