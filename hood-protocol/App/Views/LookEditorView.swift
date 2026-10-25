import SwiftUI

/// Edit appearance: a spinning 3D preview over pickers for every part of the look.
struct LookEditorView: View {
    @Binding var code: String
    @Environment(\.dismiss) private var dismiss
    @State private var look = Look()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                CharacterPreview(look: look)
                    .frame(height: 260)
                Form {
                    Section("Skin") { swatches(Look.skins, selection: $look.skin) }
                    Section("Hair") {
                        options(Look.hairStyles, selection: $look.hair)
                        swatches(Look.hairColors, selection: $look.hairColor)
                    }
                    Section("Hat") {
                        options(Look.hats, selection: $look.hat)
                        if look.hat != 0 { swatches(Look.clothes, selection: $look.hatColor) }
                    }
                    Section("Top") {
                        options(Look.tops, selection: $look.top)
                        swatches(Look.clothes, selection: $look.topColor)
                    }
                    Section("Pants") { swatches(Look.pantsColors, selection: $look.pants) }
                    Section("Shoes") { swatches(Look.shoeColors, selection: $look.shoes) }
                    Section("Extras") {
                        Toggle("Glasses", isOn: $look.glasses)
                        Toggle("Gold chain", isOn: $look.chain)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .background(Theme.background)
            .navigationTitle("Edit appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { look = .random() } label: { Label("Shuffle", systemImage: "shuffle") }
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

    private func swatches(_ colors: [UInt32], selection: Binding<Int>) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(colors.indices, id: \.self) { index in
                    Button { selection.wrappedValue = index } label: {
                        Circle()
                            .fill(Color(hex: colors[index]))
                            .frame(width: 34, height: 34)
                            .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                            .overlay(Circle().stroke(Theme.accent, lineWidth: selection.wrappedValue == index ? 3 : 0).padding(-4))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 4)
        }
    }

    private func options(_ names: [String], selection: Binding<Int>) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(names.indices, id: \.self) { index in
                    Button { selection.wrappedValue = index } label: {
                        Text(names[index])
                            .font(.subheadline.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(selection.wrappedValue == index ? Theme.accent : Theme.panel2, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
