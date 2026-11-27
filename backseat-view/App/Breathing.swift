import Foundation

/// What the breathing readout sees right now (home baby phone, night view only).
/// An estimate from tiny distance changes, not a medical measurement.
enum BreathReading: Equatable {
    /// Gathering the first ~16 seconds, or just after the baby moved.
    case settling
    /// The baby (or something) is moving, so breathing can't be measured.
    case moving
    /// A steady rise and fall at about this many breaths a minute.
    case breathing(Int)
    /// Still, but no clear breathing rhythm in view.
    case unclear

    var code: String {
        switch self {
        case .settling: return "settling"
        case .moving: return "moving"
        case .breathing: return "breathing"
        case .unclear: return "unclear"
        }
    }

    var perMinute: Int? {
        if case .breathing(let n) = self { return n }
        return nil
    }
}

/// Watches the night view's depth map for the slow rise and fall of a sleeping baby's chest or
/// tummy (a few millimeters, 15 to 75 times a minute). The picture is split into small patches;
/// each patch's average distance is tracked about 10 times a second and the patch with the
/// clearest steady rhythm gives the reading. Runs on the camera queue.
final class BreathWatcher {
    /// Called on the camera queue about every 2 seconds.
    var onReading: ((BreathReading) -> Void)?

    private let columns = 10, rows = 8
    private let window = 16.0          // seconds analyzed each time
    private let sampleGap = 0.09       // about 10 samples a second
    private var patches: [[Int]] = []  // pixel indexes per patch
    private var patchDepth: [Float] = []
    private var series: [[Float]] = []
    private var times: [Double] = []
    private var lastSample = 0.0
    private var lastReport = 0.0
    private var mapWidth = 0, mapHeight = 0
    private var maskTime = 0.0
    private var recent: [Int] = []
    private var stillSince = 0.0

    func reset() {
        patches = []
        series = []
        times = []
        recent = []
    }

    /// `z` is distance in meters per pixel (0 = no reading).
    func add(_ z: [Float], width: Int, height: Int, now: Double) {
        guard now - lastSample >= sampleGap else { return }
        lastSample = now
        if width != mapWidth || height != mapHeight || patches.isEmpty {
            mapWidth = width
            mapHeight = height
            makePatches(z, now: now)
            return
        }
        // Average distance of each patch.
        var values = [Float](repeating: .nan, count: patches.count)
        var covered = 0
        for p in 0..<patches.count where !patches[p].isEmpty {
            let ref = patchDepth[p]
            var sum: Float = 0, n = 0
            for i in patches[p] {
                let v = z[i]
                if v > 0, abs(v - ref) < 0.08 { sum += v; n += 1 }
            }
            if n * 2 >= patches[p].count { values[p] = sum / Float(n); covered += 1 }
        }
        let usable = patches.filter { !$0.isEmpty }.count
        // Something big changed (baby moved, picked up, blanket pulled): start over.
        var jumped = 0
        if let last = series.last {
            for p in 0..<values.count where values[p].isFinite && last[p].isFinite {
                if abs(values[p] - last[p]) > 0.012 { jumped += 1 }
            }
        }
        if usable == 0 || covered * 3 < usable * 2 || jumped * 6 > max(usable, 1) {
            makePatches(z, now: now)
            report(.moving, now: now, force: true)
            return
        }
        series.append(values)
        times.append(now)
        while let first = times.first, now - first > window {
            times.removeFirst()
            series.removeFirst()
        }
        // Re-pick the patches every 2 minutes while still (slow drift, blanket settling).
        if now - maskTime > 120 { makePatches(z, now: now) }
        guard now - lastReport >= 2 else { return }
        guard let first = times.first, now - first >= window - 1, times.count >= 100 else {
            report(.settling, now: now)
            return
        }
        report(analyze(), now: now)
    }

