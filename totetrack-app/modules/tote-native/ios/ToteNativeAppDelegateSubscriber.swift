import CoreSpotlight
import ExpoModulesCore
import UIKit

/// Opens the right tote when a ToteTrack result is tapped in iPhone (Spotlight) search.
public class ToteNativeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == CSSearchableItemActionType,
      let id = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String
    else {
      return false
    }
    // Cold launch: JavaScript picks this up with consumeSpotlightTote(). Warm: React Native's
    // Linking hears the URL right away (the same trick expo-router uses for Spotlight).
    pendingSpotlightToteId = id
    NotificationCenter.default.post(
      name: NSNotification.Name(rawValue: "RCTOpenURLNotification"),
      object: self,
      userInfo: ["url": "totetrack://tote/\(id)"]
    )
    return true
  }
}
