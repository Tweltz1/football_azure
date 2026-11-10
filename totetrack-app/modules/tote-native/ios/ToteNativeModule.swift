import CoreML
import CoreSpotlight
import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers
import UserNotifications
import Vision

private let spotlightDomain = "totes"
private let reminderPrefix = "totetrack."

/// Tote opened from a Spotlight result before the JavaScript side was listening (cold launch).
var pendingSpotlightToteId: String?

public class ToteNativeModule: Module {
  private let nfc = ToteNFC()
  private var storeUpdates: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("ToteNative")

    // ToteTrack Pro (StoreKit 2). JavaScript re-checks the subscription when this fires.
    Events("onPurchasesChanged")

    OnCreate {
      self.storeUpdates = ToteStore.listen { [weak self] in
        self?.sendEvent("onPurchasesChanged", [:])
      }
    }

    OnDestroy {
      self.storeUpdates?.cancel()
    }

    AsyncFunction("storeProducts") { (ids: [String], promise: Promise) in
      Task {
        do { promise.resolve(try await ToteStore.products(ids)) } catch { promise.reject("E_STORE", error.localizedDescription) }
      }
    }

    AsyncFunction("storeEntitlements") { (promise: Promise) in
      Task { promise.resolve(await ToteStore.entitlements()) }
    }

    AsyncFunction("storePurchase") { (id: String, promise: Promise) in
      Task {
        do { promise.resolve(try await ToteStore.purchase(id)) } catch { promise.reject("E_STORE", error.localizedDescription) }
      }
    }

    AsyncFunction("storeRestore") { (promise: Promise) in
      Task {
        do {
          try await ToteStore.restore()
          promise.resolve(await ToteStore.entitlements())
        } catch {
          promise.reject("E_STORE", error.localizedDescription)
        }
      }
    }

    Function("nfcAvailable") { () -> Bool in
      ToteNFC.available
    }

    /// Resolves true when written, null if cancelled.
    AsyncFunction("writeNfc") { (url: String, promise: Promise) in
      self.nfc.start(writing: url, promise: promise)
    }.runOnQueue(.main)

    /// Resolves the link on the sticker, or null if cancelled.
    AsyncFunction("readNfc") { (promise: Promise) in
      self.nfc.start(writing: nil, promise: promise)
    }.runOnQueue(.main)

    // Snap to inventory: finds the separate things in a photo and names each one with Apple's
    // on-device Vision, and reads printed text. Nothing leaves the phone.
    AsyncFunction("analyzePhoto") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
        guard let data = try? Data(contentsOf: url), let original = UIImage(data: data), let image = uprightImage(original, maxSide: 1600) else {
          promise.reject("E_PHOTO", "Couldn't open that photo")
          return
        }
        promise.resolve(analyze(image))
      }
    }

    // Spotlight: makes every tote and its items findable from iPhone search.
    AsyncFunction("indexTotes") { (totes: [[String: Any]], promise: Promise) in
      let items: [CSSearchableItem] = totes.compactMap { tote in
        guard let id = tote["id"] as? String else { return nil }
        let attributes = CSSearchableItemAttributeSet(contentType: UTType.text)
        attributes.title = tote["title"] as? String
        attributes.contentDescription = tote["description"] as? String
        attributes.keywords = tote["keywords"] as? [String]
        return CSSearchableItem(uniqueIdentifier: id, domainIdentifier: spotlightDomain, attributeSet: attributes)
      }
      let index = CSSearchableIndex.default()
      index.deleteSearchableItems(withDomainIdentifiers: [spotlightDomain]) { _ in
        if items.isEmpty {
          promise.resolve(nil)
          return
        }
        index.indexSearchableItems(items) { error in
          if let error {
            promise.reject("E_SPOTLIGHT", error.localizedDescription)
          } else {
            promise.resolve(nil)
          }
        }
      }
    }

    Function("consumeSpotlightTote") { () -> String? in
      let id = pendingSpotlightToteId
      pendingSpotlightToteId = nil
      return id
    }

    // Local reminders (no server, no push): seasons coming up and items expiring.
    AsyncFunction("notificationStatus") { (promise: Promise) in
      UNUserNotificationCenter.current().getNotificationSettings { settings in
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: promise.resolve("granted")
        case .denied: promise.resolve("denied")
        default: promise.resolve("undetermined")
        }
      }
    }

    AsyncFunction("requestNotifications") { (promise: Promise) in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        promise.resolve(granted)
      }
    }

    /// Replaces all of ToteTrack's scheduled reminders. Each one: id, title, body, at (ms since 1970), toteId.
    AsyncFunction("scheduleReminders") { (reminders: [[String: Any]], promise: Promise) in
      let center = UNUserNotificationCenter.current()
      center.getPendingNotificationRequests { pending in
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(reminderPrefix) })
        let now = Date()
        for reminder in reminders.prefix(60) {
          guard let id = reminder["id"] as? String, let at = reminder["at"] as? Double else { continue }
          let date = Date(timeIntervalSince1970: at / 1000)
          if date <= now { continue }
          let content = UNMutableNotificationContent()
          content.title = reminder["title"] as? String ?? "ToteTrack"
          content.body = reminder["body"] as? String ?? ""
          content.sound = .default
          if let toteId = reminder["toteId"] as? String {
            content.userInfo = ["toteId": toteId]
          }
          let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
          let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
          center.add(UNNotificationRequest(identifier: reminderPrefix + id, content: content, trigger: trigger))
        }
        promise.resolve(nil)
      }
    }
  }
}

