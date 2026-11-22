import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

private let cardBackground = Color(red: 0.06, green: 0.11, blue: 0.2)
private let mint = Color(red: 0.51, green: 0.87, blue: 0.73)

private func moodColor(_ mood: BabyMood) -> Color {
    switch mood {
    case .quiet: return mint
    case .moving: return .yellow
    case .crying: return .orange
    case .offline: return .gray
    }
}

/// The baby card: CarPlay Dashboard (small family), Lock Screen (medium) and Dynamic Island.
struct BabyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BabyActivityAttributes.self) { context in
            BabyCardView(state: context.state)
                .activityBackgroundTint(cardBackground)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BabyThumb(data: context.state.thumb, size: 56)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MoodLabel(mood: context.state.mood, big: true)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Back seat · updated \(context.state.updated, style: .relative) ago")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: context.state.mood.symbol).foregroundStyle(moodColor(context.state.mood))
            } compactTrailing: {
                Text(context.state.mood.title).font(.caption2).foregroundStyle(moodColor(context.state.mood))
            } minimal: {
                Image(systemName: context.state.mood.symbol).foregroundStyle(moodColor(context.state.mood))
            }
        }
        .supplementalActivityFamilies([.small])
    }
}

struct BabyCardView: View {
    @Environment(\.activityFamily) private var family
    let state: BabyActivityAttributes.ContentState

    var body: some View {
        if family == .small {
            // CarPlay Dashboard and Apple Watch: picture + one word.
            HStack(spacing: 8) {
                BabyThumb(data: state.thumb, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    MoodLabel(mood: state.mood, big: true)
                    Text("Back seat").font(.caption2).foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
            }
            .padding(8)
        } else {
            HStack(spacing: 14) {
                BabyThumb(data: state.thumb, size: 76)
                VStack(alignment: .leading, spacing: 4) {
                    Text("BACKSEAT VIEW").font(.caption2.weight(.heavy)).foregroundStyle(.white.opacity(0.7))
                    MoodLabel(mood: state.mood, big: true)
                    Text("Updated \(state.updated, style: .relative) ago")
                        .font(.caption2).foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
            }
            .padding(14)
        }
    }
}

struct MoodLabel: View {
    let mood: BabyMood
    let big: Bool

    var body: some View {
        Label(mood.title, systemImage: mood.symbol)
            .font(big ? .headline : .caption)
            .foregroundStyle(moodColor(mood))
            .lineLimit(1)
    }
}

struct BabyThumb: View {
    let data: Data?
    let size: CGFloat

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "figure.child").font(.system(size: size * 0.45)).foregroundStyle(mint)
            }
        }
        .frame(width: size, height: size)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
}

@main
struct BackseatWidgets: WidgetBundle {
    var body: some Widget {
        BabyLiveActivity()
    }
}
