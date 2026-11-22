import SwiftUI

private let navy = Color(red: 0.06, green: 0.11, blue: 0.2)
private let mint = Color(red: 0.51, green: 0.87, blue: 0.73)

/// Each phone is either the back-seat camera or the driver's screen.
struct ContentView: View {
    @AppStorage("role") private var role = ""

    var body: some View {
        switch role {
        case "camera": CameraScreen { role = "" }
        case "driver": DriverScreen { role = "" }
        default: RolePicker(role: $role)
        }
    }
}

struct RolePicker: View {
    @Binding var role: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 12) {
                    Image(systemName: "car.side.rear.open").font(.system(size: 34)).foregroundStyle(mint)
                    VStack(alignment: .leading) {
                        Text("Backseat View").font(.largeTitle.bold())
                        Text("See and hear the back seat from the front").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Text("You need two iPhones: an old one that becomes the back-seat camera, and yours. They talk straight to each other, so no Wi-Fi or cell signal is needed.")
                    .font(.callout)
                RoleButton(symbol: "video.fill", title: "This phone is the back-seat camera",
                           detail: "Mount it facing the baby and plug it in.") { role = "camera" }
                RoleButton(symbol: "steeringwheel", title: "This phone is mine (front seat)",
                           detail: "Shows the picture, plays the baby's sound in the car, and puts a baby card on your CarPlay screen.") { role = "driver" }
                Text("Not a medical or safety device. Never leave a child alone in a car, and don't handle your phone while driving.")
                    .font(.caption).foregroundStyle(.secondary)
                StudioCredit().padding(.top, 8)
            }
            .padding()
        }
    }
}

struct RoleButton: View {
    let symbol: String
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: symbol).font(.title2).frame(width: 34).foregroundStyle(mint)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(16)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

// MARK: Back-seat camera phone

struct CameraScreen: View {
    let onSwitch: () -> Void
    @StateObject private var station = CameraStation()
    @State private var darkScreen = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    PicturePanel(image: station.preview, mood: station.running ? station.mood : nil, placeholder: "Tap Start Camera")
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.tooDark && station.running {
                        Text("It's too dark to see much. Sound and crying alerts still work.").font(.footnote).foregroundStyle(.orange)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pairing code").font(.caption).foregroundStyle(.secondary)
                        Text(station.code).font(.system(size: 44, weight: .heavy, design: .rounded)).monospacedDigit()
                        Text("Type this code on your own phone in Backseat View.").font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    Text(station.viewers == 0 ? "Waiting for your phone to connect" : "Connected to your phone")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(station.viewers == 0 ? Color.secondary : mint)
                    if station.running {
                        HStack {
                            Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                            Button { station.useFrontCamera.toggle() } label: { Label("Flip camera", systemImage: "arrow.triangle.2.circlepath.camera") }
                        }
                        .buttonStyle(.bordered)
                        Button { darkScreen = true } label: { Label("Dark screen (saves battery)", systemImage: "moon.fill") }
                            .buttonStyle(.bordered)
                        Button("Stop Camera", role: .destructive) { station.stop() }.buttonStyle(.bordered)
                    } else {
                        Button { Task { await station.start() } } label: { Text("Start Camera").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).controlSize(.large)
                    }
                    Text("Keep Backseat View open on this phone and plug it in. Mount it securely so it can't fly loose.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("This isn't the camera phone") { station.stop(); onSwitch() }.font(.footnote)
                }
                .padding()
            }
            if darkScreen {
                Color.black.ignoresSafeArea()
                    .overlay(Text("Camera is on. Tap to wake.").font(.footnote).foregroundStyle(.white.opacity(0.25)))
                    .onTapGesture { darkScreen = false }
            }
        }
        .statusBarHidden(darkScreen)
        .task { await station.start() }
    }

    private var header: some View {
        HStack {
            Image(systemName: "video.fill").foregroundStyle(mint)
            Text("Back-seat camera").font(.title2.bold())
        }
    }
}

// MARK: Driver's phone

