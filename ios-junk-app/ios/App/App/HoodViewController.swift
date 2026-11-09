import UIKit
import Capacitor
import AuthenticationServices
import CoreLocation
import Vision
import CoreML

// Registers the app's own native plugins with the web view.
class HoodViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NearbyPlugin())
        bridge?.registerPluginInstance(AuthSessionPlugin())
        bridge?.registerPluginInstance(TripPlugin())
        bridge?.registerPluginInstance(ItemVisionPlugin())
        bridge?.registerPluginInstance(PhotoSafetyPlugin())
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

// Curbsy item detection on the phone (free, no limit, nothing leaves the phone), in two parts:
//  - Apple Vision's built-in classifier labels the whole photo ("chair", "trash_can", ...).
//  - A bundled object detector (YOLOv3-Tiny for Core ML, 80 common objects) finds each separate item and
//    where it is, so a photo of a curb pile can become several listings. The model file is downloaded by
//    the build (.github/workflows/junk-app.yml) and copied into public/models by add-local-plugins.js;
//    without it only the classifier runs.
// frontend/src/junk/appleLabels.js turns both into titles, categories and tags.
@objc(ItemVisionPlugin)
public class ItemVisionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ItemVisionPlugin"
    public let jsName = "ItemVision"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "classify", returnType: CAPPluginReturnPromise),
    ]

    private static let modelName = "YOLOv3Tiny"
    private static var detector: VNCoreMLModel?
    private static var detectorTried = false
    private static let lock = NSLock()

    /// Compiles the bundled model once (cached in Application Support) and keeps it loaded.
    private static func loadDetector() -> VNCoreMLModel? {
        lock.lock()
        defer { lock.unlock() }
        if detectorTried { return detector }
        detectorTried = true
        guard let source = Bundle.main.url(forResource: modelName, withExtension: "mlmodel", subdirectory: "public/models") else {
            return nil
        }
        do {
            let fm = FileManager.default
            let size = ((try? fm.attributesOfItem(atPath: source.path)[.size]) as? NSNumber)?.intValue ?? 0
            let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let compiled = dir.appendingPathComponent("\(modelName)-\(size).mlmodelc")
            if !fm.fileExists(atPath: compiled.path) {
                let temp = try MLModel.compileModel(at: source)
                try? fm.removeItem(at: compiled)
                try fm.moveItem(at: temp, to: compiled)
            }
            detector = try VNCoreMLModel(for: MLModel(contentsOf: compiled))
        } catch {
            detector = nil
        }
        return detector
    }

    /// Boxes (Vision coordinates, origin bottom left) of the separate things Apple sees in the photo.
    private static func thingBoxes(handler: VNImageRequestHandler) -> [CGRect] {
        var boxes: [CGRect] = []
        if #available(iOS 17.0, *) {
            // Each foreground object gets its own number in a mask; the box around each number is one thing.
            let instances = VNGenerateForegroundInstanceMaskRequest()
            if (try? handler.perform([instances])) != nil, let obs = instances.results?.first {
                boxes += maskBoxes(obs.instanceMask)
            }
        }
        let saliency = VNGenerateObjectnessBasedSaliencyImageRequest()
        if (try? handler.perform([saliency])) != nil,
           let obs = saliency.results?.first as? VNSaliencyImageObservation {
            boxes += (obs.salientObjects ?? []).map { $0.boundingBox }
        }
        // Not tiny specks, not the whole scene, and each thing once.
        var kept: [CGRect] = []
        for box in boxes {
            let area = box.width * box.height
            if area < 0.004 || area > 0.6 { continue }
            if kept.contains(where: { overlap($0, box) > 0.6 }) { continue }
            kept.append(box)
            if kept.count >= 10 { break }
        }
        return kept
    }

    /// Intersection over union of two boxes.
    private static func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let i = a.intersection(b)
        if i.isNull || i.isEmpty { return 0 }
        let inter = i.width * i.height
        return inter / (a.width * a.height + b.width * b.height - inter)
    }

    /// The box around each numbered object in an instance mask (one byte per pixel, 0 is background).
    private static func maskBoxes(_ mask: CVPixelBuffer) -> [CGRect] {
        CVPixelBufferLockBaseAddress(mask, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(mask) else { return [] }
        let width = CVPixelBufferGetWidth(mask), height = CVPixelBufferGetHeight(mask)
        let rowBytes = CVPixelBufferGetBytesPerRow(mask)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        var minX = [Int](repeating: Int.max, count: 256), minY = minX
        var maxX = [Int](repeating: -1, count: 256), maxY = maxX
        for y in 0..<height {
            let row = pixels + y * rowBytes
            for x in 0..<width {
                let label = Int(row[x])
                if label == 0 { continue }
                if x < minX[label] { minX[label] = x }
                if x > maxX[label] { maxX[label] = x }
                if y < minY[label] { minY[label] = y }
                if y > maxY[label] { maxY[label] = y }
            }
        }
        var boxes: [CGRect] = []
        for label in 1..<256 where maxX[label] >= 0 {
            let w = CGFloat(width), h = CGFloat(height)
            // Mask rows run top to bottom; Vision boxes start at the bottom.
            boxes.append(CGRect(x: CGFloat(minX[label]) / w, y: 1 - CGFloat(maxY[label] + 1) / h,
                                width: CGFloat(maxX[label] - minX[label] + 1) / w, height: CGFloat(maxY[label] - minY[label] + 1) / h))
        }
        return boxes
    }

    /// Each separate thing: where it is (top left origin, 0 to 1) and Apple's labels for just that part.
    private static func regions(data: Data) -> [[String: Any]] {
        let handler = VNImageRequestHandler(data: data, options: [:])
        let boxes = thingBoxes(handler: handler)
        if boxes.isEmpty { return [] }
        let requests: [VNClassifyImageRequest] = boxes.map { box in
            let request = VNClassifyImageRequest()
            // A little room around the thing helps the classifier.
            let padded = box.insetBy(dx: -box.width * 0.08, dy: -box.height * 0.08)
                .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
            request.regionOfInterest = padded
            return request
        }
        guard (try? handler.perform(requests)) != nil else { return [] }
        return zip(boxes, requests).map { box, request in
            let labels = (request.results ?? [])
                .filter { $0.confidence >= 0.05 }
                .sorted { $0.confidence > $1.confidence }
                .prefix(12)
                .map { ["label": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }
            return [
                "box": ["x": Double(box.minX), "y": Double(1 - box.maxY), "w": Double(box.width), "h": Double(box.height)],
                "labels": Array(labels),
            ]
        }
    }

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
            let classify = VNClassifyImageRequest()
            do {
                try VNImageRequestHandler(data: data, options: [:]).perform([classify])
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            let labels = (classify.results ?? [])
                .filter { $0.confidence >= 0.03 }
                .sorted { $0.confidence > $1.confidence }
                .prefix(30)
                .map { ["label": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }

            // Separate items, if the detector is in this build. Its failure never loses the labels above.
            var objects: [[String: Any]] = []
            let model = ItemVisionPlugin.loadDetector()
            if let model = model {
                let detect = VNCoreMLRequest(model: model)
                detect.imageCropAndScaleOption = .scaleFill
                if (try? VNImageRequestHandler(data: data, options: [:]).perform([detect])) != nil {
                    // Boxes come back with the origin at the bottom left; flip to top left for the web page.
                    objects = ((detect.results as? [VNRecognizedObjectObservation]) ?? [])
                        .compactMap { obs -> [String: Any]? in
                            guard let top = obs.labels.first, top.confidence >= 0.25 else { return nil }
                            let b = obs.boundingBox
                            return [
                                "label": top.identifier,
                                "confidence": Double(top.confidence),
                                "box": ["x": Double(b.minX), "y": Double(1 - b.maxY), "w": Double(b.width), "h": Double(b.height)],
                            ]
                        }
                    if objects.count > 20 { objects = Array(objects.prefix(20)) }
                }
            }
            // Any separate thing, whatever it is (the detector above only knows 80 kinds): Apple finds where the
            // things are, then names each one from its own part of the photo.
            let regions = ItemVisionPlugin.regions(data: data)
            call.resolve(["labels": Array(labels), "objects": objects, "regions": regions, "detector": model != nil])
        }
    }
}

// Free on-phone photo check before a Curbsy photo is uploaded (App Store guideline 1.2): a small explicit-image
// model (NSFWDetector by LOVOO, BSD license, ios-junk-app/models/NSFW.mlmodel) plus Apple's own photo labels,
// so the web page can refuse weapons, drugs and explicit photos. Nothing leaves the phone.
// JS: frontend/src/junk/Safety.js
@objc(PhotoSafetyPlugin)
public class PhotoSafetyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoSafetyPlugin"
    public let jsName = "PhotoSafety"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
    ]

    private static let modelName = "NSFW"
    private static var model: VNCoreMLModel?
    private static var modelTried = false
    private static let lock = NSLock()

    /// Compiles the bundled model once (cached in Application Support) and keeps it loaded.
    private static func loadModel() -> VNCoreMLModel? {
        lock.lock()
        defer { lock.unlock() }
        if modelTried { return model }
        modelTried = true
        guard let source = Bundle.main.url(forResource: modelName, withExtension: "mlmodel", subdirectory: "public/models") else {
            return nil
        }
        do {
            let fm = FileManager.default
            let size = ((try? fm.attributesOfItem(atPath: source.path)[.size]) as? NSNumber)?.intValue ?? 0
            let dir = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let compiled = dir.appendingPathComponent("\(modelName)-\(size).mlmodelc")
            if !fm.fileExists(atPath: compiled.path) {
                let temp = try MLModel.compileModel(at: source)
                try? fm.removeItem(at: compiled)
                try fm.moveItem(at: temp, to: compiled)
            }
            model = try VNCoreMLModel(for: MLModel(contentsOf: compiled))
        } catch {
            model = nil
        }
        return model
    }

    @objc func check(_ call: CAPPluginCall) {
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
            // Explicit-image score, 0 (fine) to 1 (explicit); -1 when the model isn't in this build.
            var nsfw: Double = -1
            if let model = PhotoSafetyPlugin.loadModel() {
                let request = VNCoreMLRequest(model: model)
                request.imageCropAndScaleOption = .centerCrop
                if (try? VNImageRequestHandler(data: data, options: [:]).perform([request])) != nil,
                   let results = request.results as? [VNClassificationObservation],
                   let hit = results.first(where: { $0.identifier == "NSFW" }) {
                    nsfw = Double(hit.confidence)
                }
            }
            let classify = VNClassifyImageRequest()
            try? VNImageRequestHandler(data: data, options: [:]).perform([classify])
            let labels = (classify.results ?? [])
                .filter { $0.confidence >= 0.3 }
                .sorted { $0.confidence > $1.confidence }
                .prefix(20)
                .map { ["label": $0.identifier, "confidence": Double($0.confidence)] as [String: Any] }
            call.resolve(["nsfw": nsfw, "labels": Array(labels)])
        }
    }
}
