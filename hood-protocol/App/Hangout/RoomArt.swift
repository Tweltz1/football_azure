import SwiftUI

/// The bright cartoon basement, in the Hood League art style: flat colors and thick ink outlines.
/// Everything is drawn in the 1000 x 640 room space.
enum RoomArt {
    private static let ink = CartoonPerson.ink
    static let wallBottom: CGFloat = 430

    // MARK: Back of the room

    static func drawBack(_ ctx: GraphicsContext, night: Double, time t: Double, gamers: Int = 0) {
        let dark = night < 0.85 ? min(1, night / 0.4) : max(0, 1 - (night - 0.85) / 0.15)

        // Wood-paneled wall
        ctx.fill(Path(CGRect(x: 0, y: 0, width: 1000, height: wallBottom)), with: .color(Color(hex: 0xE2BD8F)))
        for x in stride(from: 40.0, to: 1000, by: 80) {
            var line = Path()
            line.move(to: CGPoint(x: x, y: 0)); line.addLine(to: CGPoint(x: x, y: wallBottom))
            ctx.stroke(line, with: .color(Color(hex: 0xCDA676)), lineWidth: 4)
        }
        // Purple LED strip, Hood League colors
        ctx.fill(Path(CGRect(x: 0, y: 8, width: 1000, height: 26)), with: .color(Theme.accent.opacity(0.25)))
        ctx.fill(Path(CGRect(x: 0, y: 14, width: 1000, height: 10)), with: .color(Theme.accent))

        window(ctx, night: night, dark: dark, time: t)
        stringLights(ctx, time: t)
        clock(ctx, night: night)
        poster(ctx)
        door(ctx)

        // Baseboard and floor
        outlined(ctx, Path(CGRect(x: -10, y: wallBottom - 12, width: 1020, height: 14)), Color(hex: 0xA77B52))
        ctx.fill(Path(CGRect(x: 0, y: wallBottom, width: 1000, height: 220)), with: .color(Color(hex: 0xB9BFCB)))
        outlined(ctx, Path(ellipseIn: CGRect(x: 230, y: 505, width: 560, height: 130)), Color(hex: 0xA996FF))
        ctx.fill(Path(ellipseIn: CGRect(x: 300, y: 530, width: 420, height: 80)), with: .color(Color(hex: 0xB9A9FF)))

        tv(ctx, time: t, players: gamers)
        couch(ctx)

        // A touch of evening blue that never makes the room dark
        ctx.fill(Path(CGRect(origin: .zero, size: HangoutModel.size)), with: .color(Color(hex: 0x1A1440).opacity(0.1 * dark)))
    }