    private func report(_ reading: BreathReading, now: Double, force: Bool = false) {
        guard force || now - lastReport >= 2 else { return }
        lastReport = now
        var reading = reading
        if case .breathing(let n) = reading {
            // Median of the last few readings, so one odd window doesn't jump the number.
            recent.append(n)
            if recent.count > 3 { recent.removeFirst() }
            reading = .breathing(recent.sorted()[recent.count / 2])
        } else if reading != .settling {
            recent = []
        }
        onReading?(reading)
    }

    private func makePatches(_ z: [Float], now: Double) {
        series = []
        times = []
        maskTime = now
        patches = []
        patchDepth = []
        let cw = mapWidth / columns, ch = mapHeight / rows
        guard cw > 2, ch > 2 else { return }
        for r in 0..<rows {
            for c in 0..<columns {
                var idx: [Int] = []
                var depths: [Float] = []
                for y in stride(from: r * ch, to: (r + 1) * ch, by: 2) {
                    for x in stride(from: c * cw, to: (c + 1) * cw, by: 2) {
                        let i = y * mapWidth + x
                        if z[i] > 0.15, z[i] < 2.5 { idx.append(i); depths.append(z[i]) }
                    }
                }
                guard depths.count >= 20 else { patches.append([]); patchDepth.append(0); continue }
                let mid = depths.sorted()[depths.count / 2]
                patches.append(idx.filter { abs(z[$0] - mid) < 0.06 })
                patchDepth.append(mid)
                if patches[patches.count - 1].count < 15 { patches[patches.count - 1] = [] }
            }
        }
    }

    /// Finds the patch with the clearest steady rhythm between 15 and 75 a minute.
    private func analyze() -> BreathReading {
        let n = times.count
        let t0 = times[0]
        let t = times.map { $0 - t0 }
        var best: (score: Double, hz: Double) = (0, 0)
        for p in 0..<patches.count where !patches[p].isEmpty {
            let raw = series.map { Double($0[p]) }
            guard raw.allSatisfy({ $0.isFinite }) else { continue }
            // Remove slow drift: subtract a 5-second moving average.
            var x = [Double](repeating: 0, count: n)
            var lo = 0, hi = 0, sum = 0.0
            for k in 0..<n {
                while hi < n && t[hi] <= t[k] + 2.5 { sum += raw[hi]; hi += 1 }
                while lo < n && t[lo] < t[k] - 2.5 { sum -= raw[lo]; lo += 1 }
                x[k] = raw[k] - sum / Double(hi - lo)
            }
            // Use the middle part only (the ends of the moving average are lopsided).
            let keep = x.indices.filter { t[$0] >= 2.5 && t[$0] <= t[n - 1] - 2.5 }
            guard keep.count >= 60 else { continue }
            var energy = 0.0
            for k in keep { energy += x[k] * x[k] }
            let rms = (energy / Double(keep.count)).squareRoot()
            // Breathing moves the surface roughly 0.3 to 10 mm.
            guard rms > 0.00015, rms < 0.01 else { continue }
            var power: [Double] = []
            var hz = 0.25
            while hz <= 1.25 {
                var re = 0.0, im = 0.0
                let w = 2 * Double.pi * hz
                for k in keep { re += x[k] * cos(w * t[k]); im -= x[k] * sin(w * t[k]) }
                power.append(re * re + im * im)
                hz += 0.01
            }
            guard let top = power.indices.max(by: { power[$0] < power[$1] }) else { continue }
            // About 1 for a perfect steady wave, near 0 for noise.
            let score = 2 * power[top] / (Double(keep.count) * energy)
            if score > best.score {
                var peak = Double(top)
                if top > 0 && top < power.count - 1 {
                    let a = power[top - 1], b = power[top], c = power[top + 1]
                    let d = a - 2 * b + c
                    if d < 0 { peak += 0.5 * (a - c) / d }
                }
                best = (score, 0.25 + peak * 0.01)
            }
        }
        guard best.score >= 0.35 else { return .unclear }
        return .breathing(Int((best.hz * 60).rounded()))
    }
}
