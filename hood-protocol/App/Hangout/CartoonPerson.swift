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
        case pongThrow(Double, CGFloat)   // 0...1 through the throw, facing right (1) or left (-1)
        case bong(Double)                 // 0...1 through the rip
        case wave(Double)
        case drink(Double)                // 0...1 through a cup
        case flick(Double, CGFloat)       // 0...1 through one flip cup try
        case cheer(Double)
        case kegStand(Double)             // seconds into the stand
        case holdLegs
    }

    /// The face someone is making.
    enum Face { case smile, sip, puffed, cough }

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
        if case .kegStand = pose {} else {
            ctx.fill(Path(ellipseIn: CGRect(x: -56, y: -10, width: 112, height: 22)), with: .color(.black.opacity(0.18)))
        }

        var lift: CGFloat = 0
        var legSwing: Double = 0
        switch pose {
        case let .walk(phase):
            legSwing = sin(phase)
            lift = CGFloat(abs(sin(phase))) * 6
        case .game:
            // Low on a beanbag
            lift = -34
        case .sit, .bong:
            // Up on the couch cushions, legs hanging down to the floor
            lift = 30
        case let .cheer(clock):
            lift = CGFloat(abs(sin(clock * 6))) * 12
        case let .kegStand(seconds):
            // Legs kicking while upside down
            if HangoutModel.kegFlip(seconds) == 1 { legSwing = 0.35 * sin(time * 7) }
        default:
            break
        }
        var body = ctx
        body.translateBy(x: 0, y: -lift)
        // Coughing after a rip
        if case let .bong(k) = pose, k > 0.8, k < 0.96 {
            body.translateBy(x: 3 * CGFloat(sin(time * 45)), y: 2 * CGFloat(sin(time * 31)))
        }
        let seated: Bool
        switch pose { case .sit, .game, .bong: seated = true; default: seated = false }

        // Legs
        for (index, lx) in [CGFloat(-18), CGFloat(18)].enumerated() {
            var leg = body
            if seated {
                // Knees toward us: short legs from the seat down to the floor
                leg.translateBy(x: 0, y: lift)
                let knee: CGFloat = lift > 0 ? -92 : -52
                let shin = Path(roundedRect: CGRect(x: lx - 14, y: knee + 6, width: 28, height: -knee - 12), cornerRadius: 12)
                outlined(leg, shin, look.top == 4 || look.shorts ? skin : pants)
                outlined(leg, Path(ellipseIn: CGRect(x: lx - 16, y: knee, width: 32, height: 18)), look.top == 4 ? shirt : pants)
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
        var left = CGPoint(x: -44, y: -70)
        var right = CGPoint(x: 44, y: -70)
        var holding: (() -> Void)?
        var front: (() -> Void)?
        var face = Face.smile
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
        case let .pongThrow(k, facing):
            // Wind up low, then flick the ball out in an arc
            let windUp = k < 0.3 ? sin(k / 0.3 * .pi / 2) : 1
            let release = k < 0.3 ? 0 : sin(min(1, (k - 0.3) / 0.4) * .pi / 2)
            let back = k > 0.75 ? (k - 0.75) / 0.25 : 0
            let hand = CGPoint(x: 40 + 10 * windUp + 26 * release - 30 * back,
                               y: -90 - 60 * windUp - 40 * release + 100 * back)
            if facing > 0 { right = hand } else { left = CGPoint(x: -hand.x, y: hand.y) }
            if k < 0.32 {
                let ball = facing > 0 ? right : left
                holding = { outlined(body, Path(ellipseIn: CGRect(x: ball.x - 7, y: ball.y - 16, width: 14, height: 14)), .white, width: 2.5) }
            }
        case let .drink(k):
            let raise = k < 0.22 ? smooth(k / 0.22) : k > 0.8 ? smooth((1 - k) / 0.2) : 1
            right = CGPoint(x: 44 - 28 * raise, y: -70 - 92 * raise)
            if raise > 0.6 { face = .sip }
            let hand = right
            front = { redCup(body, at: CGPoint(x: hand.x - 2, y: hand.y + 10), tilt: -70 * raise, empty: false) }
        case let .flick(k, facing):
            // Reach under the lip of the cup hanging off the table edge, then flick it up
            let reach = smooth(min(1, k / 0.3))
            let flick = k < 0.3 ? 0 : k < 0.42 ? (k - 0.3) / 0.12 : max(0, 1 - (k - 0.42) / 0.4)
            let hand = CGPoint(x: 44 + 22 * reach + 4 * flick, y: -70 + 18 * reach - 40 * flick)
            if facing > 0 { right = hand } else { left = CGPoint(x: -hand.x, y: hand.y) }
            if facing > 0 { left = CGPoint(x: -30, y: -84) } else { right = CGPoint(x: 30, y: -84) }
        case let .cheer(clock):
            left = CGPoint(x: -58, y: -214 - 12 * sin(clock * 12))
            right = CGPoint(x: 58, y: -214 - 12 * sin(clock * 12 + 1.5))
        case let .kegStand(seconds):
            let over = HangoutModel.kegFlip(seconds)
            if seconds < 0.6 {
                left = CGPoint(x: -26, y: -84)
                right = CGPoint(x: 26, y: -84)
            } else if seconds < 6.3 {
                left = CGPoint(x: -22, y: -205)
                right = CGPoint(x: 22, y: -205)
                if over == 1 { face = .sip }
            } else {
                left = CGPoint(x: -58, y: -214 - 12 * sin(time * 12))
                right = CGPoint(x: 58, y: -214 - 12 * sin(time * 12 + 1.5))
            }
        case .holdLegs:
            left = CGPoint(x: 34, y: -292)
            right = CGPoint(x: 72, y: -282)
        case let .bong(k):
            // Pick it up, light the bowl while pulling, clear it, put it down, hold it in, cough it out
            let inHand = k >= 0.06 && k <= 0.72
            let raise: Double
            switch k {
            case ..<0.06: raise = 0
            case ..<0.14: raise = smooth((k - 0.06) / 0.08)
            case ..<0.63: raise = 1
            case ..<0.72: raise = 1 - smooth((k - 0.63) / 0.09)
            default: raise = 0
            }
            let drop = CGFloat(1 - raise) * 30
            let lighting = k >= 0.14 && k < 0.55
            let clearing = k >= 0.55 && k < 0.63
            if k < 0.06 {
                left = CGPoint(x: -14, y: -76)
                right = CGPoint(x: 18, y: -76)
            } else if inHand {
                right = CGPoint(x: 16, y: -122 + drop)
                left = lighting ? CGPoint(x: -56, y: -120) : CGPoint(x: -22, y: -56 + drop)
            }
            switch k {
            case 0.14..<0.63: face = .sip
            case 0.63..<0.8: face = .puffed
            case 0.8...: face = .cough
            default: break
            }
            if inHand {
                let fill = lighting ? (k - 0.14) / 0.41 : clearing ? 1.0 : 0
                let cleared = clearing ? (k - 0.55) / 0.08 : 0
                let lighter = left
                front = {
                    RoomArt.bong(body, base: CGPoint(x: 4, y: -50 + drop), scale: 1, smoke: (cleared, fill),
                                 bubbling: lighting || clearing, ember: lighting || clearing, time: time)
                    if lighting {
                        // Lighter tipped into the bowl
                        var hand = body
                        hand.translateBy(x: lighter.x, y: lighter.y)
                        hand.rotate(by: .degrees(35))
                        outlined(hand, Path(roundedRect: CGRect(x: -6, y: -4, width: 12, height: 22), cornerRadius: 3), Color(hex: 0xE0302E), width: 2.5)
                        let flicker = CGFloat(sin(time * 30)) * 2
                        var flame = Path()
                        flame.move(to: CGPoint(x: 0, y: -4))
                        flame.addQuadCurve(to: CGPoint(x: 0, y: -22 - flicker), control: CGPoint(x: 9, y: -10))
                        flame.addQuadCurve(to: CGPoint(x: 0, y: -4), control: CGPoint(x: -9, y: -10))
                        hand.fill(flame, with: .color(Color(hex: 0xFFB33A)))
                        hand.fill(Path(ellipseIn: CGRect(x: -2.5, y: -13, width: 5, height: 8)), with: .color(Color(hex: 0xFFF1A8)))
                    }
                }
            }
        case let .wave(k):
            right = CGPoint(x: 66 + 10 * sin(k * 12), y: -196)
        default:
            break
        }
        arm(body, from: CGPoint(x: -36, y: -128), to: left, side: -1, sleeve: sleeve, skin: skin)
        arm(body, from: CGPoint(x: 36, y: -128), to: right, side: 1, sleeve: sleeve, skin: skin)
        holding?()

        head(body, look: look, skin: skin, shirt: shirt, blink: (time + seed).truncatingRemainder(dividingBy: 4.3) < 0.13, face: face)
        front?()
    }

    private static func smooth(_ x: Double) -> Double { HangoutModel.smooth(max(0, min(1, x))) }

    /// A red party cup held in a hand, bottom at the point.
    static func redCup(_ ctx: GraphicsContext, at bottom: CGPoint, tilt: Double, empty: Bool) {
        var cup = ctx
        cup.translateBy(x: bottom.x, y: bottom.y)
        cup.rotate(by: .degrees(tilt))
        var path = Path()
        path.move(to: CGPoint(x: -13, y: -36)); path.addLine(to: CGPoint(x: 13, y: -36))
        path.addLine(to: CGPoint(x: 10, y: 0)); path.addLine(to: CGPoint(x: -10, y: 0)); path.closeSubpath()
        outlined(cup, path, Color(hex: 0xE0302E), width: 3)
        var rim = Path()
        rim.move(to: CGPoint(x: -13, y: -34)); rim.addLine(to: CGPoint(x: 13, y: -34))
        cup.stroke(rim, with: .color(.white), lineWidth: 4)
    }

    // MARK: Parts

    private static func outlined(_ ctx: GraphicsContext, _ path: Path, _ fill: Color, width: CGFloat = 5) {
        ctx.fill(path, with: .color(fill))
        ctx.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
    }

    private static func arm(_ ctx: GraphicsContext, from shoulder: CGPoint, to reach: CGPoint, side: CGFloat, sleeve: Color, skin: Color) {
        // Arms only stretch so far
        let dx = reach.x - shoulder.x, dy = reach.y - shoulder.y
        let length = hypot(dx, dy)
        let maxLength: CGFloat = 82
        let hand = length > maxLength ? CGPoint(x: shoulder.x + dx / length * maxLength, y: shoulder.y + dy / length * maxLength) : reach
        var path = Path()
        path.move(to: shoulder)
        path.addQuadCurve(to: hand, control: CGPoint(x: (shoulder.x + hand.x) / 2 + side * 14, y: (shoulder.y + hand.y) / 2))
        ctx.stroke(path, with: .color(ink), style: StrokeStyle(lineWidth: 24, lineCap: .round))
        ctx.stroke(path, with: .color(sleeve), style: StrokeStyle(lineWidth: 15, lineCap: .round))
        outlined(ctx, Path(ellipseIn: CGRect(x: hand.x - 10, y: hand.y - 6, width: 20, height: 20)), skin)
    }

    private static func head(_ ctx: GraphicsContext, look: Look, skin: Color, shirt: Color, blink: Bool, face: Face) {
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
        } else if face == .cough {
            // Eyes squeezed shut
            var squint = Path()
            squint.move(to: CGPoint(x: -22, y: -190)); squint.addLine(to: CGPoint(x: -10, y: -184)); squint.addLine(to: CGPoint(x: -22, y: -178))
            squint.move(to: CGPoint(x: 22, y: -190)); squint.addLine(to: CGPoint(x: 10, y: -184)); squint.addLine(to: CGPoint(x: 22, y: -178))
            ctx.stroke(squint, with: .color(ink), style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
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
        // Cheeks, blown out while holding a hit in
        let cheek: CGFloat = face == .puffed ? 24 : 14
        let cheekColor = Color(hex: 0xFF7F8F).opacity(face == .puffed ? 0.6 : 0.45)
        ctx.fill(Path(ellipseIn: CGRect(x: -26 - cheek / 2, y: -168 - cheek / 2, width: cheek, height: cheek)), with: .color(cheekColor))
        ctx.fill(Path(ellipseIn: CGRect(x: 26 - cheek / 2, y: -168 - cheek / 2, width: cheek, height: cheek)), with: .color(cheekColor))
        if look.facial == 2 {
            var stache = Path()
            stache.move(to: CGPoint(x: -16, y: -166))
            stache.addQuadCurve(to: CGPoint(x: 0, y: -166), control: CGPoint(x: -8, y: -172))
            stache.addQuadCurve(to: CGPoint(x: 16, y: -166), control: CGPoint(x: 8, y: -172))
            stache.addQuadCurve(to: CGPoint(x: 0, y: -164), control: CGPoint(x: 8, y: -160))
            stache.addQuadCurve(to: CGPoint(x: -16, y: -166), control: CGPoint(x: -8, y: -160))
            outlined(ctx, stache, Color(hex: 0x3A2418), width: 2)
        }
        // Mouth
        switch face {
        case .sip:
            outlined(ctx, Path(ellipseIn: CGRect(x: -7, y: -162, width: 14, height: 12)), Color(hex: 0x5A2030), width: 3)
        case .puffed:
            var lips = Path()
            lips.move(to: CGPoint(x: -6, y: -156)); lips.addLine(to: CGPoint(x: 6, y: -156))
            ctx.stroke(lips, with: .color(ink), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        case .cough:
            outlined(ctx, Path(ellipseIn: CGRect(x: -11, y: -166, width: 22, height: 20)), Color(hex: 0x5A2030), width: 4)
        case .smile:
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
