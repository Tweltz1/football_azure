import Accelerate
import CoreML
import Foundation
import Vision

/// ToteTrack's own item namer (TinyCLIP, MIT license, trained on LVIS and Open Images photos; see
/// tools/namer). It turns a picture of one thing into an embedding, and the item whose name embedding is
/// closest wins, out of about 900 everyday tote items. The model and vocabulary are downloaded and compiled
/// by the build workflow from the latest totetrack-namer release; without them Snap uses Apple's labels only.
final class ToteNamer {
  static let shared = ToteNamer()

  /// Must match LOGIT_SCALE in tools/namer/build_namer.py.
  private let logitScale: Float = 50
  private let model: VNCoreMLModel?
  private let names: [String]
  private let dim: Int
  /// names.count x dim, row-major, each row unit length.
  private let vectors: [Float]

  private init() {
    var model: VNCoreMLModel?
    var names: [String] = []
    var dim = 0
    var vectors: [Float] = []
    if let modelURL = toteResource("ToteNamer", "mlmodelc"),
      let jsonURL = toteResource("ToteNamerItems", "json"),
      let binURL = toteResource("ToteNamerItems", "bin"),
      let json = try? JSONSerialization.jsonObject(with: Data(contentsOf: jsonURL)) as? [String: Any],
      let n = json["names"] as? [String], let d = json["dim"] as? Int,
      let halves = try? Data(contentsOf: binURL), halves.count == n.count * d * 2
    {
      do {
        let config = MLModelConfiguration()
        config.computeUnits = .all
        model = try VNCoreMLModel(for: MLModel(contentsOf: modelURL, configuration: config))
        names = n
        dim = d
        vectors = [Float](repeating: 0, count: n.count * d)
        halves.withUnsafeBytes { raw in
          vectors.withUnsafeMutableBufferPointer { out in
            var src = vImage_Buffer(
              data: UnsafeMutableRawPointer(mutating: raw.baseAddress!), height: 1, width: vImagePixelCount(n.count * d),
              rowBytes: n.count * d * 2)
            var dst = vImage_Buffer(
              data: UnsafeMutableRawPointer(out.baseAddress!), height: 1, width: vImagePixelCount(n.count * d),
              rowBytes: n.count * d * 4)
            vImageConvert_Planar16FtoPlanarF(&src, &dst, 0)
          }
        }
      } catch {
        NSLog("ToteNative: couldn't load the item namer: \(error.localizedDescription)")
        model = nil
      }
    } else {
      NSLog("ToteNative: no item namer in the app; Snap to add uses Apple's labels only")
    }
    self.model = model
    self.names = names
    self.dim = dim
    self.vectors = vectors
  }

  var available: Bool { model != nil }

  /// The best few names for a picture of one thing: (name, probability, cosine similarity).
  func name(_ image: CGImage, top: Int = 3) -> [(name: String, probability: Float, similarity: Float)] {
    look(image, top: top)?.names ?? []
  }

  /// The picture's embedding (unit length; it's how the app remembers what your own things look like)
  /// and its best few names.
  func look(_ image: CGImage, top: Int = 3) -> (embedding: [Float], names: [(name: String, probability: Float, similarity: Float)])? {
    guard let model, dim > 0 else { return nil }
    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    guard (try? VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])) != nil,
      let array = (request.results?.first as? VNCoreMLFeatureValueObservation)?.featureValue.multiArrayValue,
      array.count == dim
    else { return nil }

    var embedding = [Float](repeating: 0, count: dim)
    for i in 0..<dim { embedding[i] = array[i].floatValue }
    var norm: Float = 0
    vDSP_svesq(embedding, 1, &norm, vDSP_Length(dim))
    norm = sqrt(max(norm, 1e-12))
    var scale = 1 / norm
    vDSP_vsmul(embedding, 1, &scale, &embedding, 1, vDSP_Length(dim))

    // Cosine similarity with every name at once.
    var sims = [Float](repeating: 0, count: names.count)
    vectors.withUnsafeBufferPointer { v in
      vDSP_mmul(v.baseAddress!, 1, embedding, 1, &sims, 1, vDSP_Length(names.count), 1, vDSP_Length(dim))
    }
    let best = sims.max() ?? 0
    var total: Float = 0
    for s in sims { total += exp(logitScale * (s - best)) }
    let ranked = sims.indices.sorted { sims[$0] > sims[$1] }.prefix(top).map {
      (name: names[$0], probability: exp(logitScale * (sims[$0] - best)) / total, similarity: sims[$0])
    }
    return (embedding, Array(ranked))
  }
}

/// A file bundled with the module (models/), wherever CocoaPods put it.
func toteResource(_ name: String, _ ext: String) -> URL? {
  var bundles = [Bundle.main, Bundle(for: ToteNamer.self)]
  bundles += Bundle.allBundles + Bundle.allFrameworks
  for bundle in bundles {
    if let url = bundle.url(forResource: name, withExtension: ext) { return url }
  }
  return nil
}
