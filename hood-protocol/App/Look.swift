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
    /// 0 none, 1 beard, 2 mustache
    var facial = 0
    var shades = false
    var shorts = false

    // MARK: Choices

    static let skins: [UInt32] = [0xF6D7C3, 0xEBB998, 0xD39A6E, 0xB0774B, 0x8A5634, 0x5E3A22, 0xF1C7A5, 0xEABF9B, 0xF4CFB0, 0xE8B892]
    static let hairStyles = ["Buzz", "Short", "Curly", "Afro", "Long", "Bun", "Bald"]
    static let hairColors: [UInt32] = [0x1C1410, 0x4A2E1D, 0x8B5A2B, 0xD8B26A, 0xB8432F, 0x9A9A9A, 0x7B5CFF, 0x2B1D16]
    static let hats = ["None", "Cap", "Backwards cap", "Beanie"]
    static let tops = ["Tee", "Hoodie", "Jersey", "Tank", "Dress"]
    static let facialHair = ["None", "Beard", "Mustache"]
    static let clothes: [UInt32] = [0x8B6CFF, 0x3DDC97, 0xFF6B6B, 0xF5B84A, 0x2F80ED, 0x111318, 0xF2F2F2, 0x6B4E3D, 0xFF8BD0, 0x3A5A40,
                                    // The Hood League crew's colors
                                    0x2340C8, 0xA9ABB2, 0x6D6A70, 0x1C1E26, 0x203731, 0xD1237A, 0xD33B3B, 0x7A7C62, 0x1F5A3B,
                                    0x8F9298, 0x8E1D2C, 0x1F2A44, 0xC9B98A, 0xE7B94A, 0x24242A, 0xB07A4C, 0x2A3A30]
    static let pantsColors: [UInt32] = [0x2B3A55, 0x1A1A1A, 0x6E6A60, 0xC2B280, 0x5A6B7A, 0x7A2E2E, 0x1B1B22, 0x9A9CA3, 0x26304F, 0xA3A5AB, 0x3A3F4A, 0xD8C39A, 0xB4B6BB]
    static let shoeColors: [UInt32] = [0xF2F2F2, 0x111111, 0xFF6B6B, 0x2F80ED, 0xF5B84A]

    // MARK: Code

    /// "2.1.0.0.0.0.0.0.0.0.0": every field in order. Unknown or missing parts fall back to defaults.
    var code: String {
        [skin, hair, hairColor, hat, hatColor, top, topColor, pants, shoes, glasses ? 1 : 0, chain ? 1 : 0,
         facial, shades ? 1 : 0, shorts ? 1 : 0]
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
        facial = part(11, Self.facialHair.count)
        shades = part(12, 2) == 1
        shorts = part(13, 2) == 1
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
        look.facial = Int.random(in: 0..<5, using: &rng) == 0 ? Int.random(in: 1...2, using: &rng) : 0
        look.shades = Int.random(in: 0..<6, using: &rng) == 0
        look.shorts = Int.random(in: 0..<4, using: &rng) == 0
        return look
    }

    static func random() -> Look {
        var rng = SystemRandomNumberGenerator()
        return random(using: &rng)
    }

    /// The Hood League crew as drawn on the Hood League site, in `Crew.names` order.
    static func crew(_ index: Int) -> Look {
        func c(_ hex: UInt32) -> Int { clothes.firstIndex(of: hex) ?? 0 }
        func p(_ hex: UInt32) -> Int { pantsColors.firstIndex(of: hex) ?? 0 }
        var look = Look()
        look.skin = [6, 7, 8, 6, 9, 8, 7, 6, 8, 7][((index % 10) + 10) % 10]
        look.hair = 0
        look.hat = 1
        look.shoes = 0
        switch ((index % 10) + 10) % 10 {
        case 0: look.hat = 2; look.hatColor = c(0x8E1D2C); look.top = 3; look.topColor = c(0x2340C8); look.pants = p(0x1B1B22); look.shorts = true
        case 1: look.hatColor = c(0x1F2A44); look.top = 1; look.topColor = c(0xA9ABB2); look.pants = p(0x9A9CA3); look.facial = 1
        case 2: look.hatColor = c(0xC9B98A); look.top = 0; look.topColor = c(0x6D6A70); look.pants = p(0x26304F)
        case 3: look.hat = 2; look.hatColor = c(0xE7B94A); look.top = 1; look.topColor = c(0x1C1E26); look.pants = p(0xA3A5AB)
        case 4: look.hatColor = c(0x203731); look.top = 2; look.topColor = c(0x203731); look.pants = p(0x3A3F4A); look.shades = true; look.facial = 2
        case 5: look.hat = 0; look.hair = 4; look.hairColor = 7; look.top = 4; look.topColor = c(0xD1237A); look.shoes = 2
        case 6: look.hatColor = c(0x24242A); look.top = 1; look.topColor = c(0xD33B3B); look.pants = p(0x1B1B22); look.facial = 1
        case 7: look.hatColor = c(0xB07A4C); look.top = 0; look.topColor = c(0x7A7C62); look.pants = p(0x1B1B22)
        case 8: look.hatColor = c(0x2A3A30); look.top = 2; look.topColor = c(0x1F5A3B); look.pants = p(0xD8C39A); look.shorts = true
        default: look.hatColor = c(0x24242A); look.top = 1; look.topColor = c(0x8F9298); look.pants = p(0xB4B6BB)
        }
        return look
    }

    /// A new player's first look: one of the Hood crew.
    static func starter() -> Look { crew(Int.random(in: 0..<10)) }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