    private static func window(_ ctx: GraphicsContext, night: Double, dark: Double, time t: Double) {
        let frame = CGRect(x: 380, y: 66, width: 330, height: 210)
        var inside = ctx
        inside.clip(to: Path(roundedRect: frame, cornerRadius: 8))

        // Sky
        let top: Color, bottom: Color
        if night < 0.12 {
            top = Color(hex: 0x5A7BD8); bottom = Color(hex: 0xFFB070)
        } else if night < 0.85 {
            top = Color(hex: 0x1A1440); bottom = Color(hex: 0x4A3AA0)
        } else {
            top = Color(hex: 0x7FB6FF); bottom = Color(hex: 0xFFD6A0)
        }
        inside.fill(Path(frame), with: .linearGradient(Gradient(colors: [top, bottom]),
                                                         startPoint: CGPoint(x: 0, y: frame.minY), endPoint: CGPoint(x: 0, y: frame.maxY)))
        // Stars
        if dark > 0.3 {
            for (i, (x, y)) in [(410.0, 90.0), (470, 120), (520, 84), (600, 110), (660, 92), (690, 140), (440, 150), (560, 140)].enumerated() {
                let twinkle = 0.5 + 0.5 * sin(t * 2 + Double(i))
                inside.fill(Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(.white.opacity(dark * twinkle)))
            }
        }
        // Sun going down, the moon crossing, the sun coming up
        let disc: (CGPoint, Color)
        if night < 0.12 {
            let k = night / 0.12
            disc = (CGPoint(x: 640, y: 150 + 70 * k), Color(hex: 0xFFC94A))
        } else if night < 0.85 {
            let k = (night - 0.12) / 0.73
            disc = (CGPoint(x: 420 + 250 * k, y: 140 - 50 * sin(.pi * k)), Color(hex: 0xFFF1C2))
        } else {
            let k = (night - 0.85) / 0.15
            disc = (CGPoint(x: 430, y: 230 - 90 * k), Color(hex: 0xFFD25A))
        }
        inside.fill(Path(ellipseIn: CGRect(x: disc.0.x - 40, y: disc.0.y - 40, width: 80, height: 80)), with: .color(disc.1.opacity(0.3)))
        outlined(inside, Path(ellipseIn: CGRect(x: disc.0.x - 26, y: disc.0.y - 26, width: 52, height: 52)), disc.1, width: 4)

        // Backyard: hills, trees, fence, grass
        let leafy = Color(hex: 0x47B35A), leafyDark = Color(hex: 0x2E8A45)
        var hills = Path()
        hills.move(to: CGPoint(x: 370, y: 230))
        hills.addQuadCurve(to: CGPoint(x: 560, y: 215), control: CGPoint(x: 460, y: 180))
        hills.addQuadCurve(to: CGPoint(x: 720, y: 220), control: CGPoint(x: 650, y: 185))
        hills.addLine(to: CGPoint(x: 720, y: 290)); hills.addLine(to: CGPoint(x: 370, y: 290)); hills.closeSubpath()
        outlined(inside, hills, Color(hex: 0x6CC46A), width: 4)
        for (x, size) in [(425.0, 1.0), (520, 0.8), (615, 1.15), (685, 0.85)] {
            let base = CGPoint(x: x, y: 262)
            outlined(inside, Path(roundedRect: CGRect(x: base.x - 6 * size, y: base.y - 40 * size, width: 12 * size, height: 42 * size), cornerRadius: 3),
                     Color(hex: 0x8A5A3C), width: 3)
            let sway = 2 * sin(t * 1.3 + x)
            for (dx, dy, r) in [(-16.0, -48.0, 22.0), (16, -50, 22), (0, -68, 26)] {
                outlined(inside, Path(ellipseIn: CGRect(x: base.x + (dx + sway) * size - r * size, y: base.y + dy * size - r * size,
                                                        width: 2 * r * size, height: 2 * r * size)), dy < -60 ? leafy : leafyDark, width: 3)
            }
        }
        for x in stride(from: 384.0, to: 710, by: 22) {
            outlined(inside, Path(roundedRect: CGRect(x: x, y: 240, width: 14, height: 40), cornerRadius: 3), Color(hex: 0xF4F1EA), width: 2.5)
        }
        outlined(inside, Path(CGRect(x: 376, y: 252, width: 340, height: 8)), Color(hex: 0xF4F1EA), width: 2.5)
        inside.fill(Path(CGRect(x: 370, y: 268, width: 350, height: 20)), with: .color(Color(hex: 0x5DBB5E)))
        // Night shade over the yard so it still reads as a yard
        inside.fill(Path(frame), with: .color(Color(hex: 0x0E1240).opacity(0.5 * dark)))

        // Frame and panes
        ctx.stroke(Path(roundedRect: frame, cornerRadius: 8), with: .color(Color(hex: 0xF4F1EA)), lineWidth: 14)
        ctx.stroke(Path(roundedRect: frame.insetBy(dx: -8, dy: -8), cornerRadius: 12), with: .color(ink), lineWidth: 4)
        var panes = Path()
        panes.move(to: CGPoint(x: frame.midX, y: frame.minY)); panes.addLine(to: CGPoint(x: frame.midX, y: frame.maxY))
        panes.move(to: CGPoint(x: frame.minX, y: frame.midY)); panes.addLine(to: CGPoint(x: frame.maxX, y: frame.midY))
        ctx.stroke(panes, with: .color(Color(hex: 0xF4F1EA)), lineWidth: 9)
        outlined(ctx, Path(roundedRect: CGRect(x: frame.minX - 20, y: frame.maxY + 6, width: frame.width + 40, height: 14), cornerRadius: 5),
                 Color(hex: 0xF4F1EA), width: 4)
    }

    private static func stringLights(_ ctx: GraphicsContext, time t: Double) {
        var wire = Path()
        wire.move(to: CGPoint(x: 0, y: 44))
        wire.addQuadCurve(to: CGPoint(x: 500, y: 52), control: CGPoint(x: 250, y: 84))
        wire.addQuadCurve(to: CGPoint(x: 1000, y: 44), control: CGPoint(x: 750, y: 84))
        ctx.stroke(wire, with: .color(ink), lineWidth: 3)
        let colors: [UInt32] = [0xFF6B6B, 0xF5B84A, 0x3DDC97, 0x2F80ED, 0xFF8BD0]
        for i in 0..<20 {
            let x = 25.0 + Double(i) * 50
            let half = x < 500 ? x / 500 : (x - 500) / 500
            let y = 50 + 20 * sin(.pi * half)
            let color = Color(hex: colors[i % colors.count])
            let glow = 0.65 + 0.35 * sin(t * 2 + Double(i) * 0.9)
            ctx.fill(Path(ellipseIn: CGRect(x: x - 14, y: y - 8, width: 28, height: 28)), with: .color(color.opacity(0.3 * glow)))
            outlined(ctx, Path(ellipseIn: CGRect(x: x - 7, y: y - 2, width: 14, height: 18)), color.opacity(0.6 + 0.4 * glow), width: 3)
        }
    }

