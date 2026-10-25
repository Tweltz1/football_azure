import SwiftUI
import RogueEngine

struct HomeView: View {
    let onStart: (Int, BoardMode) -> Void

    @AppStorage("playerCount") private var playerCount = 7
    @AppStorage("randomBoard") private var randomBoard = true

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            VStack(spacing: 28) {
                Spacer()
                VStack(spacing: 8) {
                    Image(systemName: "cpu")
                        .font(.system(size: 64, weight: .bold))
                        .foregroundStyle(Theme.rogue)
                    Text("Hood Protocol")
                        .font(.largeTitle.bold())
                    Text("A saboteur is aboard. So is a rogue AI.")
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 16) {
                    Stepper(value: $playerCount, in: GameState.minPlayers...GameState.maxPlayers) {
                        Text("Crew size: \(playerCount)")
                    }
                    Text("You plus \(playerCount - 1) bots")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Toggle("Random power board", isOn: $randomBoard)
                }
                .padding()
                .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))

                Button {
                    onStart(playerCount, randomBoard ? .random : .classic)
                } label: {
                    Text("Launch mission")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)

                NavigationLink("How to play") { RulesView() }
                Spacer()
            }
            .padding(.horizontal, 24)
        }
    }
}

struct RulesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                rule("The crew", "Most players are loyal crew. Install 5 Secure protocols, or send the Rogue AI out the airlock, to win.")
                rule("The saboteurs", "A few players are saboteurs, and one is the Rogue AI. Saboteurs know each other. They win with 6 Breach protocols, or by getting the Rogue AI elected First Officer once 3 Breaches are installed.")
                rule("Each round", "The Commander nominates a First Officer and everyone votes. If the vote passes, the Commander draws 3 protocols and discards 1, then the First Officer installs 1 of the remaining 2.")
                rule("Unrest", "Every failed vote raises unrest. At 3, the station overrides and installs the top protocol on its own.")
                rule("Powers", "Some Breach slots give the Commander a power: scan a player's team, sweep the top 3 protocols, call an emergency command, or use the airlock.")
                rule("Abort", "After 5 Breaches, the First Officer can ask to abort the session if the Commander agrees. Aborting raises unrest.")
            }
            .padding()
        }
        .background(Theme.background)
        .navigationTitle("How to play")
    }

    private func rule(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.headline)
            Text(body).foregroundStyle(.secondary)
        }
    }
}
