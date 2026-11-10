// Trains the ToteTrack item detector with Create ML (transfer learning on Apple's ObjectPrint features).
// Usage: swift train.swift DATA_DIR OUT.mlmodel [MAX_ITERATIONS]
// DATA_DIR holds train/ and test/ from prepare_lvis.py.
import Combine
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
    // Small batches: GitHub's Mac has a virtual GPU that times out on big ones.
    batchSize: 8,
    maxIterations: iterations,
    algorithm: .transferLearning(.objectPrint(revision: 1))
)

let started = Date()
print("Training for up to \(iterations) iterations…")
// prepare_lvis.py writes pixel boxes, measured from the top left, given by their centers.
let annotationType = MLObjectDetector.AnnotationType.boundingBox(units: .pixel, origin: .topLeft, anchor: .center)
let session = MLTrainingSessionParameters(
    sessionDirectory: URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("tote-detector-session"),
    reportInterval: 50,
    checkpointInterval: 500,
    iterations: iterations
)
let job = try MLObjectDetector.train(
    trainingData: train, annotationType: annotationType, parameters: parameters, sessionParameters: session)
var outcome: Result<MLObjectDetector, Error>?
let subscription = job.result.sink(
    receiveCompletion: { if case .failure(let e) = $0 { outcome = .failure(e) } },
    receiveValue: { outcome = .success($0) })
var lastShown = -1.0
while outcome == nil {
    RunLoop.main.run(until: Date().addingTimeInterval(20))
    let done = job.progress.fractionCompleted
    if done - lastShown >= 0.01 {
        lastShown = done
        let minutes = Date().timeIntervalSince(started) / 60
        print(String(format: "%5.1f%% after %.0f min  %@", done * 100, minutes, job.progress.localizedAdditionalDescription ?? ""))
        fflush(stdout)
    }
}
subscription.cancel()
let detector = try outcome!.get()
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
