import SwiftUI

private let navy = Color(red: 0.06, green: 0.11, blue: 0.2)
private let mint = Color(red: 0.51, green: 0.87, blue: 0.73)
private let peach = Color(red: 1.0, green: 0.62, blue: 0.52)
private let sky = Color(red: 0.55, green: 0.72, blue: 1.0)
private let sun = Color(red: 1.0, green: 0.82, blue: 0.45)

/// Start menu: four modes. The app reopens in the last mode used; each mode has a back button.
struct ContentView: View {
    @AppStorage("mode") private var mode = ""

    var body: some View {
        NavigationStack {
            switch mode {
            case "camera": CameraScreen { mode = "" }
            case "babyphone": BabyPhoneScreen { mode = "" }
            case "listen": ListenScreen { mode = "" }
            case "driver": DriverScreen { mode = "" }
            default: StartScreen { mode = $0 }
            }
        }
        .tint(mint)
    }
}

// MARK: Start menu

struct StartScreen: View {
    let pick: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Hi there 👋").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                    Text("What is this phone for?").font(.largeTitle.bold())
                }
                .padding(.top, 8)

                ModeGroup(title: "At home", symbol: "house.fill") {
                    ModeCard(symbol: "ear.fill", color: mint, title: "Baby phone",
                             detail: "Stays by the crib. Listens, and can show the baby on camera.") { pick("babyphone") }
                    ModeCard(symbol: "headphones", color: sky, title: "Parent phone",
                             detail: "Hear and see the baby. Get alerts for crying, fussing and moving.") { pick("listen") }
                }

                ModeGroup(title: "In the car", symbol: "car.fill") {
                    ModeCard(symbol: "car.side.rear.open", color: sun, title: "Watch the back seat",
                             detail: "Driver's phone. Baby card on CarPlay and the Lock Screen.") { pick("driver") }
                    ModeCard(symbol: "video.fill", color: peach, title: "Back-seat camera",
                             detail: "An old iPhone or iPad mounted facing the baby.") { pick("camera") }
                }

                Text("Tip: put Stork View on both phones. Each one picks its job here.")
                    .font(.footnote).foregroundStyle(.secondary)
                StudioCredit().padding(.top, 4)
            }
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private struct ModeGroup<Content: View>: View {
        let title: String
        let symbol: String
        @ViewBuilder let content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                Label(title, systemImage: symbol).font(.headline).foregroundStyle(.secondary)
                content
            }
        }
    }
}

struct ModeCard: View {
    let symbol: String
    let color: Color
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(navy)
                    .frame(width: 54, height: 54)
                    .background(color, in: RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    Text(detail).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
    }
}

/// Toolbar: "Menu" back button on the left, optional gear on the right.
private struct ModeToolbar: ViewModifier {
    let title: String
    let back: () -> Void
    var settings: (() -> Void)?

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: back) { Label("Menu", systemImage: "chevron.left") }
                        .labelStyle(.titleAndIcon)
                }
                if let settings {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: settings) { Image(systemName: "gearshape.fill") }
                            .accessibilityLabel("Settings")
                    }
                }
            }
    }
}

private extension View {
    func modeToolbar(_ title: String, back: @escaping () -> Void, settings: (() -> Void)? = nil) -> some View {
        modifier(ModeToolbar(title: title, back: back, settings: settings))
    }

    func card() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}

/// Big pairing code shown on the phone that is sending.
struct CodeCard: View {
    let code: String
    let hint: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Pairing code").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(code.map { String($0) }.joined(separator: " "))
                .font(.system(size: 44, weight: .heavy, design: .rounded)).monospacedDigit()
            Text(hint).font(.footnote).foregroundStyle(.secondary)
        }
        .card()
    }
}

/// Four-digit code entry on the phone that is receiving.
struct CodeEntry: View {
    let label: String
    @Binding var code: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TextField("4-digit code", text: $code)
                .keyboardType(.numberPad)
                .font(.title.monospacedDigit().weight(.bold))
                .multilineTextAlignment(.center)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                .onChange(of: code) { _, value in
                    let digits = String(value.filter(\.isNumber).prefix(4))
                    if digits != value { code = digits }
                }
        }
    }
}

struct StatusPill: View {
    let text: String
    let good: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(good ? mint : Color.secondary).frame(width: 8, height: 8)
            Text(text).font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(.thinMaterial, in: Capsule())
    }
}

