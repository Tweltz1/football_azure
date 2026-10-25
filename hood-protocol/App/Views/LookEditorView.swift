import SwiftUI

/// Edit appearance: a spinning 3D preview over pickers for every part of the look.
struct LookEditorView: View {
    @Binding var code: String
    @Environment(\.dismiss) private var dismiss
    @State private var look = Look()
    @ObservedObject private var account = Account.shared

    private var stats: Stats { account.stats }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CartoonCharacterView(look: look)
                    .frame(height: 240)
                    .frame(maxWidth: .infinity)
                    .background(Color(hex: 0xE2BD8F))
                Form {
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(0..<Crew.count, id: \.self) { index in
                                    Button { look = Look.crew(index) } label: {
                                        VStack(spacing: 3) {
                                            LookPortrait(look: Look.crew(index), size: 52)
                                            Text(Crew.names[index]).font(.caption2)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Start from the Hood crew")
                    }
                    Section("Skin") { swatches(Look.skins, selection: $look.skin, part: nil) }
                    Section("Hair") {
                        options(Look.hairStyles, selection: $look.hair, part: .hair)
                        swatches(Look.hairColors, selection: $look.hairColor, part: .hairColor)
                    }
                    Section("Hat") {
                        options(Look.hats, selection: $look.hat, part: .hat)
                        if look.hat != 0 { swatches(Look.clothes, selection: $look.hatColor, part: .clothesColor) }
                    }
                    Section("Top") {
                        options(Look.tops, selection: $look.top, part: .top)
                        swatches(Look.clothes, selection: $look.topColor, part: .clothesColor)
                    }
                    Section("Face") {
                        options(Look.facialHair, selection: $look.facial, part: nil)
                        Toggle("Shades", isOn: $look.shades)
                    }
                    Section("Pants") {
                        swatches(Look.pantsColors, selection: $look.pants, part: nil)
                        Toggle("Shorts", isOn: $look.shorts)
                    }
                    Section("Shoes") { swatches(Look.shoeColors, selection: $look.shoes, part: nil) }
                    Section {
                        extra("Glasses", isOn: $look.glasses, part: .glasses)
                        extra("Gold chain", isOn: $look.chain, part: .chain)
                    } header: {
                        Text("Extras")
                    } footer: {
                        Text("Locked items unlock as you play more games. You've played \(stats.games) and won \(stats.wins).")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .background(Theme.background)
            .navigationTitle("Edit appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { look = Unlocks.sanitize(.random(), stats: stats) } label: { Label("Shuffle", systemImage: "shuffle") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        code = look.code
                        dismiss()
                    }
                    .bold()
                }
            }
        }
        .onAppear { look = Look(code: code) }
    }

    private func locked(_ part: Unlocks.Part?, _ index: Int) -> Unlocks.Requirement? {
        guard let part, let requirement = Unlocks.requirement(part, index), !requirement.isMet(by: stats) else { return nil }
        return requirement
    }

    private func extra(_ title: String, isOn: Binding<Bool>, part: Unlocks.Part) -> some View {
        let requirement = locked(part, 1)
        return Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let requirement {
                    Label(requirement.text, systemImage: "lock.fill").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .disabled(requirement != nil)
    }

    private func swatches(_ colors: [UInt32], selection: Binding<Int>, part: Unlocks.Part?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(colors.indices, id: \.self) { index in
                    let requirement = locked(part, index)
                    Button { selection.wrappedValue = index } label: {
                        VStack(spacing: 3) {
                            Circle()
                                .fill(Color(hex: colors[index]))
                                .frame(width: 34, height: 34)
                                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                                .overlay(Circle().stroke(Theme.accent, lineWidth: selection.wrappedValue == index ? 3 : 0).padding(-4))
                                .overlay {
                                    if requirement != nil {
                                        Image(systemName: "lock.fill").font(.caption).foregroundStyle(.white)
                                            .padding(5).background(.black.opacity(0.55), in: Circle())
                                    }
                                }
                            if let requirement {
                                Text(requirement.text).font(.system(size: 9)).foregroundStyle(.secondary).fixedSize()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(requirement != nil)
                }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 4)
        }
    }

    private func options(_ names: [String], selection: Binding<Int>, part: Unlocks.Part?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(names.indices, id: \.self) { index in
                    let requirement = locked(part, index)
                    Button { selection.wrappedValue = index } label: {
                        VStack(spacing: 1) {
                            Label {
                                Text(names[index])
                            } icon: {
                                if requirement != nil { Image(systemName: "lock.fill") }
                            }
                            .font(.subheadline.bold())
                            if let requirement {
                                Text(requirement.text).font(.system(size: 9))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(selection.wrappedValue == index ? Theme.accent : Theme.panel2, in: Capsule())
                        .foregroundStyle(requirement == nil ? Color.white : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    .disabled(requirement != nil)
                }
            }
        }
    }
}
