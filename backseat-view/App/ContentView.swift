import SwiftUI

private let navy = Color(red: 0.06, green: 0.11, blue: 0.2)
private let mint = Color(red: 0.51, green: 0.87, blue: 0.73)

/// Normally this is the driver's phone. An old iPhone or iPad can be switched to be the camera instead,
/// or the app can be a sound-only baby monitor at home: one phone by the baby, another to listen.
struct ContentView: View {
    @AppStorage("role") private var role = ""

    var body: some View {
        switch role {
        case "camera":
            CameraScreen { role = "" }
        case "babyphone":
            BabyPhoneScreen { role = $0 }
        case "listen":
            ListenScreen { role = $0 }
        default:
            DriverScreen { role = $0 }
        }
    }
}

// MARK: Home baby monitor: the phone by the baby

struct BabyPhoneScreen: View {
    let onSwitch: (String) -> Void
    @StateObject private var station = CameraStation(home: true)
    @State private var darkScreen = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Image(systemName: "ear.fill").foregroundStyle(mint)
                        Text("Baby phone").font(.title2.bold())
                    }
                    if station.audioOnly {
                        SoundPanel(mood: station.running ? station.mood : nil,
                                   level: station.running ? station.level : 0,
                                   caption: station.running ? "Listening for the baby" : "Tap Start Listening")
                    } else {
                        PicturePanel(image: station.preview, mood: station.running ? station.mood : nil, placeholder: "Tap Start Listening")
                    }
                    Toggle(isOn: Binding(get: { !station.audioOnly }, set: { on in Task { await station.setVideo(on) } })) {
                        Label("Camera on (see the baby and spot movement)", systemImage: "video.fill")
                    }
                    if !station.audioOnly {
                        Text("With the camera on, keep this phone unlocked with Backseat View open (use Dark screen). If it locks, the sound keeps going but the picture pauses.")
                            .font(.caption).foregroundStyle(.secondary)
                        if station.tooDark && station.running {
                            Text("It's too dark for the camera to see much. Sound, crying and fussing alerts still work. A small night light helps.")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                        if station.running {
                            HStack {
                                Button { station.rotation = (station.rotation + 90) % 360 } label: { Label("Rotate", systemImage: "rotate.right") }
                                Button { station.useFrontCamera.toggle() } label: { Label("Flip camera", systemImage: "arrow.triangle.2.circlepath.camera") }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    if let problem = station.problem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pairing code").font(.caption).foregroundStyle(.secondary)
                        Text(station.code).font(.system(size: 44, weight: .heavy, design: .rounded)).monospacedDigit()
                        Text("On the phone you'll listen with, open Backseat View, pick Listen to the baby, and type this code.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    Text(station.viewers == 0 ? "Waiting for the listening phone"
                         : station.viewers == 1 ? "1 phone is listening" : "\(station.viewers) phones are listening")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(station.viewers == 0 ? Color.secondary : mint)
                    if station.running {
                        Button { darkScreen = true } label: { Label("Dark screen", systemImage: "moon.fill") }
                            .buttonStyle(.bordered)
                        Button("Stop Listening", role: .destructive) { station.stop() }.buttonStyle(.bordered)
                    } else {
                        Button { Task { await station.start() } } label: { Text("Start Listening").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).controlSize(.large)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Put this phone near the crib, out of the baby's reach, and plug it in.")
                        Text(station.audioOnly ? "You can lock this phone. It keeps listening (you'll see the orange microphone dot). Don't swipe Backseat View closed."
                             : "Prop it up facing the crib, a few feet away. Don't swipe Backseat View closed.")
                        Text("Both phones need to be on the same Wi-Fi, or close enough for AirDrop.")
                    }
                    .font(.caption).foregroundStyle(.secondary)
                    Button("Use this phone to listen instead") { station.stop(); onSwitch("listen") }.font(.footnote)
                    Button("Back to the car camera") { station.stop(); onSwitch("") }.font(.footnote)
                }
                .padding()
            }
            if darkScreen {
                Color.black.ignoresSafeArea()
                    .overlay(Text(station.audioOnly ? "Listening. Tap to wake." : "Camera and sound are on. Tap to wake.").font(.footnote).foregroundStyle(.white.opacity(0.25)))
                    .onTapGesture { darkScreen = false }
            }
        }
        .statusBarHidden(darkScreen)
        .task { await station.start() }
    }
}

