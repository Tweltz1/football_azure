import SwiftUI

/// Setup advice for every way to use Stork View, opened from the start screen.
struct SetupGuide: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("At home") {
                    NavigationLink { GuidePage(topic: .babyPhone) } label: { Label("Baby phone", systemImage: "ear.fill") }
                    NavigationLink { GuidePage(topic: .parentPhone) } label: { Label("Parent phone", systemImage: "headphones") }
                    NavigationLink { GuidePage(topic: .nightView) } label: { Label("Night view and breathing", systemImage: "moon.stars.fill") }
                }
                Section("In the car") {
                    NavigationLink { GuidePage(topic: .tesla) } label: { Label("Tesla screen", systemImage: "bolt.car.fill") }
                    NavigationLink { GuidePage(topic: .carPlay) } label: { Label("Apple CarPlay", systemImage: "carplay") }
                    NavigationLink { GuidePage(topic: .solo) } label: { Label("Car without a screen", systemImage: "bell.fill") }
                }
                Section("Any setup") {
                    NavigationLink { GuidePage(topic: .general) } label: { Label("Permissions, battery and tips", systemImage: "checklist") }
                    NavigationLink { GuidePage(topic: .trouble) } label: { Label("If something isn't working", systemImage: "wrench.and.screwdriver.fill") }
                }
                Section {
                    Text("Stork View is not a medical or safety device. Always follow safe sleep guidance and check on your baby in person. Never leave a child alone in a car.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Setup guide")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct GuidePage: View {
    typealias Topic = GuideTopic
    
    let topic: Topic

    private var content: (title: String, need: String, steps: [String], tips: [String]) {
        switch topic {
        case .babyPhone:
            return ("Baby phone",
                    "A spare iPhone with Stork View, and a charger near the crib.",
                    ["Open Stork View and pick Baby phone. Allow the microphone (and the camera if you want the picture).",
                     "Place it 1 to 2 m (3 to 6 ft) from the crib, out of the baby's reach. Never put it in the crib or hang its cable near the crib.",
                     "Plug it in. With the camera on it uses more battery.",
                     "For the picture, aim it at the whole crib from a little above, for example on a shelf or dresser.",
                     "Pair the parent phone once (see Parent phone). After that the phones find each other by themselves.",
                     "With the camera on, tap Dark screen instead of locking. Sound only? You can lock it."],
                    ["Sound only uses the least battery and keeps going with the phone locked.",
                     "Keep it away from fans and white noise machines, which can hide small sounds.",
                     "Don't swipe Stork View closed."])
        case .parentPhone:
            return ("Parent phone",
                    "Your own iPhone with Stork View.",
                    ["Start the baby phone first.",
                     "On your phone pick Parent phone and tap the baby phone's name.",
                     "Tap Allow on the baby phone. Only the first time.",
                     "Allow notifications so crying and fussing alerts come through.",
                     "Use the gear for alert choices: crying, fussing, moving, any sound, and the Beta breathing alert.",
                     "Lock your phone any time. The Baby's room card stays on your Lock Screen."],
                    ["Both phones on the same Wi-Fi works best. Close by, they can also connect phone to phone.",
                     "After connecting once at home, you can listen away from home over the internet.",
                     "Turn your volume up and the ringer switch on."])
        case .nightView:
            return ("Night view and breathing",
                    "An iPhone with Face ID (iPhone X or newer) as the baby phone or camera.",
                    ["Turn on the camera, then Night view (Night view + breathing on the baby phone).",
                     "Night view uses the front Face ID camera, so point the screen side at the baby.",
                     "Best distance: 0.5 to 1.5 m (about 2 to 5 ft), looking down at the baby's chest from above or at an angle.",
                     "Keep blankets thin and the chest or tummy in view. The breathing number shows only when the baby is still.",
                     "The breathing readout and its alert work at home only, never in a moving car."],
                    ["It works in total darkness; no night light needed.",
                     "Shows a gray shape picture (closer is brighter), not a color photo.",
                     "The breathing number is an estimate, not a medical reading. The breathing alert is Beta, off by default, and can be wrong both ways."])
        case .tesla:
            return ("Tesla screen",
                    "One iPhone with cell data or Wi-Fi, a headrest mount and a charging cable.",
                    ["Pick Tesla camera on the iPhone.",
                     "Mount it on the back of a front headrest, facing the baby, and plug it in. Make sure the mount is tight so it can't fly loose.",
                     "In the Tesla, open the browser and go to weltzcraft.com/storkview/car.",
                     "Type the 6-digit code the iPhone shows and tap Connect, then tap Allow on the iPhone.",
                     "Tap \"Tap to start\" on the Tesla and bookmark the page. Next time it connects by itself.",
                     "Tap Dark screen on the iPhone."],
                    ["Parked: live picture. Driving: Tesla stops video, so it shows a still photo every 5 seconds.",
                     "Flip and Night view buttons show on the Tesla while parked.",
                     "Uses the iPhone's data: about 150 MB an hour while parked, much less while driving."])
        case .carPlay:
            return ("Apple CarPlay",
                    "Two iPhones: a spare one as the back-seat camera, and the driver's phone connected to CarPlay.",
                    ["On the spare iPhone pick Back-seat camera. Mount it on a front headrest facing the baby and plug it in.",
                     "On the driver's phone pick Watch the back seat and tap the camera's name. Tap Allow on the camera (first time only).",
                     "Connect the driver's phone to CarPlay. The baby card with a snapshot every few seconds shows on the CarPlay Dashboard and Lock Screen.",
                     "Tap Dark screen on the camera phone."],
                    ["CarPlay doesn't allow live video from apps, so it shows snapshots and Quiet / Moving / Crying.",
                     "No car to test with? Apple's free CarPlay Simulator app for Mac (in Xcode's Additional Tools) shows the same Dashboard with your iPhone plugged into the Mac.",
                     "The phones connect directly, like AirDrop, so no Wi-Fi or cell signal is needed."])
        case .solo:
            return ("Car without a screen",
                    "One iPhone and a mount above or facing the car seat.",
                    ["Pick Car-seat watcher.",
                     "Mount it securely where it sees the baby, and plug it in.",
                     "Choose which dings you want: crying, fussing, waking up. Tap Test the ding.",
                     "Turn the phone's volume up so you can hear it from the front seat."],
                    ["Crying and fussing come from sound, so they work while driving.",
                     "Waking up uses the camera and can be fooled by bumpy roads.",
                     "Breathing isn't checked in a car; road shake is far bigger than a baby's breathing.",
                     "The baby may hear the ding too."])
        case .general:
            return ("Permissions, battery and tips",
                    "A few minutes the first time.",
                    ["Allow Microphone, Camera, Local Network and Notifications when Stork View asks. If you said no, turn them on in Settings > Stork View.",
                     "Keep the camera or baby phone plugged in. You get a warning if its battery gets low or it gets hot.",
                     "Name each phone on the start screen so they're easy to tell apart.",
                     "Once two phones are paired, they can swap jobs any time."],
                    ["Keep Stork View open on the camera phone and use Dark screen.",
                     "If iOS closes the app, the parent phone tells you the monitor stopped."])
        case .trouble:
            return ("If something isn't working",
                    "Quick fixes to try first.",
                    ["Phones won't find each other: open Stork View on both, check both are on the same Wi-Fi or close together, and that Local Network is allowed in Settings > Stork View.",
                     "No sound: turn up the volume on the listening phone and check the baby phone's microphone permission.",
                     "Picture paused: the camera phone was locked. Open Stork View on it and use Dark screen instead.",
                     "Tesla says iPhone not connected: keep Stork View open on the iPhone with Show on a Tesla screen on, and check it has data.",
                     "Too dark: turn on Night view, or rely on sound alerts.",
                     "Still stuck: on the baby phone use Tips > Forget connected phones, then pair again."],
                    [])
        }
    }

    var body: some View {
        let c = content
        List {
            Section {
                GuideArt(topic: topic)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
            }
            Section("You need") { Text(c.need) }
            Section("Steps") {
                ForEach(Array(c.steps.enumerated()), id: \.offset) { i, step in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(i + 1)").font(.subheadline.bold()).frame(width: 22, height: 22)
                            .background(Color.accentColor.opacity(0.18), in: Circle())
                        Text(step)
                    }
                }
            }
            if !c.tips.isEmpty {
                Section("Good to know") {
                    ForEach(c.tips, id: \.self) { Text($0).foregroundStyle(.secondary) }
                }
            }
        }
        .navigationTitle(c.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

enum GuideTopic { case babyPhone, parentPhone, nightView, tesla, carPlay, solo, general, trouble }

/// Pictures for the setup guide: where things go, and what the screen looks like.
private struct GuideArt: View {
    let topic: GuideTopic

    var body: some View {
        VStack(spacing: 16) {
            switch topic {
            case .babyPhone:
                Placement(items: [("iphone", "Baby phone on a shelf"), ("bed.double.fill", "Crib")], gaps: ["1 to 2 m"])
                PhoneMock(title: "Baby phone", rows: [.picture, .pill("Connected to Parent's iPhone"), .button("Dark screen"),
                                                       .toggle("Camera", true), .toggle("Night view + breathing", false)])
            case .parentPhone:
                Placement(items: [("iphone", "Baby phone"), ("wifi", "Same Wi-Fi"), ("iphone", "Your phone")], gaps: ["", ""])
                PhoneMock(title: "Parent phone", rows: [.text("Nearby baby phones"), .listItem("Baby Phone", "Tap to connect"),
                                                         .text("Then tap Allow on the baby phone")])
            case .nightView:
                Placement(items: [("iphone", "Screen side facing down at the baby"), ("figure.child", "Baby's chest in view")], gaps: ["0.5 to 1.5 m"])
                PhoneMock(title: "Baby phone", rows: [.picture, .breath("Breathing motion: about 34 a minute"),
                                                       .toggle("Night view + breathing", true)])
            case .tesla:
                Placement(items: [("iphone", "iPhone on the headrest"), ("figure.child", "Baby"), ("bolt.car.fill", "Tesla screen")], gaps: ["faces", "internet"])
                PhoneMock(title: "Tesla camera", rows: [.toggle("Show on a Tesla screen", true), .text("1  Go to weltzcraft.com/storkview/car"),
                                                         .code("482 913"), .text("3  Tap Allow   4  Tap to start")])
            case .carPlay:
                Placement(items: [("iphone", "Camera on the headrest"), ("iphone", "Driver's phone"), ("carplay", "CarPlay")], gaps: ["direct", "cable or wireless"])
                PhoneMock(title: "CarPlay Dashboard", rows: [.card("Back seat", "Quiet for 12 min")])
            case .solo:
                Placement(items: [("iphone", "iPhone above the car seat"), ("figure.child", "Baby"), ("bell.fill", "Ding")], gaps: ["faces", ""])
                PhoneMock(title: "Car-seat watcher", rows: [.text("Ding on this phone when the baby is…"), .toggle("Crying (double ding)", true),
                                                             .toggle("Fussing", true), .toggle("Waking up (camera)", true), .button("Test the ding")])
            case .general:
                Placement(items: [("mic.fill", "Microphone"), ("video.fill", "Camera"), ("bell.badge.fill", "Notifications"), ("bolt.fill", "Plug in")], gaps: ["", "", ""])
            case .trouble:
                Placement(items: [("arrow.clockwise", "Open both apps"), ("wifi", "Same Wi-Fi"), ("checkmark.circle.fill", "Allow")], gaps: ["", ""])
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// A row of pictures with labels, joined by arrows (and an optional distance).
private struct Placement: View {
    let items: [(String, String)]
    let gaps: [String]

    var body: some View {
        HStack(alignment: .top, spacing: 4) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                VStack(spacing: 6) {
                    Image(systemName: item.0)
                        .font(.system(size: 34))
                        .foregroundStyle(Color.accentColor)
                        .frame(height: 44)
                    Text(item.1).font(.caption2).multilineTextAlignment(.center).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                if i < gaps.count {
                    VStack(spacing: 2) {
                        Image(systemName: "arrow.left.and.right").foregroundStyle(.secondary)
                        Text(gaps[i]).font(.caption2.bold()).foregroundStyle(.secondary).fixedSize()
                    }
                    .padding(.top, 14)
                }
            }
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }
}

/// A small drawing of the screen you'll see, with its main buttons.
private struct PhoneMock: View {
    enum Row {
        case picture, pill(String), button(String), toggle(String, Bool), text(String), code(String)
        case listItem(String, String), breath(String), card(String, String)
    }
    let title: String
    let rows: [Row]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption.bold()).frame(maxWidth: .infinity)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                switch row {
                case .picture:
                    RoundedRectangle(cornerRadius: 10).fill(Color(white: 0.15)).frame(height: 70)
                        .overlay(Image(systemName: "figure.child").font(.title).foregroundStyle(.gray))
                case .pill(let text):
                    Label(text, systemImage: "circle.fill").font(.caption2).foregroundStyle(.green)
                case .button(let text):
                    Text(text).font(.caption.bold()).frame(maxWidth: .infinity).padding(6)
                        .background(Color.accentColor.opacity(0.3), in: Capsule())
                case .toggle(let text, let on):
                    HStack {
                        Text(text).font(.caption)
                        Spacer()
                        Capsule().fill(on ? Color.green : Color.gray.opacity(0.4)).frame(width: 30, height: 18)
                            .overlay(Circle().fill(.white).padding(2), alignment: on ? .trailing : .leading)
                    }
                case .text(let text):
                    Text(text).font(.caption2).foregroundStyle(.secondary)
                case .code(let code):
                    Text(code).font(.system(size: 22, weight: .heavy, design: .rounded)).frame(maxWidth: .infinity)
                case .listItem(let name, let detail):
                    HStack {
                        Image(systemName: "iphone")
                        VStack(alignment: .leading) { Text(name).font(.caption.bold()); Text(detail).font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        Image(systemName: "hand.tap.fill").foregroundStyle(Color.accentColor)
                    }
                    .padding(6).background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                case .breath(let text):
                    Label(text, systemImage: "lungs.fill").font(.caption.bold()).foregroundStyle(.green)
                case .card(let place, let status):
                    HStack(spacing: 10) {
                        RoundedRectangle(cornerRadius: 6).fill(Color(white: 0.2)).frame(width: 54, height: 40)
                            .overlay(Image(systemName: "figure.child").foregroundStyle(.gray))
                        VStack(alignment: .leading) { Text(place).font(.caption.bold()); Text(status).font(.caption2) }
                        Spacer()
                        Text("😴")
                    }
                    .padding(8).background(Color(white: 0.12), in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: 260)
        .background(RoundedRectangle(cornerRadius: 22).fill(Color(.secondarySystemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.gray.opacity(0.5), lineWidth: 3))
    }
}
