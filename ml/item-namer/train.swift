// Trains the item namer with Apple's Create ML: an image classifier on top of Apple's built-in scene
// features, so the model is small (the heavy part ships with iOS). Run on a Mac:
//   swift train.swift <crops dir> <out dir> <max iterations>
import CreateML
import CoreML
import Foundation

let args = CommandLine.arguments
guard args.count >= 4, let iterations = Int(args[3]) else {
    print("usage: swift train.swift <crops dir> <out dir> <max iterations>")
    exit(2)
}
let crops = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

var params = MLImageClassifier.ModelParameters()
params.maxIterations = iterations
params.validation = .split(strategy: .automatic)
params.featureExtractor = .scenePrint(revision: 2)
// Slight crops, rotation and blur so it copes with phone photos, not just the data set's.
params.augmentationOptions = [.crop, .rotation, .blur, .exposure, .flip]

let started = Date()
let classifier = try MLImageClassifier(trainingData: .labeledDirectories(at: crops.appendingPathComponent("train")), parameters: params)
let minutes = Int(Date().timeIntervalSince(started) / 60)
let test = classifier.evaluation(on: .labeledDirectories(at: crops.appendingPathComponent("test")))
let accuracy = (1 - test.classificationError) * 100
print("Trained in \(minutes) min")
print("Training accuracy: \((1 - classifier.trainingMetrics.classificationError) * 100)%")
print("Validation accuracy: \((1 - classifier.validationMetrics.classificationError) * 100)%")
print("Test accuracy (photos it never saw): \(accuracy)%")

let meta = MLModelMetadata(
    author: "Curbsy / ToteTrack",
    shortDescription: "Names one cropped household thing (trained on LVIS, CC BY 4.0).",
    license: "Model: ours. Training photos: LVIS (CC BY 4.0) on COCO images.",
    version: ProcessInfo.processInfo.environment["MODEL_VERSION"] ?? "1"
)
try classifier.write(to: out.appendingPathComponent("ItemNamer.mlmodel"), metadata: meta)
let report: [String: Any] = [
    "minutes": minutes, "iterations": iterations, "testAccuracy": accuracy,
    "trainingAccuracy": (1 - classifier.trainingMetrics.classificationError) * 100,
    "validationAccuracy": (1 - classifier.validationMetrics.classificationError) * 100,
]
try JSONSerialization.data(withJSONObject: report, options: .prettyPrinted).write(to: out.appendingPathComponent("metrics.json"))