// MARK: Home baby monitor: the phone you listen on

struct ListenScreen: View {
    let onSwitch: (String) -> Void
    @StateObject private var station = DriverStation(home: true)
    @AppStorage("homePairCode") private var pairCode = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Image(systemName: "headphones").foregroundStyle(mint)
                    Text("Listen to the baby").font(.title2.bold())
                }
                if station.connected, station.picture != nil {
                    PicturePanel(image: station.picture, mood: station.mood, placeholder: "")
                    Text(station.hearing ? "You're hearing the baby's room" : "Quiet. The sound comes on when there's a noise.")
                        .font(.footnote).foregroundStyle(.secondary)
                    if station.cameraTooDark {
                        Text("It's dark in the baby's room, so the picture is hard to see. Sound alerts still work.").font(.footnote).foregroundStyle(.orange)
                    }
                } else {
                    SoundPanel(mood: station.running ? station.mood : nil, level: nil,
                               caption: !station.running ? "Start Listening on the baby phone, then tap Listen here"
                               : !station.connected ? station.status
                               : station.hearing ? "You're hearing the baby's room" : "Quiet. The sound comes on when there's a noise.")
                }
                if station.running {
                    Text(station.status).font(.footnote).foregroundStyle(.secondary)
                    if station.connected && station.cameraBattery >= 0 && station.cameraBattery < 0.2 {
                        Text("The baby phone's battery is low. Plug it in.").font(.footnote).foregroundStyle(.orange)
                    }
                    if let problem = station.cardProblem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    HStack {
                        if station.picture != nil {
                            Button { station.turns += 1 } label: { Label("Rotate picture", systemImage: "rotate.right") }
                        }
                        Button("Stop", role: .destructive) { station.stop() }
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button { station.start(code: pairCode) } label: { Text("Listen").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(pairCode.count != 4)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Code shown on the baby phone").font(.caption).foregroundStyle(.secondary)
                        TextField("4-digit code", text: $pairCode)
                            .keyboardType(.numberPad)
                            .font(.title2.monospacedDigit())
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: pairCode) { _, value in
                                let digits = String(value.filter(\.isNumber).prefix(4))
                                if digits != value { pairCode = digits }
                            }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Sound").font(.headline)
                    Picker("Hear the baby", selection: Binding(get: { station.soundMode }, set: { station.soundMode = $0 })) {
                        ForEach(DriverStation.SoundMode.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Text(station.soundMode == .always
                         ? "You hear the baby's room the whole time, like a classic baby monitor."
                         : "Silent until the baby makes a sound, then you hear it live for a few seconds. The first moment of the sound is kept so you don't miss it.")
                        .font(.caption).foregroundStyle(.secondary)
                    Picker("Pick up", selection: Binding(get: { station.sensitivity }, set: { station.sensitivity = $0 })) {
                        ForEach(SoundGate.Sensitivity.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    HStack {
                        Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                        Slider(value: Binding(get: { Double(station.volume) }, set: { station.volume = Float($0) }), in: 0...1)
                        Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                    }
                    Text("Notifications").font(.headline).padding(.top, 4)
                    Toggle("When the baby cries", isOn: Binding(get: { station.cryAlerts }, set: { station.cryAlerts = $0 }))
                    Toggle("When the baby fusses", isOn: Binding(get: { station.fussAlerts }, set: { station.fussAlerts = $0 }))
                    Toggle("When the baby moves (camera on)", isOn: Binding(get: { station.motionAlerts }, set: { station.motionAlerts = $0 }))
                    Toggle("On any sound", isOn: Binding(get: { station.noiseAlerts }, set: { station.noiseAlerts = $0 }))
                    Text("Fussing means little sounds that keep coming back for a while (whimpers, grunts, babbling), not one bump. You always get a notification if the baby phone disconnects.")
                        .font(.caption).foregroundStyle(.secondary)
                    if station.notificationsOff {
                        Text("Notifications are off for Backseat View, so you'll only get the Lock Screen card chime. Turn them on in Settings > Notifications > Backseat View.")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                Text("You can lock this phone and keep listening. A Baby's room card on your Lock Screen shows Quiet, Making sounds, Moving, Fussing or Crying. Turn on the camera on the baby phone to see the baby here too.")
                    .font(.caption).foregroundStyle(.secondary)
                Text("Not a medical or safety device. Check on your baby in person.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Use this phone by the baby instead") { station.stop(); onSwitch("babyphone") }.font(.footnote)
                Button("Back to the car camera") { station.stop(); onSwitch("") }.font(.footnote)
                StudioCredit().padding(.top, 4)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
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
                .foregroundStyle(mood == .crying || mood == .fussing ? .orange : mood == .noise ? .yellow : mint)
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
        .background(navy, in: RoundedRectangle(cornerRadius: 18))
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
                    Button("Use this device as the viewer instead") { station.stop(); onSwitch() }.font(.footnote)
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
    let onSwitch: (String) -> Void
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
                             placeholder: station.running ? station.status : "Switch the camera on, then tap Watch Back Seat")
                if station.running {
                    Text(station.status).font(.footnote).foregroundStyle(.secondary)
                    if station.cameraTooDark && station.connected {
                        Text("It's dark back there, so the picture is hard to see. You can still hear the baby.").font(.footnote).foregroundStyle(.orange)
                    }
                    if station.connected && station.cameraBattery >= 0 && station.cameraBattery < 0.2 {
                        Text("The camera phone's battery is low. Plug it in.").font(.footnote).foregroundStyle(.orange)
                    }
                    if let problem = station.cardProblem { Text(problem).font(.footnote).foregroundStyle(.orange) }
                    HStack {
                        Button { station.turns += 1 } label: { Label("Rotate picture", systemImage: "rotate.right") }
                        Button("Stop", role: .destructive) { station.stop() }
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button { station.start(code: pairCode) } label: { Text("Watch Back Seat").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Camera code (only if the camera is an old iPhone or iPad)").font(.caption).foregroundStyle(.secondary)
                        TextField("4-digit code", text: $pairCode)
                            .keyboardType(.numberPad)
                            .font(.title2.monospacedDigit())
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: pairCode) { _, value in
                                let digits = String(value.filter(\.isNumber).prefix(4))
                                if digits != value { pairCode = digits }
                            }
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Label("Mini camera setup", systemImage: "video.badge.checkmark").font(.headline)
                    Text("1. On this phone: Settings > Personal Hotspot. Turn on Allow Others to Join and Maximize Compatibility.")
                    Text("2. Once, on a computer with Chrome or Edge: open weltzcraft.com/backseatview/camera, plug the camera in by USB and click Install. Type this phone's hotspot name and password when asked.")
                    Text("3. In the car: switch the camera on, keep your hotspot on, and tap Watch Back Seat.")
                    Link("Open the setup page", destination: URL(string: "https://weltzcraft.com/backseatview/camera/")!)
                }
                .font(.subheadline)
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

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

                VStack(alignment: .leading, spacing: 10) {
                    Label("Baby monitor at home", systemImage: "ear.fill").font(.headline)
                    Text("Sound only, with two phones. Put one by the baby to listen for noises, and listen on the other one anywhere in the house.")
                        .font(.subheadline)
                    HStack {
                        Button { station.stop(); onSwitch("babyphone") } label: { Text("This phone stays by the baby").frame(maxWidth: .infinity) }
                        Button { station.stop(); onSwitch("listen") } label: { Text("Listen on this phone").frame(maxWidth: .infinity) }
                    }
                    .buttonStyle(.bordered)
                    .font(.footnote.weight(.semibold))
                }
                .padding(16)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                Text("Glance only, like a mirror. Not a medical or safety device. Never leave a child alone in a car.")
                    .font(.caption).foregroundStyle(.secondary)
                Button("Use this old iPhone or iPad as the camera") { station.stop(); onSwitch("camera") }.font(.footnote)
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
