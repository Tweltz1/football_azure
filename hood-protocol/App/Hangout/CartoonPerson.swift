import SwiftUI

/// Draws a person in the Hood League crew style (the art from the Hood League site and icon):
/// flat colors, thick ink outlines, round head, rosy cheeks and a big smile.
/// Units match that art: feet at (0, 0), top of the head near y = -240.
enum CartoonPerson {
    enum Pose: Equatable {
        case stand
        case walk(Double)
        case sit
        case game
        case pongThrow(Double)   // 0...1 through the throw
        case bong(Double)        // 0...1 through the rip
        case wave(Double)
    }

    static let ink = Color(hex: 0x16122B)

    static func draw(_ context: GraphicsContext, look: Look, at point: CGPoint, scale: CGFloat,
                     pose: Pose, time: Double, seed: Double = 0, dimmed: Bool = false) {
        var ctx = context
        ctx.translateBy(x: point.x, y: point.y)
        ctx.scaleBy(x: scale, y: scale)
        if dimmed {
            ctx.opacity = 0.35
            ctx.addFilter(.saturation(0))
        }

        let skin = Color(hex: Look.skins[look.skin])
        let shirt = Color(hex: Look.clothes[look.topColor])
        let pants = Color(hex: Look.pantsColors[look.pants])
        let shoe = Color(hex: Look.shoeColors[look.shoes])
        let sleeve = look.top == 3 || look.top == 4 ? skin : shirt

        // Shadow on the floor
        ctx.fill(Path(ellipseIn: CGRect(x: -56, y: -10, width: 112, height: 22)), with: .color(.black.opacity(0.18)))

        var lift: CGFloat = 0
        var legSwing: Double = 0
        switch pose {
        case let .walk(phase):
            legSwing = sin(phase)
            lift = CGFloat(abs(sin(phase))) * 6
        case .sit, .game, .bong:
            lift = -34
        default:
            break
        }
        var body = ctx
        body.translateBy(x: 0, y: -lift)
        let seated: Bool
        switch pose { case .sit, .game, .bong: seated = true; default: seated = false }

        // Legs
        for (index, lx) in [CGFloat(-18), CGFloat(18)].enumerated() {
            var leg = body
            if seated {
                // Knees toward us: short legs from the seat down to the floor
                leg.translateBy(x: 0, y: lift)
                let shin = Path(roundedRect: CGRect(x: lx - 15, y: -46, width: 30, height: 40), cornerRadius: 13)
                outlined(leg, shin, look.top == 4 || look.shorts ? skin : pants)
                outlined(leg, Path(ellipseIn: CGRect(x: lx - 16, y: -52, width: 32, height: 18)), look.top == 4 ? shirt : (look.shorts ? pants : pants))
            } else {
                let angle = Angle.radians((index == 0 ? 1 : -1) * legSwing * 0.35)
                leg.translateBy(x: lx, y: -74)
                leg.rotate(by: angle)
                leg.translateBy(x: -lx, y: 74)
                if look.top == 4 {
                    outlined(leg, Path(roundedRect: CGRect(x: lx - 12, y: -70, width: 24, height: 62), cornerRadius: 11), skin)
                    outlined(leg, Path(roundedRect: CGRect(x: lx - 12, y: -24, width: 24, height: 16), cornerRadius: 4), .white)
                } else if look.shorts {
                    outlined(leg, Path(roundedRect: CGRect(x: lx - 12, y: -50, width: 24, height: 42), cornerRadius: 11), skin)
                    outlined(leg, Path(roundedRect: CGRect(x: lx - 16, y: -74, width: 32, height: 38), cornerRadius: 9), pants)
                } else {
                    outlined(leg, Path(roundedRect: CGRect(x: lx - 14, y: -74, width: 28, height: 68), cornerRadius: 12), pants)
                }
            }
            let foot = seated ? ctx : leg
            outlined(foot, Path(ellipseIn: CGRect(x: lx + (lx > 0 ? 3 : -3) - 21, y: -17, width: 42, height: 20)), shoe)
        }

        // Torso
        if look.top == 4 {
            var dress = Path()
            dress.move(to: CGPoint(x: -30, y: -140))
            dress.addLine(to: CGPoint(x: 30, y: -140))
            dress.addLine(to: CGPoint(x: 44, y: -58))
            dress.addQuadCurve(to: CGPoint(x: -44, y: -58), control: CGPoint(x: 0, y: -50))
            dress.closeSubpath()
            outlined(body, dress, shirt)
            for (sx, sy) in [(-18.0, -120.0), (10, -110), (-6, -92), (22, -80), (-26, -74), (4, -70), (-14, -100), (26, -128)] {
                body.fill(Path(ellipseIn: CGRect(x: sx - 3, y: sy - 3, width: 6, height: 6)), with: .color(Color(hex: 0xFFD1EA)))
            }
        } else {
            outlined(body, Path(roundedRect: CGRect(x: -38, y: -142, width: 76, height: 80), cornerRadius: 20), shirt)
            switch look.top {
            case 1:
                var strings = Path()
                strings.move(to: CGPoint(x: -8, y: -136)); strings.addLine(to: CGPoint(x: -10, y: -112))
                strings.move(to: CGPoint(x: 8, y: -136)); strings.addLine(to: CGPoint(x: 10, y: -112))
                body.stroke(strings, with: .color(Color(hex: 0xEEEEEE)), lineWidth: 3)
                outlined(body, Path(roundedRect: CGRect(x: -24, y: -96, width: 48, height: 22), cornerRadius: 8), shirt, width: 3)
            case 2:
                let packers = Look.clothes[look.topColor] == 0x203731
                var collar = Path()
                collar.move(to: CGPoint(x: -14, y: -142)); collar.addLine(to: CGPoint(x: 0, y: -130)); collar.addLine(to: CGPoint(x: 14, y: -142))
                outlined(body, collar, Color(hex: packers ? 0xFFB612 : 0xF3C33B), width: 3)
                body.draw(Text(packers ? "12" : "17").font(.system(size: 38, weight: .black)).foregroundColor(packers ? Color(hex: 0xFFB612) : .white),
                          at: CGPoint(x: 0, y: -100))
            case 3:
                var straps = Path()
                straps.move(to: CGPoint(x: -38, y: -128)); straps.addQuadCurve(to: CGPoint(x: -22, y: -142), control: CGPoint(x: -24, y: -126))
                straps.move(to: CGPoint(x: 38, y: -128)); straps.addQuadCurve(to: CGPoint(x: 22, y: -142), control: CGPoint(x: 24, y: -126))
                body.fill(straps, with: .color(skin))
                body.stroke(straps, with: .color(ink), lineWidth: 4)
            default:
                break
            }
            if look.chain {
                var chain = Path()
                chain.move(to: CGPoint(x: -16, y: -142))
                chain.addQuadCurve(to: CGPoint(x: 16, y: -142), control: CGPoint(x: 0, y: -112))
                body.stroke(chain, with: .color(Color(hex: 0xF5C542)), lineWidth: 5)
            }
        }

        // Arms
        let left: CGPoint
        let right: CGPoint
        var holding: (() -> Void)?
        switch pose {
        case let .walk(phase):
            left = CGPoint(x: -44 - 6 * sin(phase), y: -72)
            right = CGPoint(x: 44 + 6 * sin(phase), y: -72)
        case .game:
            left = CGPoint(x: -16, y: -98)
            right = CGPoint(x: 16, y: -98)
            holding = {
                outlined(body, Path(roundedRect: CGRect(x: -30, y: -108, width: 60, height: 20), cornerRadius: 9), Color(hex: 0x2A2A33))
                body.fill(Path(ellipseIn: CGRect(x: 12, y: -103, width: 7, height: 7)), with: .color(Color(hex: 0x3DDC97)))
            }
        case let .pongThrow(k):
            left = CGPoint(x: -44, y: -70)
            let raise = sin(min(1, k) * .pi)
            right = CGPoint(x: 46 + 20 * raise, y: -74 - 130 * raise)
        case let .bong(k):
            left = CGPoint(x: -44, y: -70)
            let up = k < 0.8 ? min(1, k / 0.2) : max(0, (1 - k) / 0.2)
            right = CGPoint(x: 44 - 30 * up, y: -74 - 86 * up)
            if up > 0.5 {
                holding = {
                    // A glass piece held up to the mouth
                    outlined(body, Path(roundedRect: CGRect(x: right.x - 6, y: right.y - 50, width: 16, height: 62), cornerRadius: 6),
                             Color(hex: 0x3DDC97).opacity(0.75), width: 3)
                    outlined(body, Path(ellipseIn: CGRect(x: right.x - 12, y: right.y + 4, width: 28, height: 22)), Color(hex: 0x3DDC97).opacity(0.75), width: 3)
                }
            }
        case let .wave(k):
            left = CGPoint(x: -44, y: -70)
            right = CGPoint(x: 66 + 10 * sin(k * 12), y: -196)
        default:
            left = CGPoint(x: -44, y: -70)
            right = CGPoint(x: 44, y: -70)
        }
        arm(body, from: CGPoint(x: -36, y: -128), to: left, side: -1, sleeve: sleeve, skin: skin)
        arm(body, from: CGPoint(x: 36, y: -128), to: right, side: 1, sleeve: sleeve, skin: skin)
        holding?()

        head(body, look: look, skin: skin, shirt: shirt, blink: (time + seed).truncatingRemainder(dividingBy: 4.3) < 0.13,
             puffing: { if case let .bong(k) = pose { return k > 0.45 && k < 0.8 } else { return false } }())
    }

