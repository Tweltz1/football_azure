import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var monitor: SnapshotMonitor
    @AppStorage("cameraAddress") private var cameraAddress = ""
    @State private var showingCameraSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(spacing: 12) {
                        Image(systemName: "car.side.rear.open")
                            .font(.system(size: 34))
                            .foregroundStyle(.mint)
                        VStack(alignment: .leading) {
                            Text("Backseat View").font(.largeTitle.bold())
                            Text("Baby camera + CarPlay widget experiment")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    preview
                    Text(monitor.status).font(.footnote).foregroundStyle(.secondary)
                    HStack(spacing: 12) {
                        Button(monitor.isRunning ? "Stop" : "Connect Camera") {
                            if monitor.isRunning { monitor.stop() }
                            else { monitor.start(cameraAddress) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!monitor.isRunning && cameraAddress.isEmpty)
                        Button("Camera Setup") { showingCameraSettings = true }
                            .buttonStyle(.bordered)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Label("CarPlay Photo Test", systemImage: "car.side")
                            .font(.headline)
                        Text("The CarPlay widget contains a STATIC demonstration picture to test whether an image appears on your vehicle's screen. It does not show the baby's camera feed or refresh every 5 seconds.")
                            .font(.subheadline)
                        Text("Open Settings → General → CarPlay → Your Vehicle → Widgets → Add Widgets on an iPhone with iOS 26 or later.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    Text("Prototype only. Never rely on this app for unattended infant safety monitoring. Secure cameras away from the child and don't operate your phone while driving.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingCameraSettings) { settings }
        }
    }

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18).fill(Color(red: 0.06, green: 0.11, blue: 0.2))
            if let image = monitor.snapshot {
                Image(uiImage: image)
                    .resizable().scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "figure.child")
                        .font(.system(size: 66))
                        .foregroundStyle(.mint)
                    Text("CAMERA PREVIEW").font(.headline).foregroundStyle(.white)
                    Text("Enter a compatible JPEG camera URL to view real snapshots.")
                        .font(.caption).foregroundStyle(.white.opacity(0.75))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
        }
        .frame(height: 260)
        .accessibilityLabel("Camera preview")
    }

    private var settings: some View {
        NavigationStack {
            Form {
                Section("Camera Snapshot URL") {
                    TextField("http://192.168.1.100/snapshot.jpg", text: $cameraAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Text("Requires a camera that supplies an HTTP(S) JPEG image. This first version does not pair with Bluetooth cameras.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Text("Live camera images appear on the iPhone only. The CarPlay widget remains a static test picture.")
                        .font(.footnote)
                }
            }
            .navigationTitle("Camera Setup")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showingCameraSettings = false }
                }
            }
        }
    }
}
