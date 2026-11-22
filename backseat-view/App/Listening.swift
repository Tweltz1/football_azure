import AVFoundation
import CoreImage
import SoundAnalysis

/// Works out Quiet / Moving / Crying on the driver's phone from the picture and sound it receives,
/// so any camera (the mini camera or an old iPhone/iPad) gets the same alerts.
final class BabyWatcher {
    var onCry: ((Double) -> Void)?
    var onPicture: ((_ motion: Double, _ brightness: Double) -> Void)?

    private let soundQueue = DispatchQueue(label: "backseat.ears")
    private let pictureQueue = DispatchQueue(label: "backseat.eyes")
    private let listener = CryListener()
    private var analyzer: SNAudioStreamAnalyzer?
    private var position: AVAudioFramePosition = 0
    private let ci = CIContext(options: [.cacheIntermediates: false])
    private var lastGrid: [Double] = []
    private var busy = false

    init(format: AVAudioFormat) {
        let analyzer = SNAudioStreamAnalyzer(format: format)
        if let request = try? SNClassifySoundRequest(classifierIdentifier: .version1) {
            try? analyzer.add(request, withObserver: listener)
        }
        self.analyzer = analyzer
        listener.onScore = { [weak self] score in self?.onCry?(score) }
    }

    func hear(_ buffer: AVAudioPCMBuffer) {
        soundQueue.async { [weak self] in
            guard let self, let analyzer = self.analyzer else { return }
            analyzer.analyze(buffer, atAudioFramePosition: self.position)
            self.position += AVAudioFramePosition(buffer.frameLength)
        }
    }

    func look(at jpeg: Data) {
        guard !busy else { return }
        busy = true
        pictureQueue.async { [weak self] in
            guard let self else { return }
            defer { self.busy = false }
            guard var image = CIImage(data: jpeg) else { return }
            image = image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
            let width = image.extent.width, height = image.extent.height
            guard width > 0, height > 0 else { return }
            let tiny = image.transformed(by: CGAffineTransform(scaleX: 32 / width, y: 24 / height))
            var rgba = [UInt8](repeating: 0, count: 32 * 24 * 4)
            self.ci.render(tiny, toBitmap: &rgba, rowBytes: 32 * 4, bounds: CGRect(x: 0, y: 0, width: 32, height: 24),
                           format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
            var grid = [Double]()
            grid.reserveCapacity(32 * 24)
            for i in stride(from: 0, to: rgba.count, by: 4) {
                grid.append((0.3 * Double(rgba[i]) + 0.59 * Double(rgba[i + 1]) + 0.11 * Double(rgba[i + 2])) / 255)
            }
            let mean = grid.reduce(0, +) / Double(grid.count)
            var motion = 0.0
            if self.lastGrid.count == grid.count {
                // Overall brightness changes (streetlights, tunnels) are taken out first.
                let lastMean = self.lastGrid.reduce(0, +) / Double(self.lastGrid.count)
                var diff = 0.0
                for i in 0..<grid.count { diff += abs((grid[i] - mean) - (self.lastGrid[i] - lastMean)) }
                motion = diff / Double(grid.count)
            }
            self.lastGrid = grid
            self.onPicture?(motion, mean)
        }
    }
}
