import Foundation
import UIKit

/// iPhone-only JPEG polling. No background monitoring or CarPlay live feed.
@MainActor
final class SnapshotMonitor: ObservableObject {
    @Published private(set) var snapshot: UIImage?
    @Published private(set) var status = "Not connected"
    @Published private(set) var isRunning = false

    private var worker: Task<Void, Never>?

    func start(_ rawAddress: String) {
        stop()
        guard let url = URL(string: rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil else {
            status = "Enter a valid HTTP(S) JPEG snapshot URL."
            return
        }
        isRunning = true
        status = "Connecting..."
        worker = Task {
            while !Task.isCancelled {
                do {
                    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
                    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
                    let (data, response) = try await URLSession.shared.data(for: request)
                    guard (response as? HTTPURLResponse)?.statusCode == 200,
                          let image = UIImage(data: data) else {
                        throw URLError(.cannotDecodeContentData)
                    }
                    if Task.isCancelled { break }
                    snapshot = image
                    status = "Snapshot updated at " + Date().formatted(date: .omitted, time: .standard)
                } catch {
                    if Task.isCancelled { break }
                    status = "Camera unavailable: " + error.localizedDescription
                }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func stop() {
        worker?.cancel()
        worker = nil
        isRunning = false
        status = "Not connected"
    }
}
