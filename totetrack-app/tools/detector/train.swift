// Trains the ToteTrack item detector with Create ML (transfer learning on Apple's ObjectPrint features).
// Usage: swift train.swift DATA_DIR OUT.mlmodel [MAX_ITERATIONS]
// DATA_DIR holds train/ and test/ from prepare_lvis.py.
import CreateML
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: swift train.swift DATA_DIR OUT.mlmodel [MAX_ITERATIONS]")
    exit(2)
}
let data = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let iterations = args.count > 3 ? Int(args[3]) ?? 2000 : 2000

let train = MLObjectDetector.DataSource.directoryWithImagesAndJsonAnnotation(at: data.appendingPathComponent("train"))
let test = MLObjectDetector.DataSource.directoryWithImagesAndJsonAnnotation(at: data.appendingPathComponent("test"))

let parameters = MLObjectDetector.ModelParameters(
    validation: .split(strategy: .automatic),
    batchSize: 32,
    maximumIterations: iterations,
    algorithm: .transferLearning(.objectPrint(revision: 1))
)

let started = Date()
print("Training for up to \(iterations) iterations…")
let detector = try MLObjectDetector(trainingData: train, parameters: parameters)
print(String(format: "Trained in %.0f minutes", Date().timeIntervalSince(started) / 60))
print("Training metrics: \(detector.trainingMetrics)")
print("Validation metrics: \(detector.validationMetrics)")

let evaluation = detector.evaluation(on: test)
print("Test metrics: \(evaluation)")

try detector.write(
    to: out,
    metadata: MLModelMetadata(
        author: "ToteTrack",
        shortDescription: "Finds everyday household and garage items in a photo of a tote.",
        license: "Trained on LVIS v1 annotations (CC BY 4.0) and COCO 2017 images.",
        version: "1"
    )
)
print("Wrote \(out.path)")
