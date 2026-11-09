import ExpoModulesCore
import MapKit

// Apple Maps place search (MKLocalSearch): free, no API key, and allowed in App Store apps.
public class StoreSearchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoreSearch")

    // Places matching `query` (e.g. "Aldi") within about `radiusMeters` of a point.
    AsyncFunction("search") { (query: String, latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [[String: Any]] in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = .pointOfInterest
      request.region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        latitudinalMeters: radiusMeters * 2,
        longitudinalMeters: radiusMeters * 2
      )
      do {
        let response = try await MKLocalSearch(request: request).start()
        return response.mapItems.map { item in
          let p = item.placemark
          let address = [p.subThoroughfare, p.thoroughfare, p.locality].compactMap { $0 }.joined(separator: " ")
          return [
            "name": item.name ?? query,
            "latitude": p.coordinate.latitude,
            "longitude": p.coordinate.longitude,
            "address": address,
          ]
        }
      } catch let error as MKError where error.code == .placemarkNotFound {
        return []
      }
    }
  }
}
