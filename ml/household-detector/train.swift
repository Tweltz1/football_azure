// Trains the shared household-item detector with Apple's Create ML (free, part of macOS; the model is
// ours to ship in App Store apps). Run on a Mac: swift train.swift <data dir> <out dir> <max iterations>
// <data dir> holds train/ and test/ (each annotations.json plus photos, made by prepare.py) and labels.json.
import CreateML
import CoreML
import Foundation

let args = CommandLine.arguments
guard args.count >= 4, let iterations = Int(args[3]) else {
    print("usage: swift train.swift <data dir> <out dir> <max iterations>")
    exit(2)
}
let data = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

let train = MLObjectDetector.DataSource.directoryWithImagesAndJsonAnnotation(at: data.appendingPathComponent("train"))
let test = MLObjectDetector.DataSource.directoryWithImagesAndJsonAnnotation(at: data.appendingPathComponent("test"))

var params = MLObjectDetector.ModelParameters()
params.maxIterations = iterations
params.validation = .none
// Transfer learning on Apple's built-in object feature extractor: fast to train and small to ship.
params.algorithm = .transferLearning(.objectPrint(revision: 1))

let started = Date()
print("Training for up to \(iterations) iterations…")
let detector = try MLObjectDetector(trainingData: train, parameters: params,
                                    annotationType: .boundingBox(units: .pixel, origin: .topLeft, anchor: .center))
let minutes = Int(Date().timeIntervalSince(started) / 60)
print("Trained in \(minutes) min")
print("Training: \(detector.trainingMetrics)")

let metrics = detector.evaluation(on: test)
print("Test: \(metrics)")

let meta = MLModelMetadata(
    author: "Curbsy / ToteTrack",
    shortDescription: "Finds household and garage things in a photo (trained on LVIS and Open Images, CC BY).",
    license: "Model: ours. Training photos: LVIS (CC BY 4.0), Open Images (CC BY 4.0 / CC BY 2.0).",
    version: ProcessInfo.processInfo.environment["MODEL_VERSION"] ?? "1"
)
let file = out.appendingPathComponent("HouseholdDetector.mlmodel")
try detector.write(to: file, metadata: meta)
let report = [
    "minutes": "\(minutes)",
    "iterations": "\(iterations)",
    "training": "\(detector.trainingMetrics)",
    "test": "\(metrics)",
]
try JSONSerialization.data(withJSONObject: report, options: .prettyPrinted).write(to: out.appendingPathComponent("metrics.json"))
print("Wrote \(file.path)")
