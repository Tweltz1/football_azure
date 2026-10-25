import SwiftUI

/// The bright cartoon basement, in the Hood League art style: flat colors and thick ink outlines.
/// Everything is drawn in the 1000 x 640 room space.
enum RoomArt {
    private static let ink = CartoonPerson.ink
    static let wallBottom: CGFloat = 430

    // MARK: Back of the room

    static func drawBack(_ ctx: GraphicsContext, night: Double, time t: Double) {
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

        tv(ctx, time: t)
        lamp(ctx)
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

    private static func tv(_ ctx: GraphicsContext, time t: Double) {
        // Stand and console
        outlined(ctx, Path(roundedRect: CGRect(x: 40, y: 360, width: 260, height: 90), cornerRadius: 8), Color(hex: 0x3A3A44))
        outlined(ctx, Path(roundedRect: CGRect(x: 70, y: 384, width: 70, height: 20), cornerRadius: 5), Color(hex: 0xF2F2F2), width: 3)
        ctx.fill(Path(ellipseIn: CGRect(x: 126, y: 390, width: 7, height: 7)), with: .color(Color(hex: 0x3DDC97)))
        // TV
        let screen = CGRect(x: 48, y: 196, width: 244, height: 150)
        outlined(ctx, Path(roundedRect: screen.insetBy(dx: -10, dy: -10), cornerRadius: 10), Color(hex: 0x15151A))
        outlined(ctx, Path(CGRect(x: 160, y: 346, width: 20, height: 16)), Color(hex: 0x15151A), width: 3)
        var game = ctx
        game.clip(to: Path(screen))
        spaceShooter(game, in: screen, time: t)
        // Screen glow onto the wall
        ctx.fill(Path(ellipseIn: screen.insetBy(dx: -50, dy: -40)), with: .color(Color(hex: 0x6FD3FF).opacity(0.08 + 0.04 * sin(t * 7))))
    }

    /// A made-up sci-fi shooter on the TV: ring world in the sky, aliens, a rifle and a HUD.
    private static func spaceShooter(_ ctx: GraphicsContext, in r: CGRect, time t: Double) {
        ctx.fill(Path(r), with: .linearGradient(Gradient(colors: [Color(hex: 0x2B5C8A), Color(hex: 0x7FC8D8)]),
                                                startPoint: CGPoint(x: 0, y: r.minY), endPoint: CGPoint(x: 0, y: r.maxY)))
        // Ring world arching across the sky
        var ring = Path()
        ring.addArc(center: CGPoint(x: r.midX + 30, y: r.maxY + 60), radius: 190, startAngle: .degrees(200), endAngle: .degrees(320), clockwise: false)
        ctx.stroke(ring, with: .color(Color(hex: 0xC8D8E8).opacity(0.85)), lineWidth: 7)
        ctx.stroke(ring, with: .color(Color(hex: 0x8AA0B8)), lineWidth: 2)
        // Hills
        let sway = 6 * sin(t * 0.7)
        var hills = Path()
        hills.move(to: CGPoint(x: r.minX, y: r.maxY - 40))
        hills.addQuadCurve(to: CGPoint(x: r.midX, y: r.maxY - 46), control: CGPoint(x: r.minX + 60 + sway, y: r.maxY - 80))
        hills.addQuadCurve(to: CGPoint(x: r.maxX, y: r.maxY - 36), control: CGPoint(x: r.maxX - 50 + sway, y: r.maxY - 76))
        hills.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); hills.addLine(to: CGPoint(x: r.minX, y: r.maxY)); hills.closeSubpath()
        ctx.fill(hills, with: .color(Color(hex: 0x4E8A4A)))
        // Aliens strafing
        for i in 0..<3 {
            let x = r.minX + 40 + Double(i) * 75 + 22 * sin(t * 1.6 + Double(i) * 2)
            let y = r.maxY - 58 - Double(i % 2) * 14
            let alien = CGRect(x: x - 9, y: y - 14, width: 18, height: 22)
            ctx.fill(Path(roundedRect: alien, cornerRadius: 8), with: .color(Color(hex: i == 1 ? 0xB04AE0 : 0xE08A2A)))
            ctx.fill(Path(ellipseIn: CGRect(x: x - 6, y: y - 10, width: 12, height: 6)), with: .color(Color(hex: 0x9CFFFA)))
        }
        // Shots and muzzle flash
        let cycle = t.truncatingRemainder(dividingBy: 0.7)
        let gunTip = CGPoint(x: r.maxX - 62, y: r.maxY - 46)
        if cycle < 0.18 {
            var shot = Path()
            shot.move(to: gunTip)
            shot.addLine(to: CGPoint(x: r.midX, y: r.midY + 8))
            ctx.stroke(shot, with: .color(Color(hex: 0x9CFFFA)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            ctx.fill(Path(ellipseIn: CGRect(x: gunTip.x - 10, y: gunTip.y - 10, width: 20, height: 20)), with: .color(Color(hex: 0xFFE38A)))
        }
        // Rifle in the bottom right
        var gun = Path()
        gun.move(to: CGPoint(x: r.maxX - 66, y: r.maxY - 52))
        gun.addLine(to: CGPoint(x: r.maxX - 20, y: r.maxY - 34))
        gun.addLine(to: CGPoint(x: r.maxX + 4, y: r.maxY - 22))
        gun.addLine(to: CGPoint(x: r.maxX + 4, y: r.maxY + 4))
        gun.addLine(to: CGPoint(x: r.maxX - 44, y: r.maxY + 4))
        gun.addLine(to: CGPoint(x: r.maxX - 72, y: r.maxY - 40))
        gun.closeSubpath()
        ctx.fill(gun, with: .color(Color(hex: 0x3E4A3A)))
        ctx.stroke(gun, with: .color(Color(hex: 0x1A2018)), lineWidth: 2)
        // HUD: crosshair, shield bar, ammo, radar
        ctx.stroke(Path(ellipseIn: CGRect(x: r.midX - 9, y: r.midY - 1, width: 18, height: 18)), with: .color(Color(hex: 0x9CFFFA)), lineWidth: 2)
        ctx.stroke(Path(roundedRect: CGRect(x: r.midX - 50, y: r.minY + 8, width: 100, height: 9), cornerRadius: 3), with: .color(Color(hex: 0x9CFFFA)), lineWidth: 1.5)
        let shield = 0.55 + 0.4 * sin(t * 0.5)
        ctx.fill(Path(roundedRect: CGRect(x: r.midX - 48, y: r.minY + 10, width: 96 * shield, height: 5), cornerRadius: 2), with: .color(Color(hex: 0x4AB8FF)))
        ctx.draw(Text("\(32 - Int(t / 0.7) % 32)").font(.system(size: 13, weight: .black, design: .monospaced)).foregroundColor(Color(hex: 0x9CFFFA)),
                 at: CGPoint(x: r.maxX - 20, y: r.minY + 14))
        ctx.stroke(Path(ellipseIn: CGRect(x: r.minX + 8, y: r.maxY - 38, width: 30, height: 30)), with: .color(Color(hex: 0x9CFFFA).opacity(0.8)), lineWidth: 1.5)
        ctx.fill(Path(ellipseIn: CGRect(x: r.minX + 20, y: r.maxY - 26, width: 5, height: 5)), with: .color(Color(hex: 0xFF5A5A)))
    }

    private static func lamp(_ ctx: GraphicsContext) {
        ctx.fill(Path(ellipseIn: CGRect(x: 230, y: 230, width: 150, height: 150)), with: .color(Color(hex: 0xFFE3A0).opacity(0.35)))
        var pole = Path()
        pole.move(to: CGPoint(x: 330, y: 300)); pole.addLine(to: CGPoint(x: 330, y: 470))
        ctx.stroke(pole, with: .color(ink), style: StrokeStyle(lineWidth: 7, lineCap: .round))
        outlined(ctx, Path(ellipseIn: CGRect(x: 306, y: 462, width: 48, height: 14)), Color(hex: 0x3A3A44), width: 3)
        var shade = Path()
        shade.move(to: CGPoint(x: 300, y: 260)); shade.addLine(to: CGPoint(x: 360, y: 260))
        shade.addLine(to: CGPoint(x: 378, y: 306)); shade.addLine(to: CGPoint(x: 282, y: 306)); shade.closeSubpath()
        outlined(ctx, shade, Color(hex: 0xFFE7AE))
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
    static func furniture(time t: Double) -> [(CGFloat, (GraphicsContext) -> Void)] {
        [
            (555, { beanbag($0, center: CGPoint(x: 150, y: 562), color: Color(hex: 0xFF6B6B)) }),
            (585, { beanbag($0, center: CGPoint(x: 262, y: 592), color: Color(hex: 0x2F80ED)) }),
            (590, { coffeeTable($0) }),
            (545, { pongTable($0) }),
        ]
    }

    private static func beanbag(_ ctx: GraphicsContext, center: CGPoint, color: Color) {
        outlined(ctx, Path(ellipseIn: CGRect(x: center.x - 58, y: center.y - 44, width: 116, height: 60)), color)
        ctx.fill(Path(ellipseIn: CGRect(x: center.x - 30, y: center.y - 36, width: 40, height: 14)), with: .color(.white.opacity(0.25)))
    }

    private static func coffeeTable(_ ctx: GraphicsContext) {
        for x in [462.0, 610] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 548, width: 12, height: 42), cornerRadius: 3), Color(hex: 0x6B4A30), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 445, y: 532, width: 190, height: 22), cornerRadius: 6), Color(hex: 0x9A6B44))
        // Pizza box
        outlined(ctx, Path(roundedRect: CGRect(x: 548, y: 520, width: 70, height: 14), cornerRadius: 3), Color(hex: 0xE2C08E), width: 3)
        // The glass piece
        outlined(ctx, Path(roundedRect: CGRect(x: 487, y: 474, width: 16, height: 52), cornerRadius: 6), Color(hex: 0x3DDC97).opacity(0.8), width: 3)
        outlined(ctx, Path(ellipseIn: CGRect(x: 478, y: 508, width: 34, height: 26)), Color(hex: 0x3DDC97).opacity(0.8), width: 3)
        outlined(ctx, Path(roundedRect: CGRect(x: 506, y: 512, width: 14, height: 6), cornerRadius: 2), Color(hex: 0x9AA0A8), width: 2)
        // Red cups
        for x in [456.0, 528] { cup(ctx, at: CGPoint(x: x, y: 532), size: 1) }
    }

    private static func pongTable(_ ctx: GraphicsContext) {
        for x in [752.0, 914] {
            outlined(ctx, Path(roundedRect: CGRect(x: x, y: 468, width: 10, height: 76), cornerRadius: 3), Color(hex: 0x44444C), width: 3)
        }
        outlined(ctx, Path(roundedRect: CGRect(x: 735, y: 456, width: 210, height: 16), cornerRadius: 5), Color(hex: 0x2F80ED))
        var line = Path()
        line.move(to: CGPoint(x: 840, y: 458)); line.addLine(to: CGPoint(x: 840, y: 470))
        ctx.stroke(line, with: .color(.white), lineWidth: 3)
        // A pyramid of cups at each end
        for (start, step) in [(748.0, 1.0), (932, -1.0)] {
            for (row, count) in [3, 2, 1].enumerated() {
                for i in 0..<count {
                    let x = start + step * (Double(i) * 16 + Double(row) * 8)
                    cup(ctx, at: CGPoint(x: x, y: 456 - Double(row) * 6), size: 0.8)
                }
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