struct BigButton: View {
    let title: String
    var symbol: String?
    var destructive = false
    let action: () -> Void

    var body: some View {
        Button(role: destructive ? .destructive : nil, action: action) {
            Label { Text(title) } icon: { if let symbol { Image(systemName: symbol) } }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(destructive ? .red.opacity(0.85) : mint)
        .foregroundStyle(destructive ? .white : navy)
        .controlSize(.large)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct DarkScreen: View {
    let text: String
    let wake: () -> Void

    var body: some View {
        Color.black.ignoresSafeArea()
            .overlay(Text(text).font(.footnote).foregroundStyle(.white.opacity(0.25)))
            .onTapGesture(perform: wake)
    }
}

// MARK: Home: the baby phone

struct BabyPhoneScreen: View {
    let back: () -> Void
    @StateObject private var station = CameraStation(home: true)
    @State private var darkScreen = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if station.audioOnly {
                        SoundPanel(mood: station.running ? station.mood : nil,
                                   level: station.running ? station.level : 0,
                                   caption: station.running ? "Listening for the baby" : "Tap Start to begin")
                    } else {
                        PicturePanel(image: station.preview, mood: station.running ? station.mood : nil, placeholder: "Tap Start to begin")
                    }
                    StatusPill(text: station.viewers == 0 ? "Waiting for the parent phone"
                               : station.viewers == 1 ? "Parent phone connected" : "\(station.viewers) parent phones connected",
                               good: station.viewers > 0)
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if !station.audioOnly && station.tooDark && station.running {
                        Text("It's too dark for the camera. Sound alerts still work. A small night light helps.")
                            .font(.footnote).foregroundStyle(.orange)
                    }

                    if station.running {
                        BigButton(title: "Dark screen", symbol: "moon.fill") { darkScreen = true }
                    } else {
                        BigButton(title: "Start", symbol: "play.fill") { Task { await station.start() } }
                    }

                    CodeCard(code: station.code, hint: "On the parent phone, pick Parent phone and type this code.")

                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(isOn: Binding(get: { !station.audioOnly }, set: { on in Task { await station.setVideo(on) } })) {
                            Label("Camera", systemImage: "video.fill")
                        }
                        if !station.audioOnly && station.running {
                            HStack {
                                Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                                Spacer()
                                Button { station.useFrontCamera.toggle() } label: { Label("Flip", systemImage: "arrow.triangle.2.circlepath.camera") }
                            }
                            .font(.subheadline.weight(.semibold))
                        }
                        Text(station.audioOnly
                             ? "Sound only. You can lock this phone and it keeps listening."
                             : "With the camera on, keep this phone open and use Dark screen. If it locks, the picture pauses but sound keeps going.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .card()

                    DisclosureGroup("Tips") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("• Put this phone near the crib, out of the baby's reach, and plug it in.")
                            Text("• Both phones need the same Wi-Fi, or to be close enough for AirDrop.")
                            Text("• Don't swipe Stork View closed.")
                        }
                        .font(.footnote).foregroundStyle(.secondary)
                        .padding(.top, 6)
                    }
                    .card()

                    if station.running {
                        Button("Stop", role: .destructive) { station.stop() }
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding()
            }
            if darkScreen {
                DarkScreen(text: station.audioOnly ? "Listening. Tap to wake." : "Camera and sound on. Tap to wake.") { darkScreen = false }
            }
        }
        .statusBarHidden(darkScreen)
        .toolbar(darkScreen ? .hidden : .visible, for: .navigationBar)
        .modeToolbar("Baby phone", back: { station.stop(); back() })
        .task { await station.start() }
    }
}

// MARK: Home: the parent phone

struct ListenScreen: View {
    let back: () -> Void
    @StateObject private var station = DriverStation(home: true)
    @AppStorage("homePairCode") private var pairCode = ""
    @State private var showSettings = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if station.connected, station.picture != nil {
                    PicturePanel(image: station.picture, mood: station.mood, placeholder: "")
                } else {
                    SoundPanel(mood: station.running ? station.mood : nil, level: nil,
                               caption: !station.running ? "Start the baby phone, then tap Listen"
                               : !station.connected ? station.status
                               : station.hearing ? "You're hearing the baby's room" : "Quiet. Sound comes on when there's a noise.")
                }