    private static func clock(_ ctx: GraphicsContext, night: Double) {
        let center = CGPoint(x: 830, y: 150)
        outlined(ctx, Path(ellipseIn: CGRect(x: center.x - 50, y: center.y - 50, width: 100, height: 100)), .white, width: 6)
        for tick in 0..<12 {
            let a = Double(tick) / 12 * 2 * .pi
            var mark = Path()
            mark.move(to: CGPoint(x: center.x + 38 * sin(a), y: center.y - 38 * cos(a)))
            mark.addLine(to: CGPoint(x: center.x + 44 * sin(a), y: center.y - 44 * cos(a)))
            ctx.stroke(mark, with: .color(ink), lineWidth: tick % 3 == 0 ? 4 : 2)
        }
        let minutes = 20 * 60 + night * 9.7 * 60
        let hourAngle = (minutes / 60).truncatingRemainder(dividingBy: 12) / 12 * 2 * .pi
        let minuteAngle = minutes.truncatingRemainder(dividingBy: 60) / 60 * 2 * .pi
        for (angle, length, width) in [(hourAngle, 22.0, 6.0), (minuteAngle, 34.0, 4.0)] {
            var hand = Path()
            hand.move(to: center)
            hand.addLine(to: CGPoint(x: center.x + length * sin(angle), y: center.y - length * cos(angle)))
            ctx.stroke(hand, with: .color(ink), style: StrokeStyle(lineWidth: width, lineCap: .round))
        }
        ctx.fill(Path(ellipseIn: CGRect(x: center.x - 5, y: center.y - 5, width: 10, height: 10)), with: .color(Theme.accent))
    }

    private static func poster(_ ctx: GraphicsContext) {
        let rect = CGRect(x: 735, y: 240, width: 70, height: 96)
        outlined(ctx, Path(rect), Theme.accent, width: 4)
        outlined(ctx, Path(ellipseIn: CGRect(x: rect.midX - 20, y: rect.minY + 16, width: 40, height: 40)), Color(hex: 0xF5B84A), width: 3)
        ctx.draw(Text("HOOD").font(.system(size: 14, weight: .black)).foregroundColor(.white), at: CGPoint(x: rect.midX, y: rect.maxY - 20))
    }

    private static func door(_ ctx: GraphicsContext) {
        let rect = CGRect(x: 880, y: 230, width: 100, height: wallBottom - 230)
        outlined(ctx, Path(roundedRect: rect, cornerRadius: 6), Color(hex: 0xB07A4C))
        outlined(ctx, Path(roundedRect: rect.insetBy(dx: 16, dy: 18), cornerRadius: 4), Color(hex: 0xC48A58), width: 3)
        outlined(ctx, Path(ellipseIn: CGRect(x: rect.maxX - 26, y: rect.midY, width: 12, height: 12)), Color(hex: 0xF5C542), width: 3)
    }

    private static func tv(_ ctx: GraphicsContext, time t: Double, players: Int) {
        // Stand and console
        outlined(ctx, Path(roundedRect: CGRect(x: 40, y: 360, width: 260, height: 90), cornerRadius: 8), Color(hex: 0x3A3A44))
        outlined(ctx, Path(roundedRect: CGRect(x: 70, y: 384, width: 70, height: 20), cornerRadius: 5), Color(hex: 0xF2F2F2), width: 3)
        ctx.fill(Path(ellipseIn: CGRect(x: 126, y: 390, width: 7, height: 7)), with: .color(Color(hex: 0x3DDC97)))
        // Big TV
        let screen = CGRect(x: 34, y: 178, width: 282, height: 168)
        outlined(ctx, Path(roundedRect: screen.insetBy(dx: -9, dy: -9), cornerRadius: 10), Color(hex: 0x15151A))
        outlined(ctx, Path(CGRect(x: 165, y: 346, width: 20, height: 16)), Color(hex: 0x15151A), width: 3)
        var game = ctx
        game.clip(to: Path(screen))
        splitScreen(game, in: screen, players: players, time: t)
        // Screen glow onto the wall
        ctx.fill(Path(ellipseIn: screen.insetBy(dx: -50, dy: -40)), with: .color(Color(hex: 0x6FD3FF).opacity(0.08 + 0.04 * sin(t * 7))))
    }

