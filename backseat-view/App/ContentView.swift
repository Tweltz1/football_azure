import SwiftUI

private let navy = Color(red: 0.06, green: 0.11, blue: 0.2)
private let mint = Color(red: 0.51, green: 0.87, blue: 0.73)
private let peach = Color(red: 1.0, green: 0.62, blue: 0.52)
private let sky = Color(red: 0.55, green: 0.72, blue: 1.0)
private let sun = Color(red: 1.0, green: 0.82, blue: 0.45)
/// Text-and-button color: mint is too pale on white, so light mode uses a deep teal.
private let accent = Color(UIColor { $0.userInterfaceStyle == .dark
    ? UIColor(red: 0.51, green: 0.87, blue: 0.73, alpha: 1)
    : UIColor(red: 0.0, green: 0.45, blue: 0.38, alpha: 1) })

/// Start menu: four modes. The app reopens in the last mode used; each mode has a back button.
struct ContentView: View {
    @AppStorage("mode") private var mode = ""

    var body: some View {
        NavigationStack {
            switch mode {
            case "camera": CameraScreen(tesla: false) { mode = "" }
            case "tesla": CameraScreen(tesla: true) { mode = "" }
            case "solo": CameraScreen(tesla: false, solo: true) { mode = "" }
            case "babyphone": BabyPhoneScreen { mode = "" }
            case "listen": ListenScreen { mode = "" }
            case "driver": DriverScreen { mode = "" }
            default: StartScreen { mode = $0 }
            }
        }
        .tint(accent)
    }
}

// MARK: Start menu

struct StartScreen: View {
    let pick: (String) -> Void
    @State private var showGuide = UserDefaults.standard.string(forKey: "guideTopic") != nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Hi there 👋").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                    Text("What is this phone for?").font(.largeTitle.bold())
                }
                .padding(.top, 8)

                Button { showGuide = true } label: {
                    Label("Setup guide: where to put the phones and how to start", systemImage: "book.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)

                ModeGroup(title: "At home", symbol: "house.fill") {
                    ModeCard(symbol: "ear.fill", color: mint, title: "Baby phone",
                             detail: "Stays by the crib. Listens, and can show the baby on camera.") { pick("babyphone") }
                    ModeCard(symbol: "headphones", color: sky, title: "Parent phone",
                             detail: "Hear and see the baby. Get alerts for crying, fussing and moving.") { pick("listen") }
                }

                ModeGroup(title: "Car with a Tesla screen", symbol: "bolt.car.fill") {
                    ModeCard(symbol: "video.fill", color: peach, title: "Tesla camera",
                             detail: "This iPhone is the camera, facing the baby. The Tesla's own screen shows it. Only one phone needed.") { pick("tesla") }
                }

                ModeGroup(title: "Car with Apple CarPlay", symbol: "car.side.fill") {
                    ModeCard(symbol: "video.fill", color: peach, title: "Back-seat camera",
                             detail: "Spare iPhone facing the baby. Sends the picture and sound to the driver's phone.") { pick("camera") }
                    ModeCard(symbol: "car.side.rear.open", color: sun, title: "Watch the back seat",
                             detail: "Driver's phone, plugged into CarPlay. Shows a baby card with a fresh snapshot on the CarPlay screen and Lock Screen.") { pick("driver") }
                }

                ModeGroup(title: "Car without a screen", symbol: "car.fill") {
                    ModeCard(symbol: "bell.fill", color: mint, title: "Car-seat watcher",
                             detail: "One iPhone above the car seat. Dings by itself when the baby cries, fusses or wakes up. No other phone or screen needed.") { pick("solo") }
                }

                PhoneNameCard()

                Text("Tip: put Stork View on both phones. Each one picks its job here. Once paired, they can swap jobs any time.")
                    .font(.footnote).foregroundStyle(.secondary)
                StudioCredit().padding(.top, 4)
            }
            .padding()
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showGuide) { SetupGuide() }
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

