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
        // The toga and the referee shirt are always white
        let shirt = look.top == 7 || look.top == 9 ? Color(hex: 0xF4F1EA) : Color(hex: Look.clothes[look.topColor])
        let pants = Color(hex: Look.pantsColors[look.pants])
        let shoe = Color(hex: Look.shoeColors[look.shoes])
        let sleeve = look.top == 3 || look.top == 4 || look.top == 7 ? skin : look.top == 6 ? Color(hex: 0x15151A) : shirt

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
            case 5:
                // Hawaiian flowers
                for (fx, fy) in [(-22.0, -124.0), (14, -116), (-8, -96), (24, -86), (-26, -80), (4, -132)] {
                    for petal in 0..<5 {
                        let a = Double(petal) / 5 * 2 * .pi
                        body.fill(Path(ellipseIn: CGRect(x: fx + 5 * cos(a) - 3.5, y: fy + 5 * sin(a) - 3.5, width: 7, height: 7)),
                                  with: .color(Color(hex: petal % 2 == 0 ? 0xFFF1A8 : 0xFFFFFF)))
                    }
                    body.fill(Path(ellipseIn: CGRect(x: fx - 2.5, y: fy - 2.5, width: 5, height: 5)), with: .color(Color(hex: 0xFF6B6B)))
                }
            case 6:
                // Tux: white shirt front, lapels, bow tie
                var front = Path()
                front.move(to: CGPoint(x: -14, y: -142)); front.addLine(to: CGPoint(x: 14, y: -142)); front.addLine(to: CGPoint(x: 0, y: -84)); front.closeSubpath()
                outlined(body, front, .white, width: 3)
                for y in [-114.0, -100] { body.fill(Path(ellipseIn: CGRect(x: -2.5, y: y, width: 5, height: 5)), with: .color(ink)) }
                var bow = Path()
                bow.move(to: CGPoint(x: 0, y: -134)); bow.addLine(to: CGPoint(x: -13, y: -141)); bow.addLine(to: CGPoint(x: -13, y: -127)); bow.closeSubpath()
                bow.move(to: CGPoint(x: 0, y: -134)); bow.addLine(to: CGPoint(x: 13, y: -141)); bow.addLine(to: CGPoint(x: 13, y: -127)); bow.closeSubpath()
                outlined(body, bow, Color(hex: 0xD33B3B), width: 2.5)
            case 7:
                // Toga: bare shoulder and a draped sash
                body.fill(Path(ellipseIn: CGRect(x: 14, y: -146, width: 30, height: 22)), with: .color(skin))
                var sash = Path()
                sash.move(to: CGPoint(x: -38, y: -136)); sash.addLine(to: CGPoint(x: 14, y: -142))
                sash.addLine(to: CGPoint(x: 38, y: -70)); sash.addLine(to: CGPoint(x: 10, y: -64)); sash.closeSubpath()
                outlined(body, sash, Color(hex: 0xE6E0D2), width: 3)
                var leaves = Path()
                for k in 0..<4 { leaves.addEllipse(in: CGRect(x: -30 + Double(k) * 9, y: -128 + Double(k) * 9, width: 9, height: 5)) }
                body.fill(leaves, with: .color(Color(hex: 0xC9A227)))
            case 8:
                // Letterman jacket: a big chenille letter and striped cuffs
                outlined(body, Path(roundedRect: CGRect(x: -32, y: -124, width: 24, height: 28), cornerRadius: 4), .white, width: 3)
                body.draw(Text("H").font(.system(size: 22, weight: .black)).foregroundColor(shirt), at: CGPoint(x: -20, y: -110))
                for y in [-70.0, -64] {
                    var band = Path()
                    band.move(to: CGPoint(x: -36, y: y)); band.addLine(to: CGPoint(x: 36, y: y))
                    body.stroke(band, with: .color(.white), lineWidth: 3)
                }
            case 9:
                // Referee stripes and a whistle
                for x in stride(from: -30.0, through: 30, by: 15) {
                    body.fill(Path(CGRect(x: x - 3.5, y: -140, width: 7, height: 76)), with: .color(Color(hex: 0x15151A)))
                }
                outlined(body, Path(roundedRect: CGRect(x: 10, y: -112, width: 14, height: 8), cornerRadius: 3), Color(hex: 0xC0C4CC), width: 2)
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
            // Reaching over to hold the legs of whoever's on the keg, just to their left
            left = CGPoint(x: -76, y: -196)
            right = CGPoint(x: -30, y: -206)
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

        head(body, look: look, skin: skin, shirt: shirt, blink: (time + seed).truncatingRemainder(dividingBy: 4.3) < 0.13, face: face, time: time)
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

    static func hairShows(_ look: Look) -> Bool { [0, 4, 6, 12].contains(look.hat) }

    /// Cap, backwards cap or beanie.
    private static func classicHat(_ ctx: GraphicsContext, _ hat: Int, _ hatColor: Color) {
        var dome = Path()
        dome.move(to: CGPoint(x: -45, y: -196))
        dome.addQuadCurve(to: CGPoint(x: 0, y: hat == 3 ? -252 : -240), control: CGPoint(x: -46, y: hat == 3 ? -252 : -240))
        dome.addQuadCurve(to: CGPoint(x: 45, y: -196), control: CGPoint(x: 46, y: hat == 3 ? -252 : -240))
        dome.closeSubpath()
        outlined(ctx, dome, hatColor)
        if hat == 3 {
            outlined(ctx, Path(roundedRect: CGRect(x: -48, y: -206, width: 96, height: 18), cornerRadius: 8), hatColor.opacity(0.85))
            outlined(ctx, Path(ellipseIn: CGRect(x: -9, y: -266, width: 18, height: 18)), hatColor)
        } else {
            outlined(ctx, Path(ellipseIn: CGRect(x: -5, y: -245, width: 10, height: 10)), hatColor)
            if hat == 1 {
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

    /// The hats you earn.
    private static func fancyHat(_ ctx: GraphicsContext, _ hat: Int, _ color: Color, time: Double) {
        func poly(_ points: [(Double, Double)]) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: points[0].0, y: points[0].1))
            for p in points.dropFirst() { path.addLine(to: CGPoint(x: p.0, y: p.1)) }
            path.closeSubpath()
            return path
        }
        switch hat {
        case 4: // Party hat
            outlined(ctx, poly([(-26, -218), (26, -218), (4, -300)]), color)
            for (x, y) in [(-8.0, -236.0), (10, -248), (2, -270), (-14, -226), (14, -228)] {
                ctx.fill(Path(ellipseIn: CGRect(x: x - 3, y: y - 3, width: 6, height: 6)), with: .color(.white))
            }
            outlined(ctx, Path(ellipseIn: CGRect(x: -5, y: -310, width: 18, height: 18)), .white, width: 3)
        case 5: // Cowboy hat
            outlined(ctx, Path(ellipseIn: CGRect(x: -82, y: -214, width: 164, height: 28)), color)
            var crown = Path()
            crown.move(to: CGPoint(x: -38, y: -204))
            crown.addLine(to: CGPoint(x: -34, y: -252))
            crown.addQuadCurve(to: CGPoint(x: 0, y: -248), control: CGPoint(x: -18, y: -266))
            crown.addQuadCurve(to: CGPoint(x: 34, y: -252), control: CGPoint(x: 18, y: -266))
            crown.addLine(to: CGPoint(x: 38, y: -204))
            crown.closeSubpath()
            outlined(ctx, crown, color)
            ctx.fill(Path(CGRect(x: -37, y: -218, width: 74, height: 9)), with: .color(ink.opacity(0.75)))
        case 6: // Crown
            outlined(ctx, poly([(-38, -212), (-40, -250), (-20, -230), (0, -260), (20, -230), (40, -250), (38, -212)]), Color(hex: 0xF5C542))
            for (x, c) in [(-22.0, 0x2F80ED), (0, 0xE0302E), (22, 0x3DDC97)] as [(Double, UInt32)] {
                outlined(ctx, Path(ellipseIn: CGRect(x: x - 5, y: -228, width: 10, height: 10)), Color(hex: c), width: 2)
            }
        case 7: // Traffic cone
            let cone = poly([(-40, -206), (40, -206), (7, -318), (-7, -318)])
            outlined(ctx, cone, Color(hex: 0xFF7A1A))
            var stripes = ctx
            stripes.clip(to: cone)
            for y in [-292.0, -252] { stripes.fill(Path(CGRect(x: -50, y: y, width: 100, height: 16)), with: .color(.white)) }
            ctx.stroke(cone, with: .color(ink), lineWidth: 5)
            outlined(ctx, Path(roundedRect: CGRect(x: -58, y: -212, width: 116, height: 14), cornerRadius: 4), Color(hex: 0xFF7A1A))
        case 8: // Viking helmet
            for side in [-1.0, 1.0] {
                var horn = Path()
                horn.move(to: CGPoint(x: 38 * side, y: -214))
                horn.addQuadCurve(to: CGPoint(x: 70 * side, y: -270), control: CGPoint(x: 80 * side, y: -226))
                horn.addQuadCurve(to: CGPoint(x: 44 * side, y: -228), control: CGPoint(x: 60 * side, y: -236))
                horn.closeSubpath()
                outlined(ctx, horn, Color(hex: 0xF4EBD0), width: 4)
            }
            var dome = Path()
            dome.move(to: CGPoint(x: -46, y: -204))
            dome.addQuadCurve(to: CGPoint(x: 46, y: -204), control: CGPoint(x: 0, y: -280))
            dome.closeSubpath()
            outlined(ctx, dome, Color(hex: 0xB8BEC8))
            outlined(ctx, Path(roundedRect: CGRect(x: -48, y: -214, width: 96, height: 14), cornerRadius: 4), Color(hex: 0xB07A4C), width: 4)
            for x in [-30.0, -10, 10, 30] { ctx.fill(Path(ellipseIn: CGRect(x: x - 2.5, y: -210, width: 5, height: 5)), with: .color(Color(hex: 0xF5C542))) }
        case 9: // Propeller cap
            classicHat(ctx, 1, color)
            ctx.fill(Path(CGRect(x: -2.5, y: -262, width: 5, height: 20)), with: .color(ink))
            let spin = CGFloat(abs(cos(time * 14))) * 36 + 4
            outlined(ctx, Path(ellipseIn: CGRect(x: -spin, y: -268, width: spin, height: 9)), Color(hex: 0xE0302E), width: 2.5)
            outlined(ctx, Path(ellipseIn: CGRect(x: 0, y: -268, width: spin, height: 9)), Color(hex: 0x2F80ED), width: 2.5)
        case 10: // Chef hat
            for (x, y, r) in [(-24.0, -246.0, 19.0), (24, -246, 19), (0, -262, 24)] {
                outlined(ctx, Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)), .white, width: 4)
            }
            outlined(ctx, Path(roundedRect: CGRect(x: -40, y: -232, width: 80, height: 28), cornerRadius: 6), .white, width: 4)
        case 11: // Tinfoil hat
            let foil = poly([(-46, -204), (-38, -230), (-28, -244), (-20, -262), (-8, -270), (0, -296), (8, -272), (20, -262), (30, -242), (38, -228), (46, -204)])
            outlined(ctx, foil, Color(hex: 0xD3D8DF), width: 4)
            var shine = Path()
            shine.move(to: CGPoint(x: -18, y: -222)); shine.addLine(to: CGPoint(x: -4, y: -262))
            shine.move(to: CGPoint(x: 14, y: -218)); shine.addLine(to: CGPoint(x: 22, y: -244))
            ctx.stroke(shine, with: .color(.white), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        case 12: // Angel halo
            let y = -284 + 3 * sin(time * 2)
            let ring = Path(ellipseIn: CGRect(x: -34, y: y, width: 68, height: 16))
            ctx.stroke(ring, with: .color(ink), lineWidth: 10)
            ctx.stroke(ring, with: .color(Color(hex: 0xFFE38A)), lineWidth: 5)
        case 13: // Beer helmet: hard hat, a can on each side, straws down to the mouth
            for side in [-1.0, 1.0] {
                var straw = Path()
                straw.move(to: CGPoint(x: 56 * side, y: -238))
                straw.addQuadCurve(to: CGPoint(x: 8 * side, y: -158), control: CGPoint(x: 70 * side, y: -160))
                ctx.stroke(straw, with: .color(ink), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                ctx.stroke(straw, with: .color(.white), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                outlined(ctx, Path(roundedRect: CGRect(x: 56 * side - 11, y: -244, width: 22, height: 36), cornerRadius: 5), Color(hex: 0xD33B3B), width: 3.5)
                ctx.fill(Path(CGRect(x: 56 * side - 11, y: -232, width: 22, height: 8)), with: .color(.white))
            }
            classicHat(ctx, 1, color)
        default:
            break
        }
    }

    private static func head(_ ctx: GraphicsContext, look: Look, skin: Color, shirt: Color, blink: Bool, face: Face, time: Double) {
        let hair = Color(hex: Look.hairColors[look.hairColor])
        let hatColor = Color(hex: Look.clothes[look.hatColor])

        if look.top == 1 {
            outlined(ctx, Path(ellipseIn: CGRect(x: -52, y: -238, width: 104, height: 104)), shirt)
        }
        if Self.hairShows(look) || look.hair == 4 {
            switch look.hair {
            case 4: outlined(ctx, Path(roundedRect: CGRect(x: -54, y: -232, width: 108, height: 116), cornerRadius: 44), hair)
            case 3 where Self.hairShows(look): outlined(ctx, Path(ellipseIn: CGRect(x: -66, y: -262, width: 132, height: 124)), hair)
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

        // Hair, then the hat. Party hats, crowns and halos sit on top of the hair.
        if Self.hairShows(look) {
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
        }
        if look.extra == 4 && Self.hairShows(look) {
            outlined(ctx, Path(roundedRect: CGRect(x: -45, y: -216, width: 90, height: 13), cornerRadius: 5), shirt, width: 3.5)
        }
        switch look.hat {
        case 0: break
        case 1, 2, 3: classicHat(ctx, look.hat, hatColor)
        default: fancyHat(ctx, look.hat, hatColor, time: time)
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
            if look.extra == 1 {
                // Gold grill
                ctx.fill(Path(roundedRect: CGRect(x: -11, y: -159, width: 22, height: 5), cornerRadius: 2), with: .color(Color(hex: 0xF5C542)))
            }
        }
        switch look.extra {
        case 2: // Clown nose
            outlined(ctx, Path(ellipseIn: CGRect(x: -9, y: -182, width: 18, height: 18)), Color(hex: 0xE0302E), width: 3)
            ctx.fill(Path(ellipseIn: CGRect(x: -4, y: -178, width: 5, height: 5)), with: .color(.white.opacity(0.7)))
        case 3: // Eye black
            ctx.fill(Path(roundedRect: CGRect(x: -26, y: -176, width: 16, height: 5), cornerRadius: 2), with: .color(ink))
            ctx.fill(Path(roundedRect: CGRect(x: 10, y: -176, width: 16, height: 5), cornerRadius: 2), with: .color(ink))
        case 5: // Diamond earring
            var gem = Path()
            gem.move(to: CGPoint(x: -44, y: -174)); gem.addLine(to: CGPoint(x: -38, y: -167))
            gem.addLine(to: CGPoint(x: -44, y: -158)); gem.addLine(to: CGPoint(x: -50, y: -167)); gem.closeSubpath()
            outlined(ctx, gem, Color(hex: 0xBDF4FF), width: 2)
        default:
            break
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
