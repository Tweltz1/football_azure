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

  public func definition() -> ModuleDefinition {
    Name("ToteNative")

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

    // Snap to inventory: what Apple's on-device Vision sees in a photo, plus any printed text.
    // Nothing leaves the phone.
    AsyncFunction("analyzePhoto") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
        guard let data = try? Data(contentsOf: url), let image = UIImage(data: data), let cgImage = image.cgImage else {
          promise.reject("E_PHOTO", "Couldn't open that photo")
          return
        }
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: cgOrientation(image.imageOrientation), options: [:])
        let classify = VNClassifyImageRequest()
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.usesLanguageCorrection = true
        do {
          try handler.perform([classify, text])
        } catch {
          promise.reject("E_VISION", error.localizedDescription)
          return
        }
        var labels: [[String: Any]] = []
        for observation in classify.results ?? [] where observation.confidence >= 0.08 {
          if observation.hasMinimumPrecision(0.5, forRecall: 0.3) || observation.confidence >= 0.3 {
            labels.append(["label": observation.identifier, "confidence": Double(observation.confidence)])
          }
          if labels.count >= 30 { break }
        }
        var lines: [String] = []
        var textInfo: [[String: Any]] = []
        for observation in text.results ?? [] {
          if let best = observation.topCandidates(1).first, best.confidence >= 0.5 {
            lines.append(best.string)
            // Height is a share of the photo (0-1): big print is usually the product name,
            // tiny print is usually legal or packaging small print.
            textInfo.append([
              "text": best.string,
              "confidence": Double(best.confidence),
              "height": Double(observation.boundingBox.height),
            ])
          }
        }
        promise.resolve(["labels": labels, "text": lines, "textInfo": textInfo, "objects": detectObjects(handler: handler, cgImage: cgImage, orientation: cgOrientation(image.imageOrientation))])
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

private func cgOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
  switch orientation {
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
private func detectObjects(handler: VNImageRequestHandler, cgImage: CGImage, orientation: CGImagePropertyOrientation) -> [[String: Any]] {
  guard let detector else { return [] }
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
      if (try? VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:]).perform([classify])) != nil {
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
