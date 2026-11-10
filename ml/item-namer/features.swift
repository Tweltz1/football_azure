// Item namer, step 1: Apple's image feature print (Vision, built into iOS 17+ and macOS 14+) for every
// training crop. A picture Vision can't read is skipped and counted instead of crashing the whole run
// (Create ML's own image classifier crashed twice on this data set with a 0x0 picture error).
//   swift features.swift <crops dir> <out dir>
// Writes <out>/features.f32 (float32, one row per picture) and <out>/index.json ([split, label] per row).
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: swift features.swift <crops dir> <out dir>"); exit(2) }
let crops = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

var files: [(String, String, URL)] = []
for split in ["train", "test"] {
    let dir = crops.appendingPathComponent(split)
    for label in (try? FileManager.default.contentsOfDirectory(atPath: dir.path))?.sorted() ?? [] where !label.hasPrefix(".") {
        let ld = dir.appendingPathComponent(label)
        for f in (try? FileManager.default.contentsOfDirectory(atPath: ld.path))?.sorted() ?? [] where f.hasSuffix(".jpg") {
            files.append((split, label, ld.appendingPathComponent(f)))
        }
    }
}
print("pictures: \(files.count)"); fflush(stdout)

// Feature prints from an earlier run (restored from the Actions cache) are reused by file path, so only
// new pictures (for example name fixes from the apps) are read again.
var previous: [String: [Float]] = [:]
if let idx = try? JSONSerialization.jsonObject(with: Data(contentsOf: out.appendingPathComponent("index.json"))) as? [[String]],
   let blob = try? Data(contentsOf: out.appendingPathComponent("features.f32")), !idx.isEmpty, idx[0].count >= 3 {
    let dims = blob.count / 4 / idx.count
    blob.withUnsafeBytes { raw in
        let all = raw.bindMemory(to: Float.self)
        for (k, row) in idx.enumerated() { previous[row[2]] = Array(all[(k * dims)..<((k + 1) * dims)]) }
    }
    print("feature prints kept from the last run: \(previous.count)"); fflush(stdout)
}
func key(_ f: (String, String, URL)) -> String { "\(f.0)/\(f.1)/\(f.2.lastPathComponent)" }

var rows = [[Float]?](repeating: nil, count: files.count)
let lock = NSLock()
var done = 0, failed = 0
let started = Date()
let workers = max(2, ProcessInfo.processInfo.activeProcessorCount)
DispatchQueue.concurrentPerform(iterations: workers) { w in
    var k = w
    while k < files.count {
        if let kept = previous[key(files[k])] {
            lock.lock(); rows[k] = kept; done += 1; lock.unlock()
            k += workers
            continue
        }
        autoreleasepool {
            var row: [Float]? = nil
            let req = VNGenerateImageFeaturePrintRequest()
            req.revision = VNGenerateImageFeaturePrintRequestRevision2
            req.imageCropAndScaleOption = .scaleFill
            do {
                try VNImageRequestHandler(url: files[k].2, options: [:]).perform([req])
                if let obs = req.results?.first as? VNFeaturePrintObservation, obs.elementType == .float, obs.elementCount > 0 {
                    row = obs.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
                }
            } catch {}
            lock.lock()
            rows[k] = row
            done += 1
            if row == nil { failed += 1 }
            if done % 2000 == 0 {
                print("  \(done)/\(files.count) (\(Int(Date().timeIntervalSince(started)))s, \(failed) skipped)"); fflush(stdout)
            }
            lock.unlock()
        }
        k += workers
    }
}

// Every row must be the same length (revision 2 gives 768 numbers); anything else is skipped.
var counts: [Int: Int] = [:]
for row in rows { if let row { counts[row.count, default: 0] += 1 } }
let dims = counts.max { $0.value < $1.value }?.key ?? 0
print("feature length: \(dims)")
var data = Data()
var index: [[String]] = []
for (k, row) in rows.enumerated() {
    guard let row, row.count == dims else { continue }
    row.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }
    index.append([files[k].0, files[k].1, key(files[k])])
}
try data.write(to: out.appendingPathComponent("features.f32"))
try JSONSerialization.data(withJSONObject: index).write(to: out.appendingPathComponent("index.json"))
print("feature prints: \(index.count) (\(failed) pictures skipped) in \(Int(Date().timeIntervalSince(started)))s")
