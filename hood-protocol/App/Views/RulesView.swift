import SwiftUI
import RogueEngine

/// The rules card: open it from the home screen or in the middle of a night.
struct RulesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                card("Teams", "person.3.fill") {
                    line("Crew", "Most of the room. Win by passing 5 Chill house rules, or by kicking out the Snitch.", Theme.secure)
                    line("Narcs", "A few players. Win by passing 6 Busted rules, or by getting the Snitch made Wingman once 3 Busted rules are down.", Theme.breach)
                    line("The Snitch", "One of the Narcs. Plays it cool so the Crew trusts them.", Theme.rogue)
                }
                card("Lights out", "moon.fill") {
                    Text("At the start everyone closes their eyes. The Narcs open theirs and see each other, and the Snitch puts a thumb up so the Narcs know who it is. The Snitch keeps their eyes closed, so they don't know the Narcs, except at a 5 or 6 player table where they get to look too.")
                }
                card("The deck", "rectangle.stack.fill") {
                    Text("17 house rules: 6 Chill and 11 Busted. When fewer than 3 are left, the tossed ones get shuffled back in.")
                }
                card("Each round", "arrow.triangle.2.circlepath") {
                    step(1, "The Host picks a Wingman. The last Wingman can't be picked again (and at 6+ players, neither can the last Host).")
                    step(2, "Everyone votes yes or no. More than half have to say yes.")
                    step(3, "If it passes, the Host draws 3 rules, secretly tosses 1, and hands 2 to the Wingman, who passes 1 face up.")
                    step(4, "Hosting moves to the next person around the room.")
                }
                card("Drama", "flame.fill") {
                    Text("Every vote that fails adds drama. At 3, the parents come downstairs and the top rule passes on its own, with no power.")
                }
                card("Busted powers", "bolt.fill") {
                    power(3, .scan)
                    power(4, .sensorSweep)
                    power(5, .airlock)
                    Text("The 6th Busted rule shuts the party down and the Narcs win.").font(.footnote).foregroundStyle(.secondary)
                }
                card("Bong rip", "smoke.fill") {
                    Text("The Host picks who takes the rip. Only the Host sees if that person is Crew or a Narc (it doesn't say if they're the Snitch). Everyone else just sees who got ripped, so the Host can tell the truth or lie. Nobody gets ripped twice.")
                }
                card("Veto", "hand.raised.fill") {
                    Text("After 5 Busted rules, the Wingman can ask to toss both rules. If the Host agrees, nothing passes and drama goes up by 1.")
                }
                card("Bots", "cpu") {
                    Text("Short on friends? Empty seats are filled by bots from the Hood crew.")
                }
            }
            .padding()
        }
        .background(Theme.background)
        .navigationTitle("How to play")
    }

    private func card<Content: View>(_ title: String, _ symbol: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: symbol).font(.headline).foregroundStyle(Theme.accent)
            content().font(.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func line(_ title: String, _ text: String, _ color: Color) -> some View {
        (Text(title + ": ").bold().foregroundColor(color) + Text(text))
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(number)").font(.subheadline.weight(.black)).foregroundStyle(Theme.accent).frame(width: 16)
            Text(text)
        }
    }

    private func power(_ busted: Int, _ power: Power) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(busted == 3 ? "3rd" : "\(busted)th").font(.subheadline.weight(.black)).foregroundStyle(Theme.breach).frame(width: 34, alignment: .leading)
            Image(systemName: power.symbol).frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(power.title).bold()
                Text(power.hint).foregroundStyle(.secondary)
            }
        }
    }
}