/// Redraws the photo upright (camera photos carry a rotation flag) and no bigger than maxSide.
private func uprightImage(_ image: UIImage, maxSide: CGFloat) -> CGImage? {
  let scale = min(1, maxSide / max(image.size.width, image.size.height))
  let size = CGSize(width: floor(image.size.width * scale), height: floor(image.size.height * scale))
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  return UIGraphicsImageRenderer(size: size, format: format).image { _ in
    image.draw(in: CGRect(origin: .zero, size: size))
  }.cgImage
}

/// Vision's normalized rect (origin bottom-left) to a pixel rect (origin top-left), padded a little.
private func pixelRect(_ r: CGRect, width: Int, height: Int, pad: CGFloat = 0.06) -> CGRect {
  let w = CGFloat(width), h = CGFloat(height)
  var rect = CGRect(x: r.minX * w, y: (1 - r.maxY) * h, width: r.width * w, height: r.height * h)
  rect = rect.insetBy(dx: -rect.width * pad, dy: -rect.height * pad)
  return rect.intersection(CGRect(x: 0, y: 0, width: w, height: h)).integral
}

/// Boxes around the separate objects in the photo: Apple's foreground-object finder (iOS 17+),
/// the "objectness" saliency boxes, and a few overlapping tiles as a fallback.
private func objectRegions(_ image: CGImage) -> [CGRect] {
  let width = image.width, height = image.height
  var regions: [CGRect] = []
  let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])

  if #available(iOS 17.0, *) {
    let instances = VNGenerateForegroundInstanceMaskRequest()
    if (try? handler.perform([instances])) != nil, let result = instances.results?.first {
      let mask = result.instanceMask
      CVPixelBufferLockBaseAddress(mask, .readOnly)
      if let base = CVPixelBufferGetBaseAddress(mask) {
        let mw = CVPixelBufferGetWidth(mask), mh = CVPixelBufferGetHeight(mask)
        let stride = CVPixelBufferGetBytesPerRow(mask)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        var boxes: [Int: (Int, Int, Int, Int)] = [:]
        for y in 0..<mh {
          for x in 0..<mw {
            let label = Int(pixels[y * stride + x])
            if label == 0 { continue }
            if let b = boxes[label] {
              boxes[label] = (min(b.0, x), min(b.1, y), max(b.2, x), max(b.3, y))
            } else {
              boxes[label] = (x, y, x, y)
            }
          }
        }
        for (_, b) in boxes {
          let r = CGRect(
            x: CGFloat(b.0) / CGFloat(mw), y: 1 - CGFloat(b.3 + 1) / CGFloat(mh),
            width: CGFloat(b.2 - b.0 + 1) / CGFloat(mw), height: CGFloat(b.3 - b.1 + 1) / CGFloat(mh))
          if r.width * r.height > 0.01 { regions.append(pixelRect(r, width: width, height: height)) }
        }
      }
      CVPixelBufferUnlockBaseAddress(mask, .readOnly)
    }
  }

  let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()
  if (try? handler.perform([saliency])) != nil {
    for object in (saliency.results?.first?.salientObjects ?? []).prefix(6) where object.boundingBox.width * object.boundingBox.height > 0.01 {
      regions.append(pixelRect(object.boundingBox, width: width, height: height))
    }
  }

  // Overlapping 2x2 tiles (each 60% of the photo) so smaller things in a cluttered tote get a look too.
  for (x, y) in [(0.0, 0.0), (0.4, 0.0), (0.0, 0.4), (0.4, 0.4)] {
    regions.append(pixelRect(CGRect(x: x, y: y, width: 0.6, height: 0.6), width: width, height: height, pad: 0))
  }
  // A finer 3x3 grid (each 40%) for small things like batteries and markers.
  for x in [0.0, 0.3, 0.6] {
    for y in [0.0, 0.3, 0.6] {
      regions.append(pixelRect(CGRect(x: x, y: y, width: 0.4, height: 0.4), width: width, height: height, pad: 0))
    }
  }
  return Array(regions.filter { $0.width >= 64 && $0.height >= 64 }.prefix(28))
}