                if station.running {
                    StatusPill(text: station.connected ? (station.hearing ? "Hearing the baby" : "Connected · quiet") : "Connecting…",
                               good: station.connected)
                    if station.picturePaused {
                        Text("The picture paused, but you can still hear the baby. Open Stork View on the baby phone and use Dark screen instead of locking it.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                    if station.connected && station.cameraTooDark && station.picture != nil {
                        Text("It's dark in the baby's room, so the picture is hard to see.").font(.footnote).foregroundStyle(.orange)
                    }
                    if station.connected && station.cameraBattery >= 0 && station.cameraBattery < 0.2 {
                        Text("The baby phone's battery is low. Plug it in.").font(.footnote).foregroundStyle(.orange)
                    }
                    if let problem = station.cardProblem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.notificationsOff {
                        Text("Notifications are off, so you'll only get the Lock Screen card chime. Turn them on in Settings > Notifications > Stork View.")
                            .font(.footnote).foregroundStyle(.orange)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                            Slider(value: Binding(get: { Double(station.volume) }, set: { station.volume = Float($0) }), in: 0...1)
                            Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                        }
                        Picker("Hear the baby", selection: Binding(get: { station.soundMode }, set: { station.soundMode = $0 })) {
                            Text("Only on noise").tag(DriverStation.SoundMode.noiseOnly)
                            Text("All the time").tag(DriverStation.SoundMode.always)
                        }
                        .pickerStyle(.segmented)
                    }
                    .card()

                    HStack {
                        if station.picture != nil {
                            Button { station.turns += 1 } label: { Label("Rotate", systemImage: "rotate.right") }
                                .buttonStyle(.bordered)
                        }
                        Spacer()
                        Button("Stop", role: .destructive) { station.stop() }.buttonStyle(.bordered)
                    }
                } else {
                    CodeEntry(label: "Code shown on the baby phone", code: $pairCode)
                    BigButton(title: "Listen", symbol: "headphones") { station.start(code: pairCode) }
                        .disabled(pairCode.count != 4)
                        .opacity(pairCode.count == 4 ? 1 : 0.5)
                    Text("Lock this phone any time. A Baby's room card stays on your Lock Screen, and alerts come through.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .modeToolbar("Parent phone", back: { station.stop(); back() }, settings: { showSettings = true })
        .sheet(isPresented: $showSettings) { ListenSettings(station: station) }
    }
}

struct ListenSettings: View {
    @ObservedObject var station: DriverStation
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Hear the baby", selection: Binding(get: { station.soundMode }, set: { station.soundMode = $0 })) {
                        ForEach(DriverStation.SoundMode.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    Picker("Pick up", selection: Binding(get: { station.sensitivity }, set: { station.sensitivity = $0 })) {
                        ForEach(SoundGate.Sensitivity.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                } header: { Text("Sound") } footer: {
                    Text("\"Only when there's a noise\" stays silent until the baby makes a sound, then plays it live (with the first moment kept) for a few seconds.")
                }
                Section {
                    Toggle("Crying", isOn: Binding(get: { station.cryAlerts }, set: { station.cryAlerts = $0 }))
                    Toggle("Fussing", isOn: Binding(get: { station.fussAlerts }, set: { station.fussAlerts = $0 }))
                    Toggle("Moving (camera on)", isOn: Binding(get: { station.motionAlerts }, set: { station.motionAlerts = $0 }))
                    Toggle("Any sound", isOn: Binding(get: { station.noiseAlerts }, set: { station.noiseAlerts = $0 }))
                } header: { Text("Notify me when the baby is…") } footer: {
                    Text("Fussing means little sounds that keep coming back, not one bump. You always get a notification if the baby phone disconnects.")
                }
                Section {
                    Text("Not a medical or safety device. Check on your baby in person.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

/// Big status panel for the sound-only monitor, with an optional live loudness bar.
struct SoundPanel: View {
    let mood: BabyMood?
    let level: Float?
    let caption: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: mood?.symbol ?? "ear")
                .font(.system(size: 56))
                .foregroundStyle(mood == .crying || mood == .fussing ? .orange : mood == .noise || mood == .moving ? .yellow : mint)
            if let mood { Text(mood.title).font(.title.bold()).foregroundStyle(.white) }
            Text(caption).font(.callout).foregroundStyle(.white.opacity(0.8)).multilineTextAlignment(.center)
            if let level {
                GeometryReader { box in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.12))
                        Capsule().fill(mint).frame(width: box.size.width * CGFloat(min(1, level * 8)))
                    }
                }
                .frame(height: 8)
                .animation(.linear(duration: 0.1), value: level)
                .accessibilityLabel("Sound level")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, minHeight: 240)
        .background(navy, in: RoundedRectangle(cornerRadius: 22))
    }
}

// MARK: Car: back-seat camera phone

struct CameraScreen: View {
    let back: () -> Void
    @StateObject private var station = CameraStation()
    @State private var darkScreen = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    PicturePanel(image: station.preview, mood: station.running ? station.mood : nil, placeholder: "Tap Start Camera")
                    StatusPill(text: station.viewers == 0 ? "Waiting for the driver's phone" : "Connected to the driver's phone",
                               good: station.viewers > 0)
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.tooDark && station.running {
                        Text("It's too dark to see much. Sound and crying alerts still work.").font(.footnote).foregroundStyle(.orange)
                    }
                    if station.running {
                        BigButton(title: "Dark screen", symbol: "moon.fill") { darkScreen = true }
                        HStack {
                            Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                            Spacer()
                            Button { station.useFrontCamera.toggle() } label: { Label("Flip", systemImage: "arrow.triangle.2.circlepath.camera") }
                        }
                        .font(.subheadline.weight(.semibold))
                        .card()
                    } else {
                        BigButton(title: "Start Camera", symbol: "video.fill") { Task { await station.start() } }
                    }
                    CodeCard(code: station.code, hint: "On the driver's phone, pick Watch the back seat and type this code.")
                    CarScreenCard(screen: station.carScreen)
                    Text("Keep Stork View open on this phone and plug it in. Mount it securely so it can't fly loose.")
                        .font(.caption).foregroundStyle(.secondary)
                    if station.running {
                        Button("Stop Camera", role: .destructive) { station.stop() }.frame(maxWidth: .infinity)
                    }
                }
                .padding()
            }
            if darkScreen {
                DarkScreen(text: "Camera is on. Tap to wake.") { darkScreen = false }
            }
        }
        .statusBarHidden(darkScreen)
        .toolbar(darkScreen ? .hidden : .visible, for: .navigationBar)
        .modeToolbar("Back-seat camera", back: { station.stop(); back() })
        .task { await station.start() }
    }
}

