import AVFoundation
import Foundation

/// Soft sounds the parent phone can start on the baby phone. Made on the phone (no audio files):
/// a music-box "Twinkle Twinkle" (public domain), gentle ocean waves, and plain white noise.
enum Soothing: String, Codable, CaseIterable, Identifiable {
    case lullaby, ocean, white

    var id: String { rawValue }

    var title: String {
        switch self {
        case .lullaby: return "Lullaby"
        case .ocean: return "Ocean"
        case .white: return "White noise"
        }
    }

    var symbol: String {
        switch self {
        case .lullaby: return "music.note"
        case .ocean: return "water.waves"
        case .white: return "wind"
        }
    }

    /// One seamless loop at 16 kHz mono.
    func makeBuffer() -> AVAudioPCMBuffer? {
        let rate = 16_000.0
        var samples: [Float]
        switch self {
        case .white:
            samples = (0..<Int(rate * 4)).map { _ in Float.random(in: -1...1) * 0.18 }
            // Soften the top end a little (one-pole low-pass) so it's a hush, not a hiss.
            var last: Float = 0
            for i in samples.indices { last += 0.35 * (samples[i] - last); samples[i] = last * 1.6 }
        case .ocean:
            // Pink-ish noise that swells and fades like waves; 3 waves per 18 s loop so it joins up.
            let count = Int(rate * 18)
            samples = [Float](repeating: 0, count: count)
            var b0: Float = 0, b1: Float = 0, b2: Float = 0
            for i in 0..<count {
                let white = Float.random(in: -1...1)
                b0 = 0.99765 * b0 + white * 0.0990460
                b1 = 0.96300 * b1 + white * 0.2965164
                b2 = 0.57000 * b2 + white * 1.0526913
                let pink = (b0 + b1 + b2 + white * 0.1848) * 0.05
                let t = Double(i) / rate
                let swell = 0.25 + 0.75 * pow(0.5 - 0.5 * cos(2 * .pi * t / 6), 1.5)
                samples[i] = pink * Float(swell)
            }
        case .lullaby:
            // Twinkle Twinkle Little Star as a soft music box. 1 = quarter note (0.55 s).
            let tune: [(Double, Double)] = [
                (0, 1), (0, 1), (7, 1), (7, 1), (9, 1), (9, 1), (7, 2),
                (5, 1), (5, 1), (4, 1), (4, 1), (2, 1), (2, 1), (0, 2),
                (7, 1), (7, 1), (5, 1), (5, 1), (4, 1), (4, 1), (2, 2),
                (7, 1), (7, 1), (5, 1), (5, 1), (4, 1), (4, 1), (2, 2),
                (0, 1), (0, 1), (7, 1), (7, 1), (9, 1), (9, 1), (7, 2),
                (5, 1), (5, 1), (4, 1), (4, 1), (2, 1), (2, 1), (0, 2),
            ]
            let beat = 0.55
            let total = tune.reduce(0) { $0 + $1.1 } * beat + 1.5
            samples = [Float](repeating: 0, count: Int(rate * total))
            var start = 0.0
            for (step, length) in tune {
                let freq = 523.25 * pow(2, step / 12) // C5 and up
                let first = Int(start * rate)
                let ring = Int(min(2.2, length * beat + 1.2) * rate)
                for n in 0..<ring where first + n < samples.count {
                    let t = Double(n) / rate
                    let envelope = exp(-t * 2.6) * min(1, t * 400)
                    let tone = sin(2 * .pi * freq * t) + 0.25 * sin(2 * .pi * freq * 2 * t) + 0.08 * sin(2 * .pi * freq * 3 * t)
                    samples[first + n] += Float(tone * envelope * 0.16)
                }
                start += length * beat
            }
        }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: BabySpeaker.format, frameCapacity: AVAudioFrameCount(samples.count)),
              let out = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        for i in samples.indices { out[i] = max(-1, min(1, samples[i])) }
        return buffer
    }
}

/// Parent phone -> baby phone: start/stop soothing sounds.
struct ControlMessage: Codable {
    /// nil or "off" stops the sound.
    var music: String?
    var volume: Float?
    /// Stop by itself after this many minutes (nil: keep playing).
    var minutes: Int?
}

/// Parent phone microphone for talking to the baby. 16 kHz mono 16-bit, like the baby phone's sound.
final class ParentMic {
    var onSound: ((Data) -> Void)?
    private let engine = AVAudioEngine()
    private(set) var running = false

    static func ask() async -> Bool {
        await withCheckedContinuation { done in AVAudioApplication.requestRecordPermission { done.resume(returning: $0) } }
    }

    func start() throws {
        guard !running else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0,
              let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: inFormat, to: outFormat) else { return }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: inFormat) { [weak self] buffer, _ in
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16_000 / inFormat.sampleRate) + 64
            guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: capacity) else { return }
            var fed = false
            var error: NSError?
            converter.convert(to: out, error: &error) { _, status in
                if fed { status.pointee = .noDataNow; return nil }
                fed = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, out.frameLength > 0, let channel = out.int16ChannelData?[0] else { return }
            let pcm = Data(bytes: channel, count: Int(out.frameLength) * 2)
            DispatchQueue.main.async { self?.onSound?(pcm) }
        }
        engine.prepare()
        try engine.start()
        running = true
    }

    func stop() {
        guard running else { return }
        running = false
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        // Back to plain playback for listening to the baby.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}
