import SwiftUI
import WidgetKit
import UIKit

struct BabyImageEntry: TimelineEntry { let date: Date }

struct DemoPictureProvider: TimelineProvider {
    func placeholder(in context: Context) -> BabyImageEntry { .init(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (BabyImageEntry) -> Void) {
        completion(.init(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BabyImageEntry>) -> Void) {
        completion(Timeline(entries: [.init(date: Date())], policy: .never))
    }
}

/// Procedural raster image, bundled into widget binary. No camera image leaves the phone.
/// Testing raster image rendering in CarPlay, NOT live baby monitoring.
enum TestPicture {
    static let image: UIImage = {
        let size = CGSize(width: 350, height: 350)
        return UIGraphicsImageRenderer(size: size).image { render in
            let context = render.cgContext
            UIColor(red: 0.08, green: 0.16, blue: 0.28, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.18, green: 0.31, blue: 0.43, alpha: 1).setFill()
            UIBezierPath(roundedRect: CGRect(x: 54, y: 30, width: 242, height: 290), cornerRadius: 38).fill()
            UIColor(red: 0.51, green: 0.87, blue: 0.73, alpha: 1).setFill()
            UIBezierPath(ovalIn: CGRect(x: 135, y: 95, width: 80, height: 80)).fill()
            UIBezierPath(roundedRect: CGRect(x: 100, y: 181, width: 150, height: 115), cornerRadius: 57).fill()
            UIColor.black.withAlphaComponent(0.45).setFill()
            context.fill(CGRect(x: 0, y: 292, width: 350, height: 58))
            let attributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 25),
                .foregroundColor: UIColor.white
            ]
            ("STATIC TEST" as NSString).draw(at: CGPoint(x: 84, y: 306), withAttributes: attributes)
        }
    }()
}

struct BabyMonitorWidgetView: View {
    let entry: BabyImageEntry
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                Image(uiImage: TestPicture.image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
                Text("BACKSEAT VIEW")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(.white)
                    .shadow(radius: 4)
                    .padding(12)
            }
        }
        .containerBackground(for: .widget) { Color.black }
        .accessibilityLabel("Backseat View static test illustration, not a live image")
    }
}

struct BabyMonitorWidget: Widget {
    let kind = "BackseatViewBabyWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DemoPictureProvider()) { entry in
            BabyMonitorWidgetView(entry: entry)
        }
        .configurationDisplayName("Backseat View Photo Test")
        .description("Static raster image to test CarPlay widget compatibility. No live camera feed.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct BackseatWidgets: WidgetBundle {
    var body: some Widget {
        BabyMonitorWidget()
    }
}
