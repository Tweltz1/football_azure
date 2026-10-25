import SwiftUI

/// The bright cartoon basement, drawn like the Hood League art. Tap the room to move your
/// character, or tap the TV, the couch, the coffee table or the beer pong table to join in.
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
                    RoomArt.drawBack(ctx, night: night, time: t)
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
                HStack(spacing: 6) {
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
            items.append((person.position(at: t).y + 0.5, .person(person)))
        }
        for (y, draw) in RoomArt.furniture(time: t) {
            items.append((y, .furniture(y, draw)))
        }
        items.sort { $0.0 < $1.0 }
        for (_, item) in items {
            switch item {
            case let .furniture(_, draw):
                draw(ctx)
            case let .person(person):
                let point = person.position(at: t)
                let scale = HangoutModel.scale(at: point.y)
                let atDoor = person.guest.dimmed && !person.isWalking(at: t)
                if person.guest.highlighted && !person.guest.dimmed {
                    let ring = CGRect(x: point.x - 62 * scale, y: point.y - 14 * scale, width: 124 * scale, height: 28 * scale)
                    ctx.stroke(Path(ellipseIn: ring), with: .color(Theme.accent.opacity(0.6 + 0.4 * sin(t * 5))), lineWidth: 5)
                }
                if person.guest.id == model.me {
                    var marker = Path()
                    let top = point.y - 300 * scale - (person.guest.badge == nil ? 0 : 26)
                    marker.move(to: CGPoint(x: point.x - 10, y: top - 14))
                    marker.addLine(to: CGPoint(x: point.x + 10, y: top - 14))
                    marker.addLine(to: CGPoint(x: point.x, y: top))
                    marker.closeSubpath()
                    ctx.fill(marker, with: .color(Theme.warning))
                }
                CartoonPerson.draw(ctx, look: person.guest.look, at: point, scale: scale,
                                   pose: model.pose(for: person, at: t), time: t, seed: person.seed, dimmed: person.guest.dimmed)
                if !atDoor {
                    label(ctx, person.guest, at: CGPoint(x: point.x, y: point.y - 272 * scale))
                }
            }
        }

        // Ping pong balls in the air
        for ball in model.balls {
            let k = (t - ball.start) / 0.75
            guard k >= 0, k <= 1.3 else { continue }
            let c = min(1, k)
            let x = ball.from.x + (ball.to.x - ball.from.x) * c
            let y = ball.from.y + (ball.to.y - ball.from.y) * c - 120 * sin(.pi * c) + (k > 1 ? -18 * sin((k - 1) / 0.3 * .pi) : 0)
            let rect = CGRect(x: x - 6, y: y - 6, width: 12, height: 12)
            ctx.fill(Path(ellipseIn: rect), with: .color(.white))
            ctx.stroke(Path(ellipseIn: rect), with: .color(CartoonPerson.ink), lineWidth: 2)
        }
        // Smoke clouds after a rip
        for puff in model.puffs {
            let k = (t - puff.start) / 2.5
            guard k >= 0, k <= 1 else { continue }
            for i in 0..<3 {
                let r = 10 + 26 * k + Double(i) * 6
                let center = CGPoint(x: puff.origin.x + Double(i - 1) * 14 + 20 * k, y: puff.origin.y - 90 * k - Double(i) * 10)
                ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                         with: .color(Color(white: 0.92).opacity(0.75 * (1 - k))))
            }
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
