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
  public func definition() -> ModuleDefinition {
    Name("ToteNative")

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
        for observation in text.results ?? [] {
          if let best = observation.topCandidates(1).first, best.confidence >= 0.5 {
            lines.append(best.string)
          }
        }
        promise.resolve(["labels": labels, "text": lines])
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
