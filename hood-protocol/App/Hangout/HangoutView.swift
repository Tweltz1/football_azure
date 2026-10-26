import SwiftUI

/// The bright cartoon basement, drawn like the Hood League art. Tap the room to move your
/// character, or tap the TV, couch, keg, bong, flip cup or beer pong table to join in.
struct HangoutView: View {
    var guests: [HangoutGuest]
    var night: Double = 0
    /// Your guest id, or nil when you only watch (the home screen crew).
    var me: Int? = nil
    var showButtons = true

    @StateObject private var model = HangoutModel()

    var body: some View {
        VStack(spacing: 8) {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { timeline in
                let t = timeline.date.timeIntervalSinceReferenceDate
                Canvas { context, size in
                    let scale = size.width / HangoutModel.size.width
                    var ctx = context
                    ctx.scaleBy(x: scale, y: scale)
                    RoomArt.drawBack(ctx, night: night, time: t, gamers: model.gamers(at: t))
                    drawScene(ctx, time: t)
                }
            }
            .aspectRatio(HangoutModel.size.width / HangoutModel.size.height, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { value in tapped(value.location) })
            .background(GeometryReader { geo in Color.clear.preference(key: WidthKey.self, value: geo.size.width) })
            .onPreferenceChange(WidthKey.self) { width = $0 }

            if me != nil && showButtons {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                    ForEach(Activity.allCases, id: \.self) { activity in
                        Button {
                            if let me { model.go(me, to: activity) }
                        } label: {
                            VStack(spacing: 2) {
                                Image(systemName: activity.symbol).font(.system(size: 16, weight: .bold))
                                Text(activity.title).font(.system(size: 10, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 7)
                            .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .onAppear { model.update(guests: guests, me: me) }
        .onChange(of: guests) { _, new in model.update(guests: new, me: me) }
    }

    @State private var width: CGFloat = 1

    private func tapped(_ location: CGPoint) {
        let scale = width / HangoutModel.size.width
        guard scale > 0 else { return }
        model.tap(CGPoint(x: location.x / scale, y: location.y / scale))
    }

    private func drawScene(_ ctx: GraphicsContext, time t: Double) {
        // Furniture and people are drawn back to front by where they touch the floor.
        enum Item { case person(HangoutModel.Person), furniture(CGFloat, (GraphicsContext) -> Void) }
        var items: [(CGFloat, Item)] = []
        for person in model.people.values {
            // Whoever's on the keg is drawn over it, hands on the rim
            let onKeg = person.spot == HangoutModel.kegSpots[0] && !person.isWalking(at: t)
            items.append((onKeg ? 479 : person.position(at: t).y + 0.5, .person(person)))
        }
        for (y, draw) in RoomArt.furniture(model, time: t) {
            items.append((y, .furniture(y, draw)))
        }
        items.sort { $0.0 < $1.0 }
        for (_, item) in items {
            switch item {
            case let .furniture(_, draw):
                draw(ctx)
            case let .person(person):
                drawPerson(ctx, person, time: t)
            }
        }

        // Ping pong balls in the air, and the splash when one goes in
        for ball in model.balls {
            guard let point = ball.position(at: t) else { continue }
            let rect = CGRect(x: point.x - 6, y: point.y - 6, width: 12, height: 12)
            ctx.fill(Path(ellipseIn: rect), with: .color(.white))
            ctx.stroke(Path(ellipseIn: rect), with: .color(CartoonPerson.ink), lineWidth: 2)
        }
        for splash in model.splashes {
            let k = (t - splash.start) / 0.6
            guard k >= 0, k <= 1 else { continue }
            for i in 0..<5 {
                let dx = (Double(i) - 2) * 7 * k
                let dy = -26 * sin(.pi * min(1, k * 1.3)) - Double(i % 2) * 6
                ctx.fill(Path(ellipseIn: CGRect(x: splash.point.x + dx - 2.5, y: splash.point.y + dy - 2.5, width: 5, height: 5)),
                         with: .color(Color(hex: 0xF5D36A).opacity(1 - k)))
            }
        }
        // Smoke clouds after a rip
        for puff in model.puffs {
            let k = (t - puff.start) / (2.2 + puff.size)
            guard k >= 0, k <= 1 else { continue }
            let count = puff.size > 1 ? 6 : 3
            for i in 0..<count {
                let r = (10 + 26 * k + Double(i) * 5) * puff.size
                let spread = Double(i - count / 2) * 12 * puff.size * (0.4 + k)
                let center = CGPoint(x: puff.origin.x + spread + 24 * k, y: puff.origin.y - 110 * k * puff.size - Double(i % 3) * 10)
                ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                         with: .color(Color(white: 0.94).opacity(0.7 * (1 - k))))
            }
        }
    }

    private func drawPerson(_ ctx: GraphicsContext, _ person: HangoutModel.Person, time t: Double) {
        let point = person.position(at: t)
        let scale = HangoutModel.scale(at: point.y)
        let atDoor = person.guest.dimmed && !person.isWalking(at: t)
        let pose = model.pose(for: person, at: t)
        var over = 0.0
        var seconds = 0.0
        if case let .kegStand(s) = pose {
            seconds = s
            over = HangoutModel.kegFlip(s)
        }
        if over > 0 {
            // Flip up onto the keg: hands stay on the keg while the body swings over the top.
            let hands = CGPoint(x: point.x, y: point.y - 205 * scale)
            let top = HangoutModel.kegTop
            let pivot = CGPoint(x: hands.x + (top.x - hands.x) * over, y: hands.y + (top.y - 20 - hands.y) * over)
            var flipped = ctx
            flipped.translateBy(x: pivot.x, y: pivot.y)
            flipped.rotate(by: .radians(.pi * over))
            CartoonPerson.draw(flipped, look: person.guest.look, at: CGPoint(x: 0, y: 205 * scale), scale: scale,
                               pose: pose, time: t, seed: person.seed)
            guard over == 1 else { return }
            // The tap hose runs up into their mouth, and everyone counts
            let mouth = CGPoint(x: pivot.x, y: pivot.y - 47 * scale)
            var hose = Path()
            hose.move(to: CGPoint(x: top.x + 4, y: top.y - 10))
            hose.addQuadCurve(to: mouth, control: CGPoint(x: top.x + 34, y: (top.y + mouth.y) / 2))
            ctx.stroke(hose, with: .color(CartoonPerson.ink), style: StrokeStyle(lineWidth: 6, lineCap: .round))
            ctx.stroke(hose, with: .color(Color(hex: 0xE8E2D2)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
            let count = Int(seconds - 1.4) + 1
            let text = ctx.resolve(Text("\(count)!").font(.system(size: 30, weight: .black)).foregroundColor(Theme.warning))
            ctx.draw(text, at: CGPoint(x: pivot.x + 70, y: pivot.y - 170 * scale))
            return
        }
        if person.guest.highlighted && !person.guest.dimmed {
            let ring = CGRect(x: point.x - 62 * scale, y: point.y - 14 * scale, width: 124 * scale, height: 28 * scale)
            ctx.stroke(Path(ellipseIn: ring), with: .color(Theme.accent.opacity(0.6 + 0.4 * sin(t * 5))), lineWidth: 5)
        }
        let raised: CGFloat
        switch pose {
        case .holdLegs, .cheer: raised = 40
        case .sit, .bong: raised = 30
        default: raised = 0
        }
        if person.guest.id == model.me {
            var marker = Path()
            let top = point.y - 300 * scale - (person.guest.badge == nil ? 0 : 26) - raised * scale
            marker.move(to: CGPoint(x: point.x - 10, y: top - 14))
            marker.addLine(to: CGPoint(x: point.x + 10, y: top - 14))
            marker.addLine(to: CGPoint(x: point.x, y: top))
            marker.closeSubpath()
            ctx.fill(marker, with: .color(Theme.warning))
        }
        CartoonPerson.draw(ctx, look: person.guest.look, at: point, scale: scale,
                           pose: pose, time: t, seed: person.seed, dimmed: person.guest.dimmed)
        if !atDoor {
            label(ctx, person.guest, at: CGPoint(x: point.x, y: point.y - 272 * scale - raised * scale))
        }
    }

    private func label(_ ctx: GraphicsContext, _ guest: HangoutGuest, at point: CGPoint) {
        let name = ctx.resolve(Text(guest.id == model.me ? "You" : guest.name).font(.system(size: 17, weight: .heavy)).foregroundColor(.white))
        let size = name.measure(in: CGSize(width: 300, height: 40))
        let rect = CGRect(x: point.x - size.width / 2 - 8, y: point.y - size.height / 2 - 2, width: size.width + 16, height: size.height + 4)
        ctx.fill(Path(roundedRect: rect, cornerRadius: rect.height / 2), with: .color(.black.opacity(0.55)))
        ctx.draw(name, at: point)
        if let badge = guest.badge {
            let text = ctx.resolve(Text(badge.uppercased()).font(.system(size: 14, weight: .black)).foregroundColor(.white))
            let badgeSize = text.measure(in: CGSize(width: 300, height: 40))
            let center = CGPoint(x: point.x, y: rect.minY - badgeSize.height / 2 - 6)
            let pill = CGRect(x: center.x - badgeSize.width / 2 - 8, y: center.y - badgeSize.height / 2 - 2,
                              width: badgeSize.width + 16, height: badgeSize.height + 4)
            ctx.fill(Path(roundedRect: pill, cornerRadius: pill.height / 2), with: .color(Theme.accent))
            ctx.draw(text, at: center)
        }
    }
}

private struct WidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 1
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
