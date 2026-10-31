// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "RogueEngine",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "RogueEngine", targets: ["RogueEngine"])
    ],
    targets: [
        .target(name: "RogueEngine"),
        .testTarget(name: "RogueEngineTests", dependencies: ["RogueEngine"])
    ]
)