/// "This phone's name": what the other phone sees in its nearby list and when it connects.
struct PhoneNameCard: View {
    @AppStorage("phoneName") private var phoneName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("This phone's name", systemImage: "iphone").font(.headline)
            TextField("Like Nursery or Tyler's iPhone", text: $phoneName)
                .textFieldStyle(.roundedBorder)
                .submitLabel(.done)
            Text("The other phone sees this name when it looks for nearby phones.")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
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

/// Nearby phones to tap, AirDrop-style, on the phone that watches/listens.
struct NearbyList: View {
    let title: String
    let empty: String
    let items: [DriverStation.Nearby]
    let tap: (DriverStation.Nearby) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if items.isEmpty {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(empty).font(.footnote).foregroundStyle(.secondary)
                }
            }
            ForEach(items) { item in
                Button { tap(item) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "iphone.radiowaves.left.and.right")
                            .font(.title2).foregroundStyle(accent)
                            .frame(width: 44, height: 44)
                            .background(mint.opacity(0.15), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.headline).foregroundStyle(.primary)
                            Text(item.saved ? "Ready, tap to connect" : "Tap to connect")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .card()
    }
}

/// Tells the sending phone's owner how to connect (no code to type any more).
struct TapHint: View {
    let name: String
    let hint: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right").font(.title2).foregroundStyle(accent)
            VStack(alignment: .leading, spacing: 4) {
                Text("Shows up nearby as “\(name)”").font(.headline)
                Text(hint).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

extension View {
    /// "Parent phone wants to connect" Allow / Don't Allow, like AirDrop.
    func joinAlert(_ station: CameraStation) -> some View {
        alert(
            "\(station.request?.name ?? "A phone") wants to connect",
            isPresented: Binding(get: { station.request != nil }, set: { if !$0 { station.answer(false) } })
        ) {
            Button("Don't Allow", role: .cancel) { station.answer(false) }
            Button("Allow") { station.answer(true) }
        } message: {
            Text("It will see and hear this phone. You only need to allow it once.")
        }
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
                               : !station.viewerNames.isEmpty ? "Connected to \(station.viewerNames.joined(separator: " and "))"
                               : station.viewers == 1 ? "Parent phone connected" : "\(station.viewers) parent phones connected",
                               good: station.viewers > 0)
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.talking {
                        Label("The parent phone is talking", systemImage: "mic.fill")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(accent)
                    }
                    if let music = station.music {
                        HStack {
                            Label("Playing \(music.title)", systemImage: music.symbol).font(.subheadline.weight(.semibold))
                            Spacer()
                            Button("Stop") { station.stopMusic() }.buttonStyle(.bordered)
                        }
                        .card()
                    }
                    if !station.audioOnly && station.tooDark && station.running && !station.nightView {
                        Text(CameraStation.nightViewAvailable
                             ? "It's too dark for the camera. Turn on Night view below, or rely on sound alerts."
                             : "It's too dark for the camera. Sound alerts still work. A small night light helps.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                    if station.measuresBreathing {
                        BreathRow(code: station.breath?.code, perMinute: station.breath?.perMinute)
                    }

                    if station.running {
                        BigButton(title: "Dark screen", symbol: "moon.fill") { darkScreen = true }
                    } else {
                        BigButton(title: "Start", symbol: "play.fill") { Task { await station.start() } }
                    }

                    TapHint(name: Pairing.name(or: "Baby Phone"), hint: "On the parent phone, pick Parent phone and tap \(Pairing.name(or: "Baby Phone")). Then tap Allow here. Only once, and after that the two phones can also swap jobs.")

                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(isOn: Binding(get: { !station.audioOnly }, set: { on in Task { await station.setVideo(on) } })) {
                            Label("Camera", systemImage: "video.fill")
                        }
                        if !station.audioOnly && station.running {
                            HStack {
                                Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                                Spacer()
                                Button { station.flip() } label: { Label("Flip", systemImage: "arrow.triangle.2.circlepath.camera") }
                            }
                            .font(.subheadline.weight(.semibold))
                        }
                        Text(station.audioOnly
                             ? "Sound only. You can lock this phone and it keeps listening."
                             : "With the camera on, keep this phone open and use Dark screen. If it locks, the picture pauses but sound keeps going.")
                            .font(.caption).foregroundStyle(.secondary)
                        if !station.audioOnly && CameraStation.nightViewAvailable {
                            Divider()
                            Toggle(isOn: Binding(get: { station.nightView }, set: { station.nightView = $0 })) {
                                Label("Night view + breathing", systemImage: "moon.stars.fill")
                            }
                            Text("Uses the Face ID camera's own infrared light, so it sees in total darkness (gray shapes, closer is brighter). Point the screen side at the baby, about 0.5 to 1.5 m away. When the baby is still, it also shows about how many breaths a minute it sees. Not a medical device.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .card()

                    DisclosureGroup("Tips") {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("• Put this phone near the crib, out of the baby's reach, and plug it in.")
                            Text("• Both phones need the same Wi-Fi, or to be close enough for AirDrop.")
                            Text("• Don't swipe Stork View closed.")
                            Button("Forget connected phones", role: .destructive) { station.forgetPhones() }
                                .font(.footnote).padding(.top, 4)
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
        .joinAlert(station)
        .task { await station.start() }
    }
}

// MARK: Home: the parent phone

struct ListenScreen: View {
    let back: () -> Void
    @StateObject private var station = DriverStation(home: true)
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
                    StatusPill(text: station.connected ? (station.hearing ? "Hearing the baby" : "Connected · quiet") + (station.route?.label.map { " · \($0)" } ?? "") : "Connecting…",
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

                    if station.connected, let code = station.babyBreath {
                        BreathRow(code: code, perMinute: station.babyBreaths)
                    }
                    if station.connected {
                        LiveSoundRow(level: station.soundLevel, last: station.lastSound, overInternet: station.route == .internet)
                        TalkAndSoothe(station: station)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                            Slider(value: Binding(get: { Double(station.volume) }, set: { station.volume = Float($0) }), in: 0...1)
                            Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                        }
                        Picker("Hear the baby", selection: Binding(get: { station.soundMode }, set: { station.soundMode = $0 })) {
                            ForEach(DriverStation.SoundMode.allCases, id: \.self) { Text($0.short).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    .card()

                    if station.connected && station.cameraNight != nil {
                        CameraRemote(station: station, nightLabel: "Night view + breathing")
                    }
                    HStack {
                        if station.picture != nil {
                            Button { station.turns += 1 } label: { Label("Rotate", systemImage: "rotate.right") }
                                .buttonStyle(.bordered)
                        }
                        Spacer()
                        Button("Stop", role: .destructive) { station.stop(); station.look() }.buttonStyle(.bordered).tint(.red)
                    }
                } else {
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.hasSaved {
                        BigButton(title: "Listen", symbol: "headphones") { station.start() }
                    }
                    NearbyList(title: "Nearby baby phones",
                               empty: "Looking… Open Stork View on the baby phone and pick Baby phone.",
                               items: station.nearby) { station.start(target: $0.id) }
                    Text("Lock this phone any time. A Baby's room card stays on your Lock Screen, and alerts come through.")
                        .font(.caption).foregroundStyle(.secondary)
                    if InternetRelay.available {
                        Label(station.awayReady ? "Ready to listen away from home too, over cellular or any Wi-Fi."
                                                : "Connect once at home, then you can listen away from home too.",
                              systemImage: "globe")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .routeBanner(station.routeNotice)
        .modeToolbar("Parent phone", back: { station.stop(); back() }, settings: { showSettings = true })
        .onAppear { station.look() }
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
                    Text("\"Baby sounds only\" stays silent until the phone recognizes the baby (crying, whimpering, babbling, laughing), so TV, talking, fans, echo and the soothing sound stay quiet. \"Any noise\" plays any sound louder than the room's hum. Both keep the first moment and play live for a few seconds after.")
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
                    Toggle(isOn: Binding(get: { station.breathAlerts }, set: { station.breathAlerts = $0 })) {
                        HStack(spacing: 6) {
                            Text("No breathing movement")
                            Text("BETA").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.orange.opacity(0.2), in: Capsule()).foregroundStyle(.orange)
                        }
                    }
                } header: { Text("Breathing alert (Beta)") } footer: {
                    Text("Off unless you turn it on. Needs the baby phone's camera with Night view + breathing on. If the baby is still and quiet and Stork View stops seeing the breathing rhythm for about \(DriverStation.breathAlertSeconds) seconds, you get a \"Check on the baby\" notification, about half a minute after the change.\n\nThis is an experiment, not a medical or safety device, and it is not an apnea or SIDS monitor. It can miss real problems and it will sometimes go off when the baby is fine (blankets, a turned head, a bumped phone, the baby out of view). Never rely on it. Follow safe sleep guidance and check on your baby in person.")
                }
                if InternetRelay.available {
                    Section {
                        Label(station.awayReady ? "Ready" : "Connect once at home first", systemImage: "globe")
                        if station.hasSaved {
                            Button("Forget saved baby phones", role: .destructive) { station.forgetSaved() }
                        }
                    } header: { Text("Away from home") } footer: {
                        Text("Home Wi-Fi comes first, then phone to phone. If neither works (you're out), Stork View connects over the internet. It's encrypted on the phones, the picture is smaller, and sound only comes when there's a noise, to save data.")
                    }
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

/// Flip and Night view for the camera phone, from the phone that's watching.
struct CameraRemote: View {
    @ObservedObject var station: DriverStation
    let nightLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { station.cameraCommand("flip") } label: {
                Label("Flip the other phone's camera", systemImage: "arrow.triangle.2.circlepath.camera")
            }
            .font(.subheadline.weight(.semibold))
            if station.cameraNightOK {
                Toggle(isOn: Binding(get: { station.cameraNight == true },
                                     set: { station.cameraCommand($0 ? "night-on" : "night-off") })) {
                    Label(nightLabel, systemImage: "moon.stars.fill").font(.subheadline.weight(.semibold))
                }
                Text("Night view uses the other phone's front Face ID camera, so point its screen side at the baby. Flip switches night view off.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .card()
    }
}

/// Breathing readout line (night view at home). An estimate, never a medical number.
struct BreathRow: View {
    let code: String?
    let perMinute: Int?

    private var text: String {
        switch code {
        case "breathing": return perMinute.map { "Breathing motion: about \($0) a minute" } ?? "Breathing motion seen"
        case "moving": return "Moving, so breathing isn't measured"
        case "unclear": return "Can't see a breathing rhythm right now"
        default: return "Measuring breathing… keep the baby in view"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label {
                Text(text)
            } icon: {
                Image(systemName: code == "breathing" ? "lungs.fill" : "lungs")
                    .foregroundStyle(code == "breathing" ? Color.green : Color.secondary)
            }
            .font(.subheadline.weight(.semibold))
            Text("Estimate from the night view, not a medical device.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
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
    /// Tesla: the car's own screen watches. Otherwise (CarPlay) the driver's phone does.
    let tesla: Bool
    /// Car without a screen: this phone works alone and dings.
    var solo = false
    let back: () -> Void
    @StateObject private var station = CameraStation()
    @State private var darkScreen = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    PicturePanel(image: station.preview, mood: station.running ? station.mood : nil, placeholder: "Tap Start Camera")
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Set up").font(.headline)
                        StepRow(number: 1, text: "Mount this phone on the back of a front headrest, camera facing the baby. Plug it in.")
                        StepRow(number: 2, text: "Check the picture above. Use Rotate if it's sideways, Flip to switch cameras.")
                        if solo {
                            StepRow(number: 3, text: "Pick the dings you want below. They play from this phone, so turn its volume up. The baby may hear them too.")
                        } else if tesla {
                            StepRow(number: 3, text: "Follow the Tesla steps below.")
                        } else {
                            StepRow(number: 3, text: "On the driver's phone, open Stork View, pick Watch the back seat and tap \(Pairing.name(or: "Back-seat camera")). Tap Allow here (only the first time).")
                        }
                        StepRow(number: 4, text: "Tap Dark screen to turn this screen black. The camera keeps going.")
                    }
                    .font(.footnote)
                    .card()
                    if tesla {
                        CarScreenCard(screen: station.carScreen)
                    }
                    if solo {
                        SoloDingCard(station: station)
                    }
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.tooDark && station.running && !station.nightView {
                        Text(CameraStation.nightViewAvailable
                             ? "It's too dark to see much. Turn on Night view below, or rely on sound and crying alerts."
                             : "It's too dark to see much. Sound and crying alerts still work.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                    if station.running {
                        BigButton(title: "Dark screen", symbol: "moon.fill") { darkScreen = true }
                        HStack {
                            Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                            Spacer()
                            Button { station.flip() } label: { Label("Flip", systemImage: "arrow.triangle.2.circlepath.camera") }
                        }
                        .font(.subheadline.weight(.semibold))
                        .card()
                        if CameraStation.nightViewAvailable {
                            VStack(alignment: .leading, spacing: 6) {
                                Toggle(isOn: Binding(get: { station.nightView }, set: { station.nightView = $0 })) {
                                    Label("Night view", systemImage: "moon.stars.fill").font(.subheadline.weight(.semibold))
                                }
                                Text("Uses the Face ID camera's own infrared light, so it works in total darkness. Shows a gray shape view (closer is brighter), not a color photo. Uses the front camera: point the screen side at the baby, about 1 to 2 m away.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            .card()
                        }
                    } else {
                        BigButton(title: "Start Camera", symbol: "video.fill") { Task { await station.start() } }
                    }
                    if !tesla && !solo {
                        StatusPill(text: station.viewers == 0 ? "Waiting for the driver's phone" : "Connected to the driver's phone",
                                   good: station.viewers > 0)
                        TapHint(name: Pairing.name(or: "Back-seat camera"), hint: "On the driver's phone pick Watch the back seat and tap \(Pairing.name(or: "Back-seat camera")). Then tap Allow here. Only once.")
                    }
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
        .modeToolbar(solo ? "Car-seat watcher" : tesla ? "Tesla camera" : "Back-seat camera", back: { station.stop(); back() })
        .joinAlert(station)
        .task { station.solo = solo; await station.start() }
    }
}

/// Car without a screen: which dings this phone plays by itself.
struct SoloDingCard: View {
    @ObservedObject var station: CameraStation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Ding on this phone when the baby is…", systemImage: "bell.fill").font(.headline)
            Toggle("Crying (double ding)", isOn: Binding(get: { station.dingCry }, set: { station.dingCry = $0 }))
            Toggle("Fussing", isOn: Binding(get: { station.dingFuss }, set: { station.dingFuss = $0 }))
            Toggle("Waking up (camera)", isOn: Binding(get: { station.dingWake }, set: { station.dingWake = $0 }))
            if let last = station.lastDing {
                Text("Last ding: \(last.title) at \(last.at.formatted(date: .omitted, time: .shortened))")
                    .font(.subheadline.weight(.semibold))
            }
            Button { station.testDing() } label: { Label("Test the ding", systemImage: "speaker.wave.2.fill") }
                .buttonStyle(.bordered)
            Text("Crying and fussing come from sound, so they work while driving. Waking up means moving for a few seconds after 3 minutes still; bumpy roads can fool it. Breathing isn't checked in the car because road shake is far bigger than a baby's breathing. Not a safety device.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .card()
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
                             placeholder: station.running ? station.status : "Open Stork View on the camera iPhone, then tap it below")
                if station.running {
                    StatusPill(text: station.connected ? (station.route?.label.map { "Connected · \($0)" } ?? "Connected") : station.status, good: station.connected)
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
                    if station.connected && station.cameraNight != nil {
                        CameraRemote(station: station, nightLabel: "Night view")
                    }
                    HStack {
                        Button { station.turns += 1 } label: { Label("Rotate", systemImage: "rotate.right") }
                            .buttonStyle(.bordered)
                        Spacer()
                        Button("Stop", role: .destructive) { station.stop(); station.look() }.buttonStyle(.bordered).tint(.red)
                    }
                } else {
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    if station.hasSaved {
                        BigButton(title: "Watch", symbol: "eye.fill") { station.start(code: pairCode) }
                    }
                    NearbyList(title: "Nearby camera iPhones",
                               empty: "Looking… On the camera iPhone, open Stork View and pick Back-seat camera.",
                               items: station.nearby) { station.start(code: pairCode, target: $0.id) }
                    Button("Using the mini camera instead? Connect to it") { station.start(code: pairCode) }
                        .font(.footnote)
                }
                CarScreenCard(screen: station.carScreen)
                Text("Glance only, like a mirror. Not a medical or safety device. Never leave a child alone in a car.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .routeBanner(station.routeNotice)
        .modeToolbar("Back seat", back: { station.stop(); back() }, settings: { showSettings = true })
        .onAppear { station.look() }
        .sheet(isPresented: $showSettings) { DriverSettings(station: station) }
    }
}

/// A numbered step: a small filled circle with the number, then the text.
struct StepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(number)")
                .font(.caption.weight(.heavy))
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(accent, in: Circle())
            Text(text)
        }
    }
}

/// "Show on the car's screen": for a Tesla (or any car with a web browser). See CarScreen.
struct CarScreenCard: View {
    @ObservedObject var screen: CarScreen

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(get: { screen.wanted }, set: { screen.wanted = $0; screen.objectWillChange.send() })) {
                Label("Show on a Tesla screen", systemImage: "car.fill").font(.headline)
            }
            if !screen.on && screen.problem == nil {
                Text("Turn this on to see the baby on your Tesla's screen. No cables or hotspot needed.")
                    .foregroundStyle(.secondary)
            }
            if screen.on {
                if screen.carWatching {
                    StatusPill(text: "The car screen is showing the back seat", good: true)
                } else {
                    StatusPill(text: screen.connected ? "Ready for the car screen" : "Connecting to the internet...", good: screen.connected)
                }
                StepRow(number: 1, text: "In the Tesla, tap the browser and go to:")
                Text("weltzcraft.com/storkview/car")
                    .font(.title3.weight(.bold))
                    .textSelection(.enabled)
                    .padding(.leading, 36)
                StepRow(number: 2, text: "Type this code on the Tesla and tap Connect:")
                Text("\(screen.code.prefix(3)) \(screen.code.suffix(3))")
                    .font(.system(size: 40, weight: .heavy, design: .rounded)).monospacedDigit()
                    .padding(.leading, 36)
                StepRow(number: 3, text: "Tap Allow when this phone asks.")
                StepRow(number: 4, text: "Tap \"Tap to start\" on the Tesla. Done! Bookmark the page; next time it connects by itself while this switch is on.")
                Text("Live picture while parked. While driving, Tesla stops video, so the screen shows a still photo every 5 seconds and big Quiet, Moving or Crying. Uses this phone's data: about 150 MB an hour while parked, much less while driving. Encrypted on the phone.")
                    .foregroundStyle(.secondary)
                if let problem = screen.problem { Text(problem).foregroundStyle(.orange) }
                Button("Disconnect all car screens", role: .destructive) { screen.forgetAll() }
                    .font(.footnote.weight(.semibold))
            } else if let problem = screen.problem {
                Text(problem).foregroundStyle(.orange)
            }
        }
        .font(.footnote)
        .card()
        .alert("Allow this car screen?", isPresented: Binding(get: { screen.asking }, set: { if !$0 { screen.deny() } })) {
            Button("Allow") { screen.allow() }
            Button("Don't Allow", role: .cancel) { screen.deny() }
        } message: {
            Text("A screen typed your code \(screen.code.prefix(3)) \(screen.code.suffix(3)). Only tap Allow if it's your car. It will then see the back seat.")
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

/// Small pop-up at the top that says how the phones are connected now (Wi-Fi or phone to phone).
struct RouteBanner: ViewModifier {
    let text: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let text {
                Label(text, systemImage: text.contains("phone to phone") ? "iphone.radiowaves.left.and.right" : "wifi")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(navy.opacity(0.95), in: Capsule())
                    .shadow(radius: 6)
                    .padding(.top, 8)
                    .padding(.horizontal, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(.spring(duration: 0.35), value: text)
    }
}

extension View {
    func routeBanner(_ text: String?) -> some View { modifier(RouteBanner(text: text)) }
}

/// "Is it frozen?" answer for the parent: a blinking Live dot and a level meter fed by the sound coming in.
struct LiveSoundRow: View {
    let level: Float
    let last: Date?
    let overInternet: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let age = last.map { context.date.timeIntervalSince($0) } ?? .infinity
            let live = age < 4
            let blink = Int(context.date.timeIntervalSince1970 * 2) % 2 == 0
            HStack(spacing: 10) {
                Circle()
                    .fill(live ? Color.green : Color.orange)
                    .frame(width: 10, height: 10)
                    .opacity(live && !blink ? 0.4 : 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(live ? "Live · sound coming in" : age.isFinite ? "No sound for \(Int(age)) s" : "Waiting for sound")
                        .font(.subheadline.weight(.semibold))
                    if overInternet {
                        Text("Over the internet: updates every 2 s, sound plays on noise")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                HStack(alignment: .bottom, spacing: 3) {
                    ForEach(0..<6, id: \.self) { bar in
                        let lit = live && Float(bar) < min(6, level * 120)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(lit ? accent : Color.secondary.opacity(0.25))
                            .frame(width: 5, height: CGFloat(6 + bar * 3))
                    }
                }
                .accessibilityHidden(true)
            }
            .card()
            .accessibilityElement(children: .combine)
        }
    }
}

/// Parent phone: talk to the baby and start soothing sounds on the baby phone.
struct TalkAndSoothe: View {
    @ObservedObject var station: DriverStation
    @AppStorage("sootheMinutes") private var minutes = 30
    @AppStorage("sootheVolume") private var volume = 0.5

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { station.toggleTalk() } label: {
                Label(station.talking ? "Stop talking" : "Talk to the baby", systemImage: station.talking ? "mic.slash.fill" : "mic.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(station.talking ? .red : accent)
            .controlSize(.large)
            if station.talking {
                Text("The baby phone is playing your voice. The room sound pauses while you talk.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let problem = station.micProblem { Text(problem).font(.caption).foregroundStyle(.orange) }

            Text("Soothing sounds on the baby phone").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(Soothing.allCases.filter { $0 != .mine || station.hasRecording }) { sound in
                    let on = station.babyMusic == sound
                    Button {
                        station.soothe(on ? nil : sound, minutes: minutes == 0 ? nil : minutes, volume: Float(volume))
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: on ? "stop.fill" : sound.symbol).font(.title3)
                            Text(sound.title).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                    .tint(on ? accent : .primary)
                }
            }
            Button { station.toggleRecord() } label: {
                if let since = station.recordingSince {
                    TimelineView(.periodic(from: since, by: 1)) { context in
                        Label("Stop and save (\(max(0, 30 - Int(context.date.timeIntervalSince(since)))) s left)", systemImage: "stop.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    Label(station.hasRecording ? "Record a new sound" : "Record your own sound", systemImage: "record.circle")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .tint(station.recordingSince != nil ? .red : accent)
            if station.recordingSince != nil {
                Text("Shush, hum or sing. It plays over and over on the baby phone as \"My recording\".")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Picker("Turn off after", selection: $minutes) {
                Text("15 min").tag(15)
                Text("30 min").tag(30)
                Text("1 hr").tag(60)
                Text("Keep on").tag(0)
            }
            .pickerStyle(.segmented)
            HStack {
                Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                Slider(value: $volume, in: 0.1...1, onEditingChanged: { editing in
                    if !editing, let sound = station.babyMusic {
                        station.soothe(sound, minutes: minutes == 0 ? nil : minutes, volume: Float(volume))
                    }
                })
                Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
            }
            if let sound = station.babyMusic {
                Text("Playing \(sound.title) on the baby phone. Tap it again to stop.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .card()
    }
}