private func analyze(_ image: CGImage) -> [String: Any] {
  // Name the whole photo, then each region. A thing seen clearly in any region counts.
  var best: [String: (confidence: Float, regions: Int, whole: Bool)] = [:]
  func classify(_ cg: CGImage, whole: Bool) {
    let request = VNClassifyImageRequest()
    guard (try? VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:]).perform([request])) != nil else { return }
    for o in request.results ?? [] where o.confidence >= 0.12 {
      let prev = best[o.identifier]
      best[o.identifier] = (max(prev?.confidence ?? 0, o.confidence), (prev?.regions ?? 0) + 1, (prev?.whole ?? false) || whole)
    }
  }
  classify(image, whole: true)
  let regions = objectRegions(image)
  // Apple's labels on the bigger regions only; the namer looks at all of them.
  for rect in regions.prefix(16) {
    if let crop = image.cropping(to: rect) { classify(crop, whole: false) }
  }
  let labels: [[String: Any]] = best
    .sorted { $0.value.confidence > $1.value.confidence }
    .prefix(40)
    .map { ["label": $0.key, "confidence": Double($0.value.confidence), "regions": $0.value.regions, "whole": $0.value.whole] }

  // Printed text, with where each line sits so nearby lines can be joined into phrases.
  let text = VNRecognizeTextRequest()
  text.recognitionLevel = .accurate
  text.usesLanguageCorrection = true
  try? VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([text])
  var lines: [[String: Any]] = []
  for observation in text.results ?? [] {
    guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.4 else { continue }
    let b = observation.boundingBox
    lines.append([
      "text": candidate.string, "confidence": Double(candidate.confidence),
      "x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height),
    ])
  }
  let objects = detectObjects(image)
  let naming = nameItems(image, regions: regions, objects: objects)
  return [
    "labels": labels, "lines": lines, "text": lines.map { $0["text"] as! String }, "objects": objects,
    "named": naming.named, "looks": naming.looks,
  ]
}

// MARK: - Naming each thing with ToteTrack's own namer

