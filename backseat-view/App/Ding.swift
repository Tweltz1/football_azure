import AVFoundation

/// A short two-note ding made in code (no sound file), played on this phone.
final class Ding {
    private var player: AVAudioPlayer?
    private static let wav: Data = {
        let rate = 22_050
        var samples: [Int16] = []
        for (hz, seconds) in [(1318.5, 0.28), (987.8, 0.5)] {
            let count = Int(Double(rate) * seconds)
            for i in 0..<count {
                let t = Double(i) / Double(rate)
                let fade = exp(-t * 6) * min(1, t * 200)
                let v = (sin(2 * .pi * hz * t) + 0.3 * sin(4 * .pi * hz * t)) * fade * 0.6
                samples.append(Int16(max(-1, min(1, v)) * 32_000))
            }
        }
        var data = Data()
        func put<T: FixedWidthInteger>(_ v: T) { var x = v.littleEndian; data.append(Data(bytes: &x, count: MemoryLayout<T>.size)) }
        let body = samples.count * 2
        data.append(contentsOf: Array("RIFF".utf8)); put(UInt32(36 + body))
        data.append(contentsOf: Array("WAVEfmt ".utf8)); put(UInt32(16)); put(UInt16(1)); put(UInt16(1))
        put(UInt32(rate)); put(UInt32(rate * 2)); put(UInt16(2)); put(UInt16(16))
        data.append(contentsOf: Array("data".utf8)); put(UInt32(body))
        samples.forEach { put($0) }
        return data
    }()

    /// `times`: 1 for a gentle ding, 2 for a more urgent double ding.
    func play(times: Int = 1, volume: Float = 1) {
        guard let player = try? AVAudioPlayer(data: Self.wav) else { return }
        player.volume = volume
        player.numberOfLoops = max(0, times - 1)
        player.play()
        self.player = player
    }
}