// MARK: Car: driver's phone

struct DriverScreen: View {
    let back: () -> Void
    @StateObject private var station = DriverStation()
    @AppStorage("pairCode") private var pairCode = ""
    @State private var showSettings = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PicturePanel(image: station.connected ? station.picture : nil,
                             mood: station.running ? station.mood : nil,
                             placeholder: station.running ? station.status : "Switch the camera on, then tap Watch")
                if station.running {
                    StatusPill(text: station.connected ? "Connected" : station.status, good: station.connected)
                    if station.cameraTooDark && station.connected {
                        Text("It's dark back there, so the picture is hard to see. You can still hear the baby.").font(.footnote).foregroundStyle(.orange)
                    }
                    if station.connected && station.cameraBattery >= 0 && station.cameraBattery < 0.2 {
                        Text("The camera phone's battery is low. Plug it in.").font(.footnote).foregroundStyle(.orange)
                    }
                    if let problem = station.cardProblem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    HStack {
                        Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                        Slider(value: Binding(get: { Double(station.volume) }, set: { station.volume = Float($0) }), in: 0...1)
                        Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                    }
                    .card()
                    HStack {
                        Button { station.turns += 1 } label: { Label("Rotate", systemImage: "rotate.right") }
                            .buttonStyle(.bordered)
                        Spacer()
                        Button("Stop", role: .destructive) { station.stop() }.buttonStyle(.bordered)
                    }
                } else {
                    BigButton(title: "Watch", symbol: "eye.fill") { station.start(code: pairCode) }
                    CodeEntry(label: "Camera code (only for an old iPhone or iPad camera)", code: $pairCode)
                    Text("Using the mini camera? Setup steps are under the gear button.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                CarScreenCard(screen: station.carScreen)
                Text("Glance only, like a mirror. Not a medical or safety device. Never leave a child alone in a car.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .modeToolbar("Back seat", back: { station.stop(); back() }, settings: { showSettings = true })
        .sheet(isPresented: $showSettings) { DriverSettings(station: station) }
    }
}

private func spaced(_ number: String) -> String {
    number.count == 6 ? "\(number.prefix(3)) \(number.suffix(3))" : number
}

/// "Show on the car's screen": for a Tesla (or any car with a web browser). See CarScreen.
struct CarScreenCard: View {
    @ObservedObject var screen: CarScreen

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(get: { screen.wanted }, set: { screen.wanted = $0; screen.objectWillChange.send() })) {
                Label("Show on a Tesla screen", systemImage: "car.fill").font(.headline)
            }
            if screen.on {
                if screen.carWatching {
                    StatusPill(text: "The car screen is showing the back seat", good: true)
                }
                Text("1. On this phone, turn on Personal Hotspot (Settings > Personal Hotspot > Allow Others to Join).")
                Text("2. In the Tesla: Wi-Fi, join this phone's hotspot. You only do this once.")
                Text("3. In the Tesla's browser, go to:")
                Text("weltzcraft.com/storkview/car")
                    .font(.title3.weight(.bold))
                    .textSelection(.enabled)
                Text("The first time, the car screen shows a 6-digit number and this phone asks you to Allow it. Only allow it if the numbers match.")
                Text("Bookmark it in the Tesla so next time it's one tap.")
                if let link = screen.link {
                    Text("Direct address: \(link.replacingOccurrences(of: "http://", with: ""))")
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    if !link.contains("172.20.10.1") {
                        Text("This phone isn't sharing a hotspot right now, so use the direct address above.")
                            .foregroundStyle(.orange)
                    }
                } else {
                    Text("Waiting for the hotspot to turn on...").foregroundStyle(.orange)
                }
                Text("Live picture while parked. While driving, Tesla stops video, so the screen shows a still photo every 5 seconds and big Quiet, Moving or Crying. Keep Stork View open on this phone.")
                    .foregroundStyle(.secondary)
                if let problem = screen.problem { Text(problem).foregroundStyle(.orange) }
                if screen.allowedCount > 0 {
                    Button("Disconnect all car screens (\(screen.allowedCount))", role: .destructive) { screen.forgetAll() }
                        .font(.footnote.weight(.semibold))
                }
            }
        }
        .font(.footnote)
        .card()
        .alert("Allow this car screen?", isPresented: Binding(get: { screen.pendingNumber != nil }, set: { if !$0 { screen.deny() } })) {
            Button("Allow") { screen.allow() }
            Button("Don't Allow", role: .cancel) { screen.deny() }
        } message: {
            Text("Only tap Allow if your car screen shows \(spaced(screen.pendingNumber ?? "")). It will then see the back seat.")
        }
        .onAppear { if screen.wanted { screen.start() } }
        .onDisappear { screen.stop() }
    }
}

