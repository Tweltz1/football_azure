import AppKit
import Foundation

let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.04, green: 0.06, blue: 0.12, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()
NSColor(calibratedRed: 0.75, green: 0.45, blue: 1.0, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 150, y: 150, width: 724, height: 724), xRadius: 180, yRadius: 180).fill()
let style = NSMutableParagraphStyle()
style.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 290, weight: .heavy),
  .foregroundColor: NSColor(calibratedRed: 0.04, green: 0.06, blue: 0.12, alpha: 1),
  .paragraphStyle: style
]
("SP" as NSString).draw(in: NSRect(x: 160, y: 350, width: 704, height: 340), withAttributes: attrs)
image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Unable to create icon")
}
let path = "App/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
try png.write(to: URL(fileURLWithPath: path))
print("Created " + path)