    // MARK: Parts

    private static func outlined(_ ctx: GraphicsContext, _ path: Path, _ fill: Color, width: CGFloat = 5) {
        ctx.fill(path, with: .color(fill))
        ctx.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }

    private static func arm(_ ctx: GraphicsContext, from shoulder: CGPoint, to hand: CGPoint, side: CGFloat, sleeve: Color, skin: Color) {
        var path = Path()
        path.move(to: shoulder)
        path.addQuadCurve(to: hand, control: CGPoint(x: (shoulder.x + hand.x) / 2 + side * 14, y: (shoulder.y + hand.y) / 2))
        ctx.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: 24, lineCap: .round))
        ctx.stroke(path, with: .color(sleeve), style: StrokeStyle(lineWidth: 15, lineCap: .round))
        outlined(ctx, Path(ellipseIn: CGRect(x: hand.x - 10, y: hand.y - 6, width: 20, height: 20)), skin)
    }

    private static func head(_ ctx: GraphicsContext, look: Look, skin: Color, shirt: Color, blink: Bool, puffing: Bool) {
        let hair = Color(hex: Look.hairColors[look.hairColor])
        let hatColor = Color(hex: Look.clothes[look.hatColor])

        if look.top == 1 {
            outlined(ctx, Path(ellipseIn: CGRect(x: -52, y: -238, width: 104, height: 104)), shirt)
        }
        if look.hat == 0 || look.hair == 4 {
            switch look.hair {
            case 4: outlined(ctx, Path(roundedRect: CGRect(x: -54, y: -232, width: 108, height: 116), cornerRadius: 44), hair)
            case 3 where look.hat == 0: outlined(ctx, Path(ellipseIn: CGRect(x: -66, y: -262, width: 132, height: 124)), hair)
            default: break
            }
        }
        // Ears and face
        outlined(ctx, Path(ellipseIn: CGRect(x: -52, y: -192, width: 20, height: 20)), skin)
        outlined(ctx, Path(ellipseIn: CGRect(x: 32, y: -192, width: 20, height: 20)), skin)
        outlined(ctx, Path(ellipseIn: CGRect(x: -44, y: -230, width: 88, height: 88)), skin)
        if look.facial == 1 {
            var beard = Path()
            beard.move(to: CGPoint(x: -38, y: -172))
            beard.addQuadCurve(to: CGPoint(x: 0, y: -134), control: CGPoint(x: -30, y: -136))
            beard.addQuadCurve(to: CGPoint(x: 38, y: -172), control: CGPoint(x: 30, y: -136))
            beard.addQuadCurve(to: CGPoint(x: 0, y: -152), control: CGPoint(x: 20, y: -150))
            beard.addQuadCurve(to: CGPoint(x: -38, y: -172), control: CGPoint(x: -20, y: -150))
            ctx.fill(beard, with: .color(Color(hex: 0x8A5A3C).opacity(0.55)))
        }

        // Hair or hat
        if look.hat == 0 {
            switch look.hair {
            case 0, 1, 4, 5:
                var top = Path()
                top.move(to: CGPoint(x: -44, y: -186))
                top.addQuadCurve(to: CGPoint(x: 0, y: look.hair == 0 ? -232 : -236), control: CGPoint(x: -48, y: -236))
                top.addQuadCurve(to: CGPoint(x: 44, y: -190), control: CGPoint(x: 46, y: -234))
                top.addQuadCurve(to: CGPoint(x: 6, y: -206), control: CGPoint(x: 30, y: -206))
                top.addQuadCurve(to: CGPoint(x: -44, y: -186), control: CGPoint(x: -20, y: -214))
                top.closeSubpath()
                outlined(ctx, top, hair)
                if look.hair == 5 { outlined(ctx, Path(ellipseIn: CGRect(x: -16, y: -262, width: 32, height: 32)), hair) }
            case 2:
                for x in stride(from: -36.0, through: 36.0, by: 18) {
                    outlined(ctx, Path(ellipseIn: CGRect(x: x - 14, y: -240 + abs(x) * 0.35, width: 28, height: 28)), hair, width: 4)
                }
            default:
                break
            }
        } else {
            var dome = Path()
            dome.move(to: CGPoint(x: -45, y: -196))
            dome.addQuadCurve(to: CGPoint(x: 0, y: look.hat == 3 ? -252 : -240), control: CGPoint(x: -46, y: look.hat == 3 ? -252 : -240))
            dome.addQuadCurve(to: CGPoint(x: 45, y: -196), control: CGPoint(x: 46, y: look.hat == 3 ? -252 : -240))
            dome.closeSubpath()
            outlined(ctx, dome, hatColor)
            if look.hat == 3 {
                outlined(ctx, Path(roundedRect: CGRect(x: -48, y: -206, width: 96, height: 18), cornerRadius: 8), hatColor.opacity(0.85))
                outlined(ctx, Path(ellipseIn: CGRect(x: -9, y: -266, width: 18, height: 18)), hatColor)
            } else {
                outlined(ctx, Path(ellipseIn: CGRect(x: -5, y: -245, width: 10, height: 10)), hatColor)
                if look.hat == 1 {
                    var brim = Path()
                    brim.move(to: CGPoint(x: -50, y: -196))
                    brim.addQuadCurve(to: CGPoint(x: 50, y: -196), control: CGPoint(x: 0, y: -212))
                    brim.addQuadCurve(to: CGPoint(x: 40, y: -184), control: CGPoint(x: 52, y: -186))
                    brim.addQuadCurve(to: CGPoint(x: -40, y: -184), control: CGPoint(x: 0, y: -194))
                    brim.addQuadCurve(to: CGPoint(x: -50, y: -196), control: CGPoint(x: -52, y: -186))
                    outlined(ctx, brim, hatColor)
                } else {
                    outlined(ctx, Path(roundedRect: CGRect(x: -14, y: -204, width: 28, height: 10), cornerRadius: 4), Color(hex: 0xE9E3D0), width: 3)
                }
            }
        }

        // Eyes
        if look.shades {
            outlined(ctx, Path(roundedRect: CGRect(x: -30, y: -194, width: 24, height: 16), cornerRadius: 6), Color(hex: 0x111111))
            outlined(ctx, Path(roundedRect: CGRect(x: 6, y: -194, width: 24, height: 16), cornerRadius: 6), Color(hex: 0x111111))
        } else if blink {
            var lids = Path()
            lids.move(to: CGPoint(x: -21, y: -184)); lids.addLine(to: CGPoint(x: -9, y: -184))
            lids.move(to: CGPoint(x: 9, y: -184)); lids.addLine(to: CGPoint(x: 21, y: -184))
            ctx.stroke(lids, with: .color(ink), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        } else {
            ctx.fill(Path(ellipseIn: CGRect(x: -20, y: -191, width: 10, height: 14)), with: .color(ink))
            ctx.fill(Path(ellipseIn: CGRect(x: 10, y: -191, width: 10, height: 14)), with: .color(ink))
            ctx.fill(Path(ellipseIn: CGRect(x: -16, y: -189, width: 4, height: 4)), with: .color(.white))
            ctx.fill(Path(ellipseIn: CGRect(x: 14, y: -189, width: 4, height: 4)), with: .color(.white))
        }
        if look.glasses && !look.shades {
            ctx.stroke(Path(ellipseIn: CGRect(x: -27, y: -196, width: 24, height: 24)), with: .color(ink), lineWidth: 3)
            ctx.stroke(Path(ellipseIn: CGRect(x: 3, y: -196, width: 24, height: 24)), with: .color(ink), lineWidth: 3)
        }
        // Cheeks
        ctx.fill(Path(ellipseIn: CGRect(x: -33, y: -175, width: 14, height: 14)), with: .color(Color(hex: 0xFF7F8F).opacity(0.45)))
        ctx.fill(Path(ellipseIn: CGRect(x: 19, y: -175, width: 14, height: 14)), with: .color(Color(hex: 0xFF7F8F).opacity(0.45)))
        if look.facial == 2 {
            var stache = Path()
            stache.move(to: CGPoint(x: -16, y: -166))
            stache.addQuadCurve(to: CGPoint(x: 0, y: -166), control: CGPoint(x: -8, y: -172))
            stache.addQuadCurve(to: CGPoint(x: 16, y: -166), control: CGPoint(x: 8, y: -172))
            stache.addQuadCurve(to: CGPoint(x: 0, y: -164), control: CGPoint(x: 8, y: -160))
            stache.addQuadCurve(to: CGPoint(x: -16, y: -166), control: CGPoint(x: -8, y: -160))
            outlined(ctx, stache, Color(hex: 0x3A2418), width: 2)
        }
        // Mouth: big smile, or an "o" while taking a rip
        if puffing {
            outlined(ctx, Path(ellipseIn: CGRect(x: -7, y: -162, width: 14, height: 12)), Color(hex: 0x5A2030), width: 3)
        } else {
            var smile = Path()
            smile.move(to: CGPoint(x: -15, y: -160))
            smile.addQuadCurve(to: CGPoint(x: 15, y: -160), control: CGPoint(x: 0, y: -144))
            smile.closeSubpath()
            outlined(ctx, smile, .white, width: 4)
        }
    }
}

/// One character, big, for the appearance editor.
struct CartoonCharacterView: View {
    let look: Look

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let scale = min(size.height / 300, size.width / 180)
                let k = t.truncatingRemainder(dividingBy: 5)
                let pose: CartoonPerson.Pose = k < 1.2 ? .wave(k) : .stand
                CartoonPerson.draw(context, look: look, at: CGPoint(x: size.width / 2, y: size.height - 16 * scale),
                                   scale: scale, pose: pose, time: t)
            }
        }
    }
}