/// A flat head-and-shoulders picture of a look in the Hood League crew style, for lists and buttons.
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
        let ink = Color(hex: 0x1A1A22)
        ZStack {
            Circle().fill(Theme.panel2)
            // Shoulders
            Ellipse().fill(look.top == 3 ? skin : shirt)
                .overlay(Ellipse().stroke(ink, lineWidth: s * 0.03))
                .frame(width: s * 0.84, height: s * 0.5)
                .offset(y: s * 0.48)
            if look.top == 3 {
                Rectangle().fill(shirt).frame(width: s * 0.4, height: s * 0.3).offset(y: s * 0.44)
            }
            if look.top == 1 {
                Circle().fill(shirt).frame(width: s * 0.66).offset(y: -s * 0.02)
            }
            if look.hair == 4 {
                RoundedRectangle(cornerRadius: s * 0.14).fill(hair).frame(width: s * 0.6, height: s * 0.56).offset(y: s * 0.04)
            }
            if look.hair == 3 && look.hat == 0 {
                Circle().fill(hair).frame(width: s * 0.72).offset(y: -s * 0.12)
            }
            // Ears and head
            HStack(spacing: s * 0.4) {
                Circle().fill(skin).frame(width: s * 0.13)
                Circle().fill(skin).frame(width: s * 0.13)
            }
            .offset(y: -s * 0.02)
            Circle().fill(skin)
                .overlay(Circle().stroke(ink, lineWidth: s * 0.03))
                .frame(width: s * 0.5)
                .offset(y: -s * 0.04)
            if look.facial == 1 {
                Ellipse().fill(Color(hex: 0x8A5A3C).opacity(0.55)).frame(width: s * 0.4, height: s * 0.2).offset(y: s * 0.11)
            }
            // Eyes or shades
            if look.shades {
                HStack(spacing: s * 0.04) {
                    RoundedRectangle(cornerRadius: s * 0.04).fill(.black).frame(width: s * 0.13, height: s * 0.09)
                    RoundedRectangle(cornerRadius: s * 0.04).fill(.black).frame(width: s * 0.13, height: s * 0.09)
                }
                .offset(y: -s * 0.05)
            } else {
                HStack(spacing: s * 0.11) {
                    Ellipse().fill(ink).frame(width: s * 0.055, height: s * 0.08)
                    Ellipse().fill(ink).frame(width: s * 0.055, height: s * 0.08)
                }
                .offset(y: -s * 0.05)
            }
            if look.glasses && !look.shades {
                HStack(spacing: s * 0.03) {
                    Circle().stroke(ink, lineWidth: s * 0.022).frame(width: s * 0.14)
                    Circle().stroke(ink, lineWidth: s * 0.022).frame(width: s * 0.14)
                }
                .offset(y: -s * 0.05)
            }
            // Rosy cheeks and a big smile
            HStack(spacing: s * 0.22) {
                Circle().fill(Color(hex: 0xFF7F8F).opacity(0.45)).frame(width: s * 0.08)
                Circle().fill(Color(hex: 0xFF7F8F).opacity(0.45)).frame(width: s * 0.08)
            }
            .offset(y: s * 0.03)
            if look.facial == 2 {
                Capsule().fill(Color(hex: 0x3A2418)).frame(width: s * 0.15, height: s * 0.035).offset(y: s * 0.045)
            }
            SmileShape().fill(.white)
                .overlay(SmileShape().stroke(ink, lineWidth: s * 0.02))
                .frame(width: s * 0.15, height: s * 0.08)
                .offset(y: s * 0.1)
            if look.chain {
                Capsule().stroke(Color(hex: 0xF5C542), lineWidth: s * 0.03)
                    .frame(width: s * 0.28, height: s * 0.1)
                    .offset(y: s * 0.3)
            }
            // Hair or hat on top
            if look.hat == 0 {
                switch look.hair {
                case 0, 1, 4, 5:
                    TopCap().fill(hair).frame(width: s * 0.52, height: s * (look.hair == 0 ? 0.14 : 0.2)).offset(y: -s * (look.hair == 0 ? 0.24 : 0.22))
                    if look.hair == 5 { Circle().fill(hair).frame(width: s * 0.18).offset(y: -s * 0.36) }
                case 2:
                    HStack(spacing: -s * 0.05) {
                        ForEach(0..<4, id: \.self) { _ in Circle().fill(hair).frame(width: s * 0.16) }
                    }
                    .offset(y: -s * 0.27)
                default: EmptyView()
                }
            } else {
                hat(Color(hex: Look.clothes[look.hatColor]), ink: ink, size: s)
            }
        }
        .frame(width: s, height: s)
        .clipShape(Circle())
        .saturation(dimmed ? 0 : 1)
        .opacity(dimmed ? 0.45 : 1)
    }

    @ViewBuilder private func hat(_ color: Color, ink: Color, size s: CGFloat) -> some View {
        TopCap().fill(color)
            .overlay(TopCap().stroke(ink, lineWidth: s * 0.025))
            .frame(width: s * 0.54, height: s * (look.hat == 3 ? 0.26 : 0.22))
            .offset(y: -s * 0.22)
        switch look.hat {
        case 1:
            Capsule().fill(color).overlay(Capsule().stroke(ink, lineWidth: s * 0.02))
                .frame(width: s * 0.6, height: s * 0.07)
                .offset(y: -s * 0.12)
        case 2:
            RoundedRectangle(cornerRadius: s * 0.02).fill(Color(hex: 0xE9E3D0))
                .frame(width: s * 0.13, height: s * 0.05)
                .offset(y: -s * 0.15)
        default:
            Capsule().fill(color.opacity(0.85)).frame(width: s * 0.56, height: s * 0.06).offset(y: -s * 0.12)
        }
    }
}

/// The top half of an ellipse, for hair and hats.
private struct TopCap: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addQuadCurve(to: CGPoint(x: rect.midX, y: rect.minY), control: CGPoint(x: rect.minX, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.maxY), control: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

/// A D-shaped open smile.
private struct SmileShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY), control: CGPoint(x: rect.midX, y: rect.maxY * 2 - rect.minY))
        path.closeSubpath()
        return path
    }
}