/// Runs the namer on every region and every detected object. Each name keeps its best probability, how
/// many separate spots it was the top answer for, and the embedding of its best spot. Also returns every
/// spot's embedding, so the app can match spots against what your own things look like.
private func nameItems(_ image: CGImage, regions: [CGRect], objects: [[String: Any]]) -> (named: [[String: Any]], looks: [[Double]]) {
  guard ToteNamer.shared.available else { return ([], []) }
  var rects = regions
  for o in objects {
    if let b = o["box"] as? [String: Double] {
      let r = CGRect(x: b["x"] ?? 0, y: b["y"] ?? 0, width: b["width"] ?? 0, height: b["height"] ?? 0)
      rects.append(pixelRect(r, width: image.width, height: image.height, pad: 0.1))
    }
  }
  var best: [String: (probability: Float, similarity: Float, spots: Int, embedding: [Float])] = [:]
  var looks: [[Double]] = []
  let rounded = { (v: [Float]) in v.map { (Double($0) * 1000).rounded() / 1000 } }
  for rect in rects where rect.width >= 48 && rect.height >= 48 {
    guard let crop = image.cropping(to: rect), let look = ToteNamer.shared.look(crop, top: 1), let top = look.names.first else { continue }
    looks.append(rounded(look.embedding))
    let prev = best[top.name]
    let better = top.probability > (prev?.probability ?? -1)
    best[top.name] = (
      max(prev?.probability ?? 0, top.probability), max(prev?.similarity ?? 0, top.similarity), (prev?.spots ?? 0) + 1,
      better ? look.embedding : prev!.embedding
    )
  }
  let named: [[String: Any]] = best.sorted { $0.value.probability > $1.value.probability }.prefix(20).map {
    [
      "name": $0.key, "confidence": Double($0.value.probability), "similarity": Double($0.value.similarity),
      "spots": $0.value.spots, "embedding": rounded($0.value.embedding),
    ]
  }
  return (named, looks)
}

// MARK: - Finding each separate item (on-device object detection)

/// Apple's free YOLOv3 Tiny Core ML model, downloaded and compiled by the build workflow. It finds
/// and outlines each separate object it knows (about 80 common kinds), so a box of stuff can come
/// back as "Bowl", "Cup", "Scissors" instead of one guess for the whole photo.
private let detectorName = "YOLOv3TinyInt8LUT"

private let detector: VNCoreMLModel? = {
  let config = MLModelConfiguration()
  config.computeUnits = .all
  for url in detectorURLs() {
    do {
      let compiled = url.pathExtension == "mlmodelc" ? url : try MLModel.compileModel(at: url)
      return try VNCoreMLModel(for: MLModel(contentsOf: compiled, configuration: config))
    } catch {
      NSLog("ToteNative: couldn't load \(url.lastPathComponent): \(error.localizedDescription)")
    }
  }
  NSLog("ToteNative: no object detection model in the app; Snap to add uses whole-photo labels only")
  return nil
}()

private func detectorURLs() -> [URL] {
  var bundles = [Bundle.main, Bundle(for: ToteNativeModule.self)]
  bundles += Bundle.allBundles + Bundle.allFrameworks
  var urls: [URL] = []
  for bundle in bundles {
    for ext in ["mlmodelc", "mlmodel"] {
      if let url = bundle.url(forResource: detectorName, withExtension: ext), !urls.contains(url) {
        urls.append(url)
      }
    }
  }
  return urls
}

/// Each object found: what it is, how sure the model is, where it is (0-1, origin bottom-left),
/// and up to 5 more specific names from Apple's classifier looking at just that spot.
private func detectObjects(_ cgImage: CGImage) -> [[String: Any]] {
  guard let detector else { return [] }
  let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
  let request = VNCoreMLRequest(model: detector)
  request.imageCropAndScaleOption = .scaleFill
  do {
    try handler.perform([request])
  } catch {
    NSLog("ToteNative: object detection failed: \(error.localizedDescription)")
    return []
  }
  let found = (request.results as? [VNRecognizedObjectObservation] ?? [])
    .filter { ($0.labels.first?.confidence ?? 0) >= 0.25 }
    .sorted { $0.confidence > $1.confidence }
    .prefix(12)

  var objects: [[String: Any]] = []
  for observation in found {
    guard let top = observation.labels.first else { continue }
    let box = observation.boundingBox
    var refined: [[String: Any]] = []
    // Look closer at just this object for a more specific name ("mug" rather than "cup").
    if box.width * box.height >= 0.01 {
      let classify = VNClassifyImageRequest()
      classify.regionOfInterest = box.insetBy(dx: -box.width * 0.05, dy: -box.height * 0.05)
        .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      if (try? VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:]).perform([classify])) != nil {
        for c in (classify.results ?? []).prefix(5) where c.confidence >= 0.2 {
          refined.append(["label": c.identifier, "confidence": Double(c.confidence)])
        }
      }
    }
    objects.append([
      "label": top.identifier,
      "confidence": Double(top.confidence),
      "box": ["x": Double(box.minX), "y": Double(box.minY), "width": Double(box.width), "height": Double(box.height)],
      "refined": refined,
    ])
  }
  return objects
}
