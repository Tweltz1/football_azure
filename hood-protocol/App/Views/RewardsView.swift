import SwiftUI

/// Every unlockable look, grouped by kind, with a preview on you and how close you are.
struct RewardsView: View {
    @Binding var code: String
    @ObservedObject private var account = Account.shared

    private static let groups: [(title: String, parts: [Unlocks.Part])] = [
        ("Hairstyles", [.hair]),
        ("Hair colors", [.hairColor]),
        ("Hats", [.hat]),
        ("Tops", [.top]),
        ("Outfit colors", [.clothesColor]),
        ("Pants", [.pantsColor]),
        ("Shoes", [.shoeColor]),
        ("Face and bling", [.extra, .glasses, .chain]),
    ]

    private var stats: Stats { account.stats }
    private var unlockedCount: Int { Unlocks.items.filter { $0.requirement.isMet(by: stats) }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                ForEach(Self.groups, id: \.title) { group in
                    let items = Unlocks.items.filter { group.parts.contains($0.part) }
                        .sorted { weight($0) < weight($1) }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(group.title.uppercased())
                            .font(.caption.weight(.bold))
                            .foregroundStyle(Theme.accentText)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                            ForEach(items, id: \.name) { card($0) }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background.ignoresSafeArea())
        .navigationTitle("Rewards")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(unlockedCount) of \(Unlocks.items.count) unlocked").font(.title3.bold())
            ProgressView(value: Double(unlockedCount), total: Double(max(Unlocks.items.count, 1)))
                .tint(Theme.secure)
            Text("Tap anything you've unlocked to wear it.").font(.caption).foregroundStyle(.secondary)
        }
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func card(_ item: Unlocks.Item) -> some View {
        let unlocked = item.requirement.isMet(by: stats)
        let progress = item.requirement.progress(stats)
        let preview = wearing(item)
        let worn = Look(code: code).code == preview.code
        return Button {
            if unlocked { code = Unlocks.sanitize(preview, stats: stats).code }
        } label: {
            VStack(spacing: 6) {
                Canvas { context, canvas in
                    let scale = canvas.height / 300
                    CartoonPerson.draw(context, look: preview, at: CGPoint(x: canvas.width / 2, y: canvas.height - 14 * scale),
                                       scale: scale, pose: .stand, time: 0)
                }
                .frame(height: 150)
                .frame(maxWidth: .infinity)
                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 10))
                .saturation(unlocked ? 1 : 0.15)
                .overlay(alignment: .topTrailing) {
                    Image(systemName: unlocked ? (worn ? "checkmark.circle.fill" : "checkmark.seal.fill") : "lock.fill")
                        .foregroundStyle(unlocked ? Theme.secure : .secondary)
                        .padding(6)
                }
                Text(item.name).font(.subheadline.bold()).lineLimit(1).minimumScaleFactor(0.7)
                Text(unlocked ? (worn ? "Wearing" : "Unlocked") : item.requirement.text)
                    .font(.caption2).foregroundStyle(unlocked ? Theme.secure : .secondary)
                    .lineLimit(2).multilineTextAlignment(.center)
                if !unlocked {
                    ProgressView(value: Double(progress.have), total: Double(max(progress.need, 1)))
                        .tint(Theme.warning)
                    Text("\(progress.have) / \(progress.need)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            .padding(8)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    /// Unlocked first, then whatever is closest.
    private func weight(_ item: Unlocks.Item) -> Double {
        let progress = item.requirement.progress(stats)
        if item.requirement.isMet(by: stats) { return -1 }
        return 1 - Double(progress.have) / Double(max(progress.need, 1)) + Double(progress.need) / 1000
    }

    /// Your current look with this item put on.
    private func wearing(_ item: Unlocks.Item) -> Look {
        var look = Look(code: code)
        switch item.part {
        case .hair: look.hair = item.index; look.hat = 0
        case .hairColor: look.hairColor = item.index; if look.hair == 0 { look.hair = 1 }; look.hat = 0
        case .hat: look.hat = item.index; if look.hatColor == 0 { look.hatColor = look.topColor }
        case .top: look.top = item.index
        case .clothesColor: look.topColor = item.index
        case .pantsColor: look.pants = item.index; look.shorts = false
        case .shoeColor: look.shoes = item.index
        case .glasses: look.glasses = true; look.shades = false
        case .chain: look.chain = true
        case .extra: look.extra = item.index
        }
        return look
    }
}
