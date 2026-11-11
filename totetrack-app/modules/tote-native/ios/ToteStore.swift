import Foundation
import StoreKit
import UIKit

/// ToteTrack Pro through Apple's StoreKit 2. Everything is checked on the phone: Apple signs each
/// transaction and StoreKit verifies it, so there's no server and no account needed to subscribe.
enum ToteStore {
  struct Failure: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  /// The subscription products as Apple has them set up (price already in the person's currency).
  static func products(_ ids: [String]) async throws -> [[String: Any]] {
    let products = try await Product.products(for: ids)
    return products.map { p in
      var out: [String: Any] = ["id": p.id, "price": p.displayPrice, "title": p.displayName, "priceValue": NSDecimalNumber(decimal: p.price).doubleValue]
      if let sub = p.subscription {
        out["period"] = unitName(sub.subscriptionPeriod)
        if let intro = sub.introductoryOffer, intro.paymentMode == .freeTrial {
          out["trial"] = periodText(intro.period)
        }
      }
      return out
    }
  }

  /// Active, verified subscriptions and purchases. expires is milliseconds since 1970, 0 when it never expires.
  static func entitlements() async -> [[String: Any]] {
    var out: [[String: Any]] = []
    for await result in Transaction.currentEntitlements {
      guard case .verified(let t) = result, t.revocationDate == nil else { continue }
      if let exp = t.expirationDate, exp < Date() { continue }
      out.append(["productId": t.productID, "expires": (t.expirationDate?.timeIntervalSince1970 ?? 0) * 1000])
    }
    return out
  }

  /// "purchased", "pending" (waiting on Ask to Buy or a bank) or "cancelled".
  static func purchase(_ id: String) async throws -> String {
    guard let product = try await Product.products(for: [id]).first else {
      throw Failure(message: "The App Store doesn't have this subscription yet.")
    }
    switch try await product.purchase() {
    case .success(.verified(let t)):
      await t.finish()
      return "purchased"
    case .success(.unverified):
      throw Failure(message: "Apple couldn't verify this purchase.")
    case .pending:
      return "pending"
    case .userCancelled:
      return "cancelled"
    @unknown default:
      return "cancelled"
    }
  }

  /// Asks the App Store for this Apple ID's purchases (Restore purchases). Apple may ask for the password.
  static func restore() async throws {
    try await AppStore.sync()
  }

  /// Apple's "Redeem code" sheet for promo (offer) codes made in App Store Connect. A redeemed code
  /// arrives through Transaction.updates, which fires onPurchasesChanged.
  @MainActor
  static func redeemCode() async throws {
    guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
      ?? UIApplication.shared.connectedScenes.first as? UIWindowScene else {
      throw Failure(message: "Couldn't open the App Store sheet.")
    }
    try await AppStore.presentOfferCodeRedeemSheet(in: scene)
  }

  /// Renewals, refunds, Ask to Buy approvals and purchases made on another device arrive here.
  static func listen(_ changed: @escaping () -> Void) -> Task<Void, Never> {
    Task.detached {
      for await result in Transaction.updates {
        if case .verified(let t) = result { await t.finish() }
        changed()
      }
    }
  }

  /// "1 week", "3 days", "1 month".
  private static func periodText(_ p: Product.SubscriptionPeriod) -> String {
    let (n, unit) = p.unit == .day && p.value % 7 == 0 ? (p.value / 7, "week") : (p.value, unitName(p))
    return "\(n) \(unit)\(n == 1 ? "" : "s")"
  }

  private static func unitName(_ p: Product.SubscriptionPeriod) -> String {
    switch p.unit {
    case .day: return "day"
    case .week: return "week"
    case .month: return "month"
    case .year: return "year"
    @unknown default: return "period"
    }
  }
}
