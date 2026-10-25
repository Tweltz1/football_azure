import SwiftUI

/// The basement with the crew hanging out in it. `night` runs from 0 (8 PM) to 1 (sunrise),
/// so the room gets darker as the all-nighter goes on.
struct BasementScene: View {
    struct Guest: Identifiable {
        var id: Int
        var avatar: Int
        var name: String? = nil
        var badge: String? = nil
        var dimmed = false
        var highlighted = false
    }

    var seats: [Guest]
    var night: Double = 0
    var showClock = false

    /// Where each seat stands, as fractions of the scene (the guest's feet). The couch fills first.
    private static let spots: [CGPoint] = [
        CGPoint(x: 0.37, y: 0.84), CGPoint(x: 0.50, y: 0.84), CGPoint(x: 0.63, y: 0.84),
        CGPoint(x: 0.12, y: 0.95), CGPoint(x: 0.88, y: 0.95),
        CGPoint(x: 0.22, y: 0.68), CGPoint(x: 0.80, y: 0.68),
        CGPoint(x: 0.30, y: 0.99), CGPoint(x: 0.70, y: 0.99),
        CGPoint(x: 0.50, y: 1.00)
    ]

    private static let aspect: CGFloat = 780.0 / 520.0

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack(alignment: .topLeading) {
                Image("basement")
                    .resizable()
                    .frame(width: size.width, height: size.height)

                window(size)

                // The room darkens through the night; lamp, TV and string lights keep glowing.
                Color(red: 0.03, green: 0.03, blue: 0.12)
                    .opacity(0.55 * night)
                    .blendMode(.multiply)
                glow(at: CGPoint(x: 0.09, y: 0.40), radius: 0.20, color: Color(red: 1, green: 0.85, blue: 0.5), size: size)
                glow(at: CGPoint(x: 0.50, y: 0.43), radius: 0.17, color: Color(red: 0.5, green: 0.72, blue: 1), size: size)

                ForEach(Array(seats.prefix(Self.spots.count).enumerated()), id: \.element.id) { index, guest in
                    let spot = Self.spots[index]
                    let avatarWidth = size.width * 0.105
                    guestView(guest, width: avatarWidth)
                        .position(x: spot.x * size.width, y: spot.y * size.height - avatarWidth * 0.75)
                }

                if showClock {
                    Text(clock)
                        .font(.system(size: max(12, size.width * 0.035), weight: .black, design: .monospaced))
                        .foregroundStyle(Color(red: 1, green: 0.35, blue: 0.3))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 6))
                        .padding(8)
                }
            }
            .animation(.easeInOut(duration: 1.5), value: night)
        }
        .aspectRatio(Self.aspect, contentMode: .fit)
    }

    /// "8:00 PM" at the start of the night, close to 6 AM by the end.
    private var clock: String {
        let minutes = 20 * 60 + Int(night * 9.7 * 60)
        let hour24 = (minutes / 60) % 24
        let hour = hour24 % 12 == 0 ? 12 : hour24 % 12
        let suffix = hour24 < 12 ? "AM" : "PM"
        return String(format: "%d:%02d %@", hour, minutes % 60, suffix)
    }

    private func window(_ size: CGSize) -> some View {
        // The window well in the art, in 780x520 scene units.
        let frame = CGRect(x: 546, y: 46, width: 108, height: 46)
        let scale = size.width / 780
        let dusk = Color(red: 0.95, green: 0.55, blue: 0.35)
        let midnight = Color(red: 0.04, green: 0.06, blue: 0.18)
        let dawn = Color(red: 0.55, green: 0.65, blue: 0.95)
        let sky: Color = night < 0.85 ? blend(dusk, midnight, min(1, night / 0.5)) : blend(midnight, dawn, (night - 0.85) / 0.15)
        return ZStack {
            sky
            if night > 0.35 && night < 0.9 {
                Circle().fill(Color(red: 1, green: 0.97, blue: 0.85)).frame(width: 9 * scale).offset(x: 30 * scale, y: -8 * scale)
                ForEach(0..<5, id: \.self) { star in
                    Circle().fill(.white.opacity(0.8)).frame(width: 2 * scale)
                        .offset(x: CGFloat([-40, -22, -5, 12, 44][star]) * scale, y: CGFloat([-10, 4, -14, 8, 2][star]) * scale)
                }
            }
        }
        .frame(width: frame.width * scale, height: frame.height * scale)
        .offset(x: frame.minX * scale, y: frame.minY * scale)
        .opacity(0.85)
    }

    private func blend(_ a: Color, _ b: Color, _ t: Double) -> Color {
        let t = max(0, min(1, t))
        let ua = UIColor(a), ub = UIColor(b)
        var (r1, g1, b1, a1) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        var (r2, g2, b2, a2) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        ua.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        ub.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return Color(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t)
    }

    private func glow(at point: CGPoint, radius: CGFloat, color: Color, size: CGSize) -> some View {
        RadialGradient(colors: [color.opacity(0.35 * night), .clear], center: .center, startRadius: 0, endRadius: radius * size.width)
            .frame(width: radius * size.width * 2, height: radius * size.width * 2)
            .position(x: point.x * size.width, y: point.y * size.height)
            .blendMode(.screen)
            .allowsHitTesting(false)
    }

    private func guestView(_ guest: Guest, width: CGFloat) -> some View {
        VStack(spacing: 1) {
            if let badge = guest.badge {
                Text(badge)
                    .font(.system(size: max(8, width * 0.2), weight: .heavy))
                    .padding(.horizontal, 4)
                    .background(Theme.accent, in: Capsule())
                    .foregroundStyle(.white)
            }
            Avatar(index: guest.avatar, size: width, dimmed: guest.dimmed)
                .shadow(color: guest.highlighted ? Theme.accent : .clear, radius: 6)
            if let name = guest.name {
                Text(name)
                    .font(.system(size: max(8, width * 0.2), weight: .bold))
                    .lineLimit(1)
                    .padding(.horizontal, 3)
                    .background(.black.opacity(0.55), in: Capsule())
                    .foregroundStyle(.white)
            }
        }
        .frame(width: width * 1.6)
    }
}