    /// Split screen like a couch shooter: one view, two stacked, or four quarters for 3 or 4 players.
    private static func splitScreen(_ ctx: GraphicsContext, in r: CGRect, players: Int, time t: Double) {
        let views: [CGRect]
        switch players {
        case ...1: views = [r]
        case 2: views = [CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height / 2),
                         CGRect(x: r.minX, y: r.midY, width: r.width, height: r.height / 2)]
        default:
            let w = r.width / 2, h = r.height / 2
            views = [CGRect(x: r.minX, y: r.minY, width: w, height: h), CGRect(x: r.midX, y: r.minY, width: w, height: h),
                     CGRect(x: r.minX, y: r.midY, width: w, height: h), CGRect(x: r.midX, y: r.midY, width: w, height: h)]
        }
        let armor: [UInt32] = [0x4E7A3A, 0x2F80ED, 0xE0302E, 0xF5B84A]
        for (i, view) in views.enumerated() {
            var pane = ctx
            pane.clip(to: Path(view))
            if players >= 1 && i >= max(players, 1) {
                // Empty quarter waiting for a 4th player
                pane.fill(Path(view), with: .color(Color(hex: 0x0B0E14)))
                pane.draw(Text("PRESS START").font(.system(size: 11, weight: .black, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4 + 0.4 * sin(t * 4))), at: CGPoint(x: view.midX, y: view.midY))
            } else {
                shooterView(pane, in: view, time: t + Double(i) * 7.3, seed: Double(i), armor: Color(hex: armor[i % armor.count]),
                            compact: views.count > 1)
            }
        }
        if views.count > 1 {
            var lines = Path()
            if views.count == 2 {
                lines.move(to: CGPoint(x: r.minX, y: r.midY)); lines.addLine(to: CGPoint(x: r.maxX, y: r.midY))
            } else {
                lines.move(to: CGPoint(x: r.minX, y: r.midY)); lines.addLine(to: CGPoint(x: r.maxX, y: r.midY))
                lines.move(to: CGPoint(x: r.midX, y: r.minY)); lines.addLine(to: CGPoint(x: r.midX, y: r.maxY))
            }
            ctx.stroke(lines, with: .color(.black), lineWidth: 3)
        }
    }

    /// One player's view in a made-up sci-fi shooter: a ring world arching over the sky,
    /// alien towers, armored soldiers with gold visors, a rifle with an ammo counter, a shield bar
    /// and a motion tracker.
    private static func shooterView(_ ctx: GraphicsContext, in r: CGRect, time t: Double, seed: Double, armor: Color, compact: Bool) {
        let w = r.width, h = r.height
        let u = min(w / 282, h / 168) // 1 at full screen
        let sway = CGFloat(sin(t * 0.6 + seed)) * w * 0.06
        let bob = CGFloat(sin(t * 3.1)) * h * 0.01
        // Sky and the ring
        ctx.fill(Path(r), with: .linearGradient(Gradient(colors: [Color(hex: 0x3D78B8), Color(hex: 0xA9DCEB)]),
                                                startPoint: CGPoint(x: 0, y: r.minY), endPoint: CGPoint(x: 0, y: r.maxY)))
        var ring = Path()
        ring.addArc(center: CGPoint(x: r.midX + sway * 0.3 + w * 0.15, y: r.maxY + h * 0.5), radius: w * 0.85,
                    startAngle: .degrees(205), endAngle: .degrees(300), clockwise: false)
        ctx.stroke(ring, with: .color(Color(hex: 0xDCE6EE).opacity(0.9)), lineWidth: max(2, 8 * u))
        ctx.stroke(ring, with: .color(Color(hex: 0x6E8AA8).opacity(0.8)), lineWidth: max(1, 2.5 * u))
        // Far cliffs and a slanted alien tower
        var cliffs = Path()
        cliffs.move(to: CGPoint(x: r.minX - 20, y: r.minY + h * 0.62))
        for k in 0...6 {
            let x = r.minX - 20 + CGFloat(k) * (w + 40) / 6 + sway * 0.5
            cliffs.addLine(to: CGPoint(x: x, y: r.minY + h * (k % 2 == 0 ? 0.5 : 0.58)))
        }
        cliffs.addLine(to: CGPoint(x: r.maxX + 20, y: r.maxY)); cliffs.addLine(to: CGPoint(x: r.minX - 20, y: r.maxY)); cliffs.closeSubpath()
        ctx.fill(cliffs, with: .color(Color(hex: 0x6B8F9C)))
        let towerX = r.minX + w * 0.68 + sway * 0.6
        var tower = Path()
        tower.move(to: CGPoint(x: towerX - w * 0.05, y: r.minY + h * 0.6))
        tower.addLine(to: CGPoint(x: towerX - w * 0.015, y: r.minY + h * 0.2))
        tower.addLine(to: CGPoint(x: towerX + w * 0.02, y: r.minY + h * 0.24))
        tower.addLine(to: CGPoint(x: towerX + w * 0.05, y: r.minY + h * 0.6))
        tower.closeSubpath()
        ctx.fill(tower, with: .color(Color(hex: 0x8E95A6)))
        ctx.fill(Path(CGRect(x: towerX - w * 0.012, y: r.minY + h * 0.3, width: w * 0.024, height: h * 0.04)),
                 with: .color(Color(hex: 0x7FF3FF).opacity(0.6 + 0.4 * sin(t * 3))))
        // Grassy ground and a rock
        var ground = Path()
        ground.move(to: CGPoint(x: r.minX, y: r.minY + h * 0.66 + bob))
        ground.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + h * 0.64 + bob), control: CGPoint(x: r.midX + sway, y: r.minY + h * 0.58))
        ground.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); ground.addLine(to: CGPoint(x: r.minX, y: r.maxY)); ground.closeSubpath()
        ctx.fill(ground, with: .color(Color(hex: 0x5E9A4A)))
        ctx.fill(Path(ellipseIn: CGRect(x: r.minX + w * 0.12 + sway, y: r.minY + h * 0.66, width: w * 0.16, height: h * 0.1)),
                 with: .color(Color(hex: 0x7C7F86)))
        // Two enemy soldiers strafing
        let hit = (t.truncatingRemainder(dividingBy: 6)) > 4.6
        for i in 0..<2 {
            let phase = t * 0.9 + Double(i) * 2.4 + seed
            let x = r.minX + w * (0.35 + 0.28 * Double(i)) + CGFloat(sin(phase)) * w * 0.1 + sway
            let y = r.minY + h * (0.66 - 0.05 * Double(i)) + bob
            let s = h * (i == 0 ? 0.2 : 0.15)
            let enemy = i == 0 ? Color(hex: 0xC0392B) : Color(hex: 0x8E44AD)
            if i == 0 && hit {
                // Shields popping
                ctx.stroke(Path(ellipseIn: CGRect(x: x - s * 0.45, y: y - s * 1.05, width: s * 0.9, height: s * 1.1)),
                           with: .color(Color(hex: 0xFFE98A).opacity(0.9)), lineWidth: max(1, 1.5 * u))
            }
            ctx.fill(Path(roundedRect: CGRect(x: x - s * 0.18, y: y - s * 0.62, width: s * 0.36, height: s * 0.5), cornerRadius: s * 0.08), with: .color(enemy))
            ctx.fill(Path(roundedRect: CGRect(x: x - s * 0.14, y: y - s * 0.16, width: s * 0.11, height: s * 0.18), cornerRadius: 1), with: .color(enemy.opacity(0.8)))
            ctx.fill(Path(roundedRect: CGRect(x: x + s * 0.03, y: y - s * 0.16, width: s * 0.11, height: s * 0.18), cornerRadius: 1), with: .color(enemy.opacity(0.8)))
            ctx.fill(Path(ellipseIn: CGRect(x: x - s * 0.15, y: y - s * 0.92, width: s * 0.3, height: s * 0.32)), with: .color(enemy))
            ctx.fill(Path(roundedRect: CGRect(x: x - s * 0.1, y: y - s * 0.83, width: s * 0.2, height: s * 0.1), cornerRadius: s * 0.04),
                     with: .color(Color(hex: 0xF2B632)))
            // Their plasma shots
            if (phase * 2).truncatingRemainder(dividingBy: 3) < 0.25 {
                ctx.fill(Path(ellipseIn: CGRect(x: x - s * 0.06 + s * 0.4, y: y - s * 0.5, width: s * 0.12, height: s * 0.12)),
                         with: .color(Color(hex: 0x6CFFB0)))
            }
        }
        // Rifle with the ammo counter, kicking back when it fires
        let firing = t.truncatingRemainder(dividingBy: 0.5) < 0.12
        let kick: CGFloat = firing ? 3 * u : 0
        let gx = r.maxX - w * 0.3, gy = r.maxY - h * 0.26 + kick + bob
        var gun = Path()
        gun.move(to: CGPoint(x: gx, y: gy))
        gun.addLine(to: CGPoint(x: gx + w * 0.2, y: gy + h * 0.04))
        gun.addLine(to: CGPoint(x: r.maxX + 4, y: gy + h * 0.12))
        gun.addLine(to: CGPoint(x: r.maxX + 4, y: r.maxY + 4))
        gun.addLine(to: CGPoint(x: gx + w * 0.04, y: r.maxY + 4))
        gun.addLine(to: CGPoint(x: gx - w * 0.03, y: gy + h * 0.08))
        gun.closeSubpath()
        ctx.fill(gun, with: .color(Color(hex: 0x3F4A3C)))
        ctx.stroke(gun, with: .color(Color(hex: 0x1A2018)), lineWidth: max(1, 1.5 * u))
        let counter = CGRect(x: gx + w * 0.07, y: gy + h * 0.035, width: w * 0.07, height: h * 0.06)
        ctx.fill(Path(roundedRect: counter, cornerRadius: 1), with: .color(Color(hex: 0x101410)))
        let ammo = 32 - Int((t / 0.5).truncatingRemainder(dividingBy: 32))
        ctx.draw(Text(String(format: "%02d", ammo)).font(.system(size: max(5, 9 * u), weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: 0x8FE3FF)), at: CGPoint(x: counter.midX, y: counter.midY))
        if firing {
            let tip = CGPoint(x: gx - w * 0.02, y: gy + h * 0.02)
            ctx.fill(Path(ellipseIn: CGRect(x: tip.x - 7 * u, y: tip.y - 7 * u, width: 14 * u, height: 14 * u)), with: .color(Color(hex: 0xFFE38A)))
            var tracer = Path()
            tracer.move(to: tip)
            tracer.addLine(to: CGPoint(x: r.midX + w * 0.02, y: r.midY + h * 0.04))
            ctx.stroke(tracer, with: .color(Color(hex: 0xFFE38A).opacity(0.8)), style: StrokeStyle(lineWidth: max(1, 1.6 * u), lineCap: .round))
        }
        // Arm in the player's armor color
        ctx.fill(Path(roundedRect: CGRect(x: gx + w * 0.1, y: gy + h * 0.1, width: w * 0.12, height: h * 0.2), cornerRadius: 4 * u), with: .color(armor))
        // HUD: crosshair, shield bar, grenades, motion tracker
        let hud = Color(hex: 0x8FE3FF)
        let c = CGPoint(x: r.midX, y: r.midY + h * 0.04)
        ctx.stroke(Path(ellipseIn: CGRect(x: c.x - 7 * u, y: c.y - 7 * u, width: 14 * u, height: 14 * u)), with: .color(hud), lineWidth: max(1, 1.4 * u))
        ctx.fill(Path(ellipseIn: CGRect(x: c.x - 1.2 * u, y: c.y - 1.2 * u, width: 2.4 * u, height: 2.4 * u)), with: .color(hud))
        let bar = CGRect(x: r.midX - w * 0.2, y: r.minY + h * 0.05, width: w * 0.4, height: max(3, h * 0.045))
        ctx.stroke(Path(roundedRect: bar, cornerRadius: 2), with: .color(hud), lineWidth: max(0.8, 1.2 * u))
        let shield = hit ? 0.35 + 0.65 * ((t.truncatingRemainder(dividingBy: 6)) - 4.6) / 1.4 : 1
        ctx.fill(Path(roundedRect: CGRect(x: bar.minX + 1.5, y: bar.minY + 1.5, width: (bar.width - 3) * shield, height: bar.height - 3), cornerRadius: 1),
                 with: .color(shield < 0.5 ? Color(hex: 0xFF5A5A) : Color(hex: 0x4AB8FF)))
        for g in 0..<2 {
            ctx.fill(Path(ellipseIn: CGRect(x: r.minX + w * 0.04 + CGFloat(g) * w * 0.035, y: r.minY + h * 0.05, width: w * 0.025, height: w * 0.025)),
                     with: .color(Color(hex: 0x6E8B3D)))
        }
        let radar = CGRect(x: r.minX + w * 0.03, y: r.maxY - h * 0.3, width: h * 0.26, height: h * 0.26)
        ctx.fill(Path(ellipseIn: radar), with: .color(Color.black.opacity(0.3)))
        ctx.stroke(Path(ellipseIn: radar), with: .color(hud.opacity(0.8)), lineWidth: max(0.8, 1.2 * u))
        for i in 0..<2 {
            let a = t * 0.8 + Double(i) * 2 + seed
            ctx.fill(Path(ellipseIn: CGRect(x: radar.midX + CGFloat(cos(a)) * radar.width * 0.28 - 2 * u,
                                            y: radar.minY + radar.height * 0.3 + CGFloat(sin(a)) * radar.height * 0.12 - 2 * u,
                                            width: 4 * u, height: 4 * u)), with: .color(Color(hex: 0xFF4A4A)))
        }
        if !compact || w > 130 {
            if (t.truncatingRemainder(dividingBy: 9)) < 1.2 {
                ctx.draw(Text("DOUBLE KILL").font(.system(size: 12 * u, weight: .black)).foregroundColor(Color(hex: 0xFFD25A)),
                         at: CGPoint(x: r.midX, y: r.minY + h * 0.25))
            }
        }
    }

    private static func couch(_ ctx: GraphicsContext) {
        let purple = Color(hex: 0x7B5CC8)
        outlined(ctx, Path(roundedRect: CGRect(x: 380, y: 330, width: 300, height: 110), cornerRadius: 36), purple)
        outlined(ctx, Path(roundedRect: CGRect(x: 390, y: 410, width: 280, height: 68), cornerRadius: 20), Color(hex: 0x8D70D8))
        for x in [400.0, 490, 580] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 400, width: 86, height: 30), cornerRadius: 12), Color(hex: 0x9A80E0), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 356, y: 380, width: 54, height: 100), cornerRadius: 22), Color(hex: 0x6A4CB8))
        outlined(ctx, Path(roundedRect: CGRect(x: 650, y: 380, width: 54, height: 100), cornerRadius: 22), Color(hex: 0x6A4CB8))
    }

    // MARK: Furniture people can walk in front of or behind

    /// Each piece with the floor line people are sorted against.
    static func furniture(_ model: HangoutModel, time t: Double) -> [(CGFloat, (GraphicsContext) -> Void)] {
        [
            (478, { keg($0) }),
            (555, { beanbag($0, center: CGPoint(x: 150, y: 562), color: Color(hex: 0xFF6B6B)) }),
            (585, { beanbag($0, center: CGPoint(x: 262, y: 592), color: Color(hex: 0x2F80ED)) }),
            (605, { beanbag($0, center: CGPoint(x: 78, y: 612), color: Color(hex: 0x3DDC97)) }),
            (623, { beanbag($0, center: CGPoint(x: 190, y: 632), color: Color(hex: 0xF5B84A)) }),
            (540, { coffeeTable($0, bong: model.bongOnTable(at: t), time: t) }),
            (545, { pongTable($0, cups: model.pongCups) }),
            (626, { flipTable($0, model: model, time: t) }),
        ]
    }

    private static func beanbag(_ ctx: GraphicsContext, center: CGPoint, color: Color) {
        outlined(ctx, Path(ellipseIn: CGRect(x: center.x - 58, y: center.y - 44, width: 116, height: 60)), color)
        ctx.fill(Path(ellipseIn: CGRect(x: center.x - 30, y: center.y - 36, width: 40, height: 14)), with: .color(.white.opacity(0.25)))
    }

    /// A keg on ice in a blue tub, with the tap and hose on top.
    private static func keg(_ ctx: GraphicsContext) {
        let top = HangoutModel.kegTop
        let steel = Color(hex: 0xC9CED6)
        outlined(ctx, Path(roundedRect: CGRect(x: top.x - 26, y: top.y, width: 52, height: 46), cornerRadius: 6), steel, width: 4)
        for y in [top.y + 12, top.y + 30] {
            outlined(ctx, Path(roundedRect: CGRect(x: top.x - 28, y: y, width: 56, height: 6), cornerRadius: 3), Color(hex: 0xA8AEB8), width: 2.5)
        }
        // Handles cut into the top rim
        outlined(ctx, Path(roundedRect: CGRect(x: top.x - 26, y: top.y - 6, width: 52, height: 10), cornerRadius: 4), steel, width: 3)
        ctx.fill(Path(roundedRect: CGRect(x: top.x - 18, y: top.y - 3, width: 10, height: 4), cornerRadius: 2), with: .color(ink))
        ctx.fill(Path(roundedRect: CGRect(x: top.x + 8, y: top.y - 3, width: 10, height: 4), cornerRadius: 2), with: .color(ink))
        // Tap and coiled hose
        outlined(ctx, Path(roundedRect: CGRect(x: top.x - 6, y: top.y - 14, width: 12, height: 10), cornerRadius: 2), Color(hex: 0x2A2A33), width: 2.5)
        var hose = Path()
        hose.move(to: CGPoint(x: top.x + 6, y: top.y - 9))
        hose.addQuadCurve(to: CGPoint(x: top.x + 30, y: top.y + 14), control: CGPoint(x: top.x + 34, y: top.y - 12))
        ctx.stroke(hose, with: .color(ink), style: StrokeStyle(lineWidth: 6, lineCap: .round))
        ctx.stroke(hose, with: .color(Color(hex: 0xE8E2D2)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        // Tub of ice around the bottom
        outlined(ctx, Path(roundedRect: CGRect(x: top.x - 34, y: top.y + 24, width: 68, height: 24), cornerRadius: 6), Color(hex: 0x2F80ED), width: 4)
        for x in [-24.0, -10, 6, 20] {
            outlined(ctx, Path(roundedRect: CGRect(x: top.x + x, y: top.y + 18, width: 10, height: 9), cornerRadius: 2), Color(hex: 0xE6F6FF), width: 2)
        }
    }

    private static func coffeeTable(_ ctx: GraphicsContext, bong: Bool, time t: Double) {
        for x in [480.0, 584] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 524, width: 10, height: 18), cornerRadius: 3), Color(hex: 0x6B4A30), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 468, y: 512, width: 138, height: 16), cornerRadius: 6), Color(hex: 0x9A6B44))
        // Lighter and a pizza box
        outlined(ctx, Path(roundedRect: CGRect(x: 476, y: 504, width: 7, height: 10), cornerRadius: 2), Color(hex: 0xE0302E), width: 2)
        outlined(ctx, Path(roundedRect: CGRect(x: 552, y: 502, width: 46, height: 11), cornerRadius: 3), Color(hex: 0xE2C08E), width: 3)
        if bong {
            RoomArt.bong(ctx, base: CGPoint(x: 522, y: 513), scale: 0.56, smoke: (0, 0), bubbling: false, ember: false, time: t)
        }
    }

    /// A glass bong: water in the base, a tube that fills with smoke, a bowl on a downstem.
    /// `smoke` is the part of the tube that's full, as (bottom, top) fractions.
    static func bong(_ ctx: GraphicsContext, base: CGPoint, scale: CGFloat, smoke: (Double, Double),
                     bubbling: Bool, ember: Bool, time t: Double) {
        var g = ctx
        g.translateBy(x: base.x, y: base.y)
        g.scaleBy(x: scale, y: scale)
        let glass = Color(hex: 0xBFEFFF).opacity(0.55)
        let tube = CGRect(x: -11, y: -108, width: 22, height: 70)
        // Downstem and bowl, behind the glass
        var stem = Path()
        stem.move(to: CGPoint(x: -8, y: -26)); stem.addLine(to: CGPoint(x: -30, y: -50))
        g.stroke(stem, with: .color(ink), style: StrokeStyle(lineWidth: 9, lineCap: .round))
        g.stroke(stem, with: .color(Color(hex: 0xBFEFFF)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        outlined(g, Path(roundedRect: CGRect(x: -40, y: -60, width: 20, height: 12), cornerRadius: 4), Color(hex: 0x3DDC97), width: 3)
        g.fill(Path(ellipseIn: CGRect(x: -37, y: -62, width: 14, height: 6)), with: .color(ember ? Color(hex: 0xFF7A2A) : Color(hex: 0x6E8B3D)))
        if ember {
            g.fill(Path(ellipseIn: CGRect(x: -44, y: -70, width: 28, height: 18)), with: .color(Color(hex: 0xFF9A3A).opacity(0.35 + 0.2 * sin(t * 20))))
        }
        // Tube and mouthpiece
        g.fill(Path(roundedRect: tube, cornerRadius: 6), with: .color(glass))
        let (low, high) = smoke
        if high > low {
            let rect = CGRect(x: tube.minX + 2, y: tube.maxY - tube.height * high, width: tube.width - 4, height: tube.height * (high - low))
            g.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(Color(white: 0.93).opacity(0.9)))
        }
        g.stroke(Path(roundedRect: tube, cornerRadius: 6), with: .color(ink), lineWidth: 3)
        outlined(g, Path(roundedRect: CGRect(x: -15, y: -112, width: 30, height: 7), cornerRadius: 3), Color(hex: 0x3DDC97), width: 3)
        // Base with water
        let flask = CGRect(x: -28, y: -46, width: 56, height: 46)
        g.fill(Path(ellipseIn: flask), with: .color(glass))
        var water = g
        water.clip(to: Path(ellipseIn: flask))
        water.fill(Path(CGRect(x: flask.minX, y: flask.midY, width: flask.width, height: flask.height)), with: .color(Color(hex: 0x6FC8FF).opacity(0.7)))
        if high > 0.05 && low == 0 {
            water.fill(Path(CGRect(x: flask.minX, y: flask.minY, width: flask.width, height: flask.height / 2)), with: .color(Color(white: 0.93).opacity(0.6 * high)))
        }
        if bubbling {
            for i in 0..<5 {
                let k = (t * 2.4 + Double(i) * 0.2).truncatingRemainder(dividingBy: 1)
                let x = -10 + Double(i % 3) * 8 + 3 * sin(t * 9 + Double(i))
                let y = flask.maxY - 6 - k * flask.height / 2
                water.stroke(Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(.white), lineWidth: 2)
            }
        }
        g.stroke(Path(ellipseIn: flask), with: .color(ink), lineWidth: 3)
        g.fill(Path(ellipseIn: CGRect(x: -18, y: -40, width: 10, height: 14)), with: .color(.white.opacity(0.5)))
    }

    /// Where a pong cup sits: side 0 is the left end, index 0...5 in a 3-2-1 pyramid.
    static func pongCup(side: Int, index: Int) -> CGPoint {
        let (row, place) = index < 3 ? (0, index) : index < 5 ? (1, index - 3) : (2, 0)
        let start: CGFloat = side == 0 ? 772 : 918
        let step: CGFloat = side == 0 ? 1 : -1
        return CGPoint(x: start + step * (CGFloat(place) * 16 + CGFloat(row) * 8), y: 457 - CGFloat(row) * 6)
    }

    private static func pongTable(_ ctx: GraphicsContext, cups: [[Bool]]) {
        for x in [774.0, 906] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 468, width: 10, height: 76), cornerRadius: 3), Color(hex: 0x44444C), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 758, y: 456, width: 174, height: 16), cornerRadius: 5), Color(hex: 0x2F80ED))
        var line = Path()
        line.move(to: CGPoint(x: 845, y: 458)); line.addLine(to: CGPoint(x: 845, y: 470))
        ctx.stroke(line, with: .color(.white), lineWidth: 3)
        // Back cups first so the front ones overlap them
        for side in 0..<2 {
            for index in [5, 3, 4, 0, 1, 2] where cups[side][index] {
                cup(ctx, at: pongCup(side: side, index: index), size: 0.8)
            }
        }
    }

    /// The flip cup table, a pitcher in the middle and each side's cup at the edge.
    private static func flipTable(_ ctx: GraphicsContext, model: HangoutModel, time t: Double) {
        for x in [444.0, 626] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 590, width: 10, height: 36), cornerRadius: 3), Color(hex: 0x44444C), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 430, y: 578, width: 220, height: 14), cornerRadius: 5), Color(hex: 0xF4F1EA))
        // Pitcher of beer
        outlined(ctx, Path(roundedRect: CGRect(x: 528, y: 540, width: 26, height: 38), cornerRadius: 4), Color(hex: 0xF5B84A).opacity(0.9), width: 3)
        ctx.fill(Path(roundedRect: CGRect(x: 530, y: 542, width: 22, height: 7), cornerRadius: 2), with: .color(.white))
        var handle = Path()
        handle.addArc(center: CGPoint(x: 556, y: 558), radius: 9, startAngle: .degrees(-80), endAngle: .degrees(80), clockwise: false)
        ctx.stroke(handle, with: .color(ink), lineWidth: 4)
        for lane in 0..<2 {
            guard let state = model.flipCup(lane: lane, at: t) else { continue }
            let x: CGFloat = lane == 0 ? 448 : 632
            let dir: Double = lane == 0 ? 1 : -1
            var g = ctx
            // Spins around its middle while it's in the air
            g.translateBy(x: x, y: 578 - 11 - state.lift)
            g.rotate(by: .degrees(state.angle * dir))
            cup(g, at: CGPoint(x: 0, y: 11), size: 1)
            if state.full {
                g.fill(Path(CGRect(x: -6, y: -9, width: 12, height: 4)), with: .color(Color(hex: 0xF5B84A)))
            }
        }
    }

    private static func cup(_ ctx: GraphicsContext, at bottom: CGPoint, size: CGFloat) {
        var path = Path()
        path.move(to: CGPoint(x: bottom.x - 8 * size, y: bottom.y - 22 * size))
        path.addLine(to: CGPoint(x: bottom.x + 8 * size, y: bottom.y - 22 * size))
        path.addLine(to: CGPoint(x: bottom.x + 6 * size, y: bottom.y))
        path.addLine(to: CGPoint(x: bottom.x - 6 * size, y: bottom.y))
        path.closeSubpath()
        outlined(ctx, path, Color(hex: 0xE0302E), width: 2.5)
        var rim = Path()
        rim.move(to: CGPoint(x: bottom.x - 8 * size, y: bottom.y - 21 * size))
        rim.addLine(to: CGPoint(x: bottom.x + 8 * size, y: bottom.y - 21 * size))
        ctx.stroke(rim, with: .color(.white), lineWidth: 3 * size)
    }

    private static func outlined(_ ctx: GraphicsContext, _ path: Path, _ fill: Color, width: CGFloat = 5) {
        ctx.fill(path, with: .color(fill))
        ctx.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }
}