struct DriverSettings: View {
    @ObservedObject var station: DriverStation
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("In the car") {
                    Toggle("Show the picture on the car screen", isOn: Binding(get: { station.showPictureInCar }, set: { station.showPictureInCar = $0 }))
                    Toggle("Chime when the baby cries", isOn: Binding(get: { station.cryAlerts }, set: { station.cryAlerts = $0 }))
                }
                Section {
                    Text("1. On this phone: Settings > Personal Hotspot. Turn on Allow Others to Join and Maximize Compatibility.")
                    Text("2. Once, on a computer with Chrome or Edge: open weltzcraft.com/backseatview/camera, plug the camera in by USB and click Install. Type this phone's hotspot name and password when asked.")
                    Text("3. In the car: switch the camera on, keep your hotspot on, and tap Watch.")
                    Link("Open the setup page", destination: URL(string: "https://weltzcraft.com/backseatview/camera/")!)
                } header: { Text("Mini camera setup") }
                Section {
                    Text("With iOS 26, a Stork View card appears on your CarPlay Dashboard while you're watching. It shows a small picture that refreshes every few seconds and says Quiet, Moving or Crying.")
                    Text("Don't see it? Settings > General > CarPlay > your car: make sure Live Activities is on.")
                        .foregroundStyle(.secondary)
                } header: { Text("Car screen") }
            }
            .font(.subheadline)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct PicturePanel: View {
    let image: UIImage?
    let mood: BabyMood?
    let placeholder: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 22).fill(navy)
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
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
        .accessibilityLabel("Baby picture")
    }
}

/// "© <year> Weltzcraft Studios" copyright line; the name links to the studio site.
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
