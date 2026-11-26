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

/// Decides when the baby's sound is loud enough to count as "a noise", and (in "only when there's
/// a noise" mode) holds the sound back until then. Keeps the last half second so the start of the
/// noise isn't cut off. Used from the main queue only.
final class SoundGate {
    enum Sensitivity: Int, CaseIterable {
        case low, medium, high

        /// RMS loudness (0...1) of a 16 kHz chunk that counts as a noise.
        var threshold: Float {
            switch self {
            case .low: return 0.05
            case .medium: return 0.025
            case .high: return 0.012
            }
        }

        var title: String {
            switch self {
            case .low: return "Loud sounds only"
            case .medium: return "Normal"
            case .high: return "Small sounds too"
            }
        }
    }

    var sensitivity: Sensitivity = .medium
    /// How long the sound stays on after the last noise.
    var hold: TimeInterval = 8
    private(set) var lastNoise = Date.distantPast
    /// Whole seconds (since 1970) that had a noise in them, for spotting fussing.
    private var noisySeconds: [Int] = []
    private var recent: [AVAudioPCMBuffer] = []
    private var loudStreak = 0
    /// Slowly follows the room's background hum (fan, white-noise machine) so it doesn't count as noise.
    private var floor: Float = 0.004

    /// Returns true when this chunk is part of a noise.
    @discardableResult
    func listen(to buffer: AVAudioPCMBuffer) -> Bool {
        let rms = Self.loudness(buffer)
        floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.998 + rms * 0.002
        let loud = rms > max(sensitivity.threshold, floor * 3)
        // Two loud chunks in a row (about 0.2 s): one alone is usually a click or bump.
        loudStreak = loud ? loudStreak + 1 : 0
        if loudStreak >= 2 {
            lastNoise = Date()
            let second = Int(lastNoise.timeIntervalSince1970)
            if noisySeconds.last != second { noisySeconds.append(second) }
            noisySeconds.removeAll { second - $0 > 20 }
        }
        return loudStreak >= 2
    }

    var isOpen: Bool { Date().timeIntervalSince(lastNoise) < hold }

    /// Fussing: sounds in at least 4 different seconds out of the last 20, and still going.
    /// One bang or cough doesn't count; whimpering, grunting and on-and-off fussing does.
    var isFussing: Bool {
        let now = Int(Date().timeIntervalSince1970)
        guard now - Int(lastNoise.timeIntervalSince1970) < 8 else { return false }
        return noisySeconds.filter { now - $0 <= 20 }.count >= 4
    }

    /// The sound to play now in "only when there's a noise" mode.
    func pass(_ buffer: AVAudioPCMBuffer) -> [AVAudioPCMBuffer] {
        if isOpen {
            let out = recent + [buffer]
            recent.removeAll()
            return out
        }
        recent.append(buffer)
        var frames = recent.reduce(0) { $0 + Int($1.frameLength) }
        while frames > 8_000 || recent.count > 5 {
            frames -= Int(recent.removeFirst().frameLength)
        }
        return []
    }

    func reset() {
        lastNoise = .distantPast
        recent.removeAll()
        loudStreak = 0
        noisySeconds.removeAll()
        floor = 0.004
    }

    static func loudness(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
        return (sum / Float(buffer.frameLength)).squareRoot()
    }
}
