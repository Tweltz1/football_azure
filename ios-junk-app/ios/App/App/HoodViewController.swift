import UIKit
import Capacitor
import AuthenticationServices
import CoreLocation
import Vision

// Registers the app's own native plugins with the web view.
class HoodViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NearbyPlugin())
        bridge?.registerPluginInstance(AuthSessionPlugin())
        bridge?.registerPluginInstance(TripPlugin())
        bridge?.registerPluginInstance(ItemVisionPlugin())
    }
}

// Opens GitHub/Google sign-in in Apple's sign-in sheet and hands the result back to the app
// (Google refuses sign-in inside app web views, and a plain Safari hand-off never comes back).
// JS: frontend/src/native/authSession.js
@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address),
              let scheme = call.getString("scheme") else {
            call.reject("url and scheme are required")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in was cancelled.", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed.")
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Couldn't open sign-in.")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}

// Curbsy "I'm on my way": keeps sending the phone's position to the server while someone drives over to
// pick something up, also with the screen locked or Maps in front (the web page is paused then).
// Uses "While Using the App" location only: a trip started in the app keeps going in the background,
// and iOS shows the blue location pill until it stops. The server decides when the claim ends and
// answers {"tracking": false}, which stops this.
// JS: frontend/src/junk/trip.js. Server: supabase/functions/_shared/junkClaims.ts
@objc(TripPlugin)
public class TripPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "TripPlugin"
    public let jsName = "Trip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    private var manager: CLLocationManager?
    private var url: URL?
    private var token = ""
    private var apiKey = ""
    private var minSeconds: TimeInterval = 45
    private var lastSent: Date?
    private var sending = false

    @objc func start(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address),
              let token = call.getString("token"), !token.isEmpty else {
            call.reject("url and token are required")
            return
        }
        DispatchQueue.main.async {
            self.url = url
            self.token = token
            self.apiKey = call.getString("apiKey") ?? ""
            self.minSeconds = max(15, call.getDouble("minSeconds") ?? 45)
            self.lastSent = nil
            let manager = self.manager ?? CLLocationManager()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            manager.distanceFilter = 20
            manager.activityType = .otherNavigation
            manager.pausesLocationUpdatesAutomatically = false
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
            self.manager = manager
            if manager.authorizationStatus == .notDetermined {
                manager.requestWhenInUseAuthorization()
            }
            manager.startUpdatingLocation()
            call.resolve()
        }
    }

    /** A fresh sign-in token (they last about an hour). */
    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let token = call.getString("token"), !token.isEmpty { self.token = token }
            call.resolve(["tracking": self.url != nil])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.finish()
            call.resolve()
        }
    }

    private func finish() {
        manager?.stopUpdatingLocation()
        manager?.allowsBackgroundLocationUpdates = false
        url = nil
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, let url = url, !sending else { return }
        if location.horizontalAccuracy < 0 || location.horizontalAccuracy > 500 { return }
        if let last = lastSent, Date().timeIntervalSince(last) < minSeconds { return }
        sending = true
        lastSent = Date()
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if !apiKey.isEmpty { request.setValue(apiKey, forHTTPHeaderField: "apikey") }
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "lat": location.coordinate.latitude, "lng": location.coordinate.longitude,
        ])
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.sending = false
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard status == 200, let data = data,
                      let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                self.notifyListeners("trip", data: body)
                if body["tracking"] as? Bool == false { self.finish() }
            }
        }.resume()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Keeps trying; the server releases the claim if positions stop coming for too long.
    }
}

// Curbsy item detection on the phone with Apple's Vision framework (free, no limit, nothing leaves the phone).
// Returns Vision's labels for a photo ("chair", "bicycle", ...); frontend/src/junk/appleLabels.js turns
// them into a title, category and tags.
@objc(ItemVisionPlugin)
public class ItemVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ItemVisionPlugin"
    public let jsName = "ItemVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "classify", returnType: CAPPluginReturnPromise),
    ]

    @objc func classify(_ call: CAPPluginCall) {
        guard let image = call.getString("image") else {
            call.reject("image is required")
            return
        }
        let base64 = image.components(separatedBy: ",").last ?? image
        guard let data = Data(base64Encoded: base64) else {
            call.reject("Couldn't read the photo")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNClassifyImageRequest()
            let handler = VNImageRequestHandler(data: data, options: [:])
            do {
                try handler.perform([request])
                let labels = (request.results ?? [])
                    .filter { $0.confidence >= 0.03 }
                    .sorted { $0.confidence > $1.confidence }
                    .prefix(30)
                    .map { ["label": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }
                call.resolve(["labels": Array(labels)])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
