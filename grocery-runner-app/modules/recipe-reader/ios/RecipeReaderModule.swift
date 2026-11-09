import ExpoModulesCore
import UIKit
import Vision

final class PhotoOpenException: Exception {
  override var reason: String { "Could not open that photo." }
}

// Apple Vision text recognition: runs on the phone, free, works offline, needs no API key.
public class RecipeReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecipeReader")

    // Text lines in the photo at `uri` (a file:// URI). Boxes are 0...1 with the origin at the top left.
    AsyncFunction("recognizeText") { (uri: String) throws -> [[String: Any]] in
      let path = URL(string: uri)?.path ?? uri
      guard let image = UIImage(contentsOfFile: path), let cgImage = image.cgImage else {
        throw PhotoOpenException()
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["en-US"]

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: Self.orientation(image.imageOrientation))
      try handler.perform([request])

      return (request.results ?? []).compactMap { observation in
        guard let best = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return [
          "text": best.string,
          "x": Double(box.minX),
          "y": Double(1 - box.maxY),
          "width": Double(box.width),
          "height": Double(box.height),
        ]
      }
    }
  }

  private static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch o {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