struct DriverScreen: View {
    let onSwitch: () -> Void
    @StateObject private var station = DriverStation()
    @AppStorage("pairCode") private var pairCode = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Image(systemName: "car.side.rear.open").foregroundStyle(mint)
                    Text("Backseat View").font(.title2.bold())
                }
                PicturePanel(image: station.connected ? station.picture : nil,
                             mood: station.running ? station.mood : nil,
                             placeholder: station.running ? station.status : "Start the camera phone, then tap Watch Back Seat")
                if station.running {
                    Text(station.status).font(.footnote).foregroundStyle(.secondary)
                    if station.cameraTooDark && station.connected {
                        Text("It's dark back there, so the picture is hard to see. You can still hear the baby.").font(.footnote).foregroundStyle(.orange)
                    }
                    if station.connected && station.cameraBattery >= 0 && station.cameraBattery < 0.2 {
                        Text("The camera phone's battery is low. Plug it in.").font(.footnote).foregroundStyle(.orange)
                    }
                    if let problem = station.cardProblem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    Button("Stop", role: .destructive) { station.stop() }.buttonStyle(.bordered)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Code from the camera phone").font(.caption).foregroundStyle(.secondary)
                        TextField("4-digit code", text: $pairCode)
                            .keyboardType(.numberPad)
                            .font(.title2.monospacedDigit())
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: pairCode) { _, value in
                                let digits = String(value.filter(\.isNumber).prefix(4))
                                if digits != value { pairCode = digits }
                            }
                    }
                    Button { station.start(code: pairCode) } label: { Text("Watch Back Seat").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(pairCode.count != 4)
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("In the car").font(.headline)
                    HStack {
                        Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                        Slider(value: Binding(get: { Double(station.volume) }, set: { station.volume = Float($0) }), in: 0...1)
                        Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                    }
                    Text("Baby sound volume. It plays through your car speakers and mixes with music and directions.")
                        .font(.caption).foregroundStyle(.secondary)
                    Toggle("Show the picture on the car screen", isOn: Binding(get: { station.showPictureInCar }, set: { station.showPictureInCar = $0 }))
                    Toggle("Chime when the baby cries", isOn: Binding(get: { station.cryAlerts }, set: { station.cryAlerts = $0 }))
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 6) {
                    Label("Car screen", systemImage: "carplay").font(.headline)
                    Text("With iOS 26, a Backseat View card appears on your CarPlay Dashboard while you're watching. It shows a small picture that refreshes every few seconds and says Quiet, Moving or Crying.")
                        .font(.subheadline)
                    Text("Don't see it? On your phone go to Settings > General > CarPlay > your car and make sure Live Activities is on. Lock your phone and leave it locked. The card and sound keep going.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                Text("Glance only, like a mirror. Not a medical or safety device. Never leave a child alone in a car.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("This isn't my phone, it's the camera") { station.stop(); onSwitch() }.font(.footnote)
                StudioCredit().padding(.top, 4)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

struct PicturePanel: View {
    let image: UIImage?
    let mood: BabyMood?
    let placeholder: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 18).fill(navy)
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "figure.child").font(.system(size: 60)).foregroundStyle(mint)
                    Text(placeholder).font(.callout).foregroundStyle(.white.opacity(0.8))
                        .multilineTextAlignment(.center).padding(.horizontal)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let mood {
                Label(mood.title, systemImage: mood.symbol)
                    .font(.subheadline.weight(.bold))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(.black.opacity(0.55), in: Capsule())
                    .foregroundStyle(.white)
                    .padding(10)
            }
        }
        .frame(height: 320)
        .accessibilityLabel("Back seat picture")
    }
}

/// "© <year> Weltzcraft Studios" copyright line at the bottom of the app; the name links to the studio site.
struct StudioCredit: View {
    var body: some View {
        HStack(spacing: 4) {
            Text("© \(String(Calendar.current.component(.year, from: Date())))")
            Link(destination: URL(string: "https://weltzcraft.com")!) {
                Text("Weltzcraft Studios").fontWeight(.semibold)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .tint(.secondary)
        .frame(maxWidth: .infinity)
    }
}
