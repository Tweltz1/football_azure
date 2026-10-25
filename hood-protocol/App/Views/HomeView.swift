import SwiftUI
import RogueEngine

struct HomeView: View {
    let onTable: (Table) -> Void

    @AppStorage("name") private var name = ""
    @AppStorage("look") private var look = Unlocks.sanitize(.random(), stats: Stats()).code
    @AppStorage("fallbackName") private var fallbackName = Crew.names.randomElement() ?? "Guest"
    @AppStorage("soloSeats") private var soloSeats = 7
    @State private var joiningNearby = false
    @State private var joiningOnline = false
    @State private var editingLook = false
    @State private var showingAccount = false
    @ObservedObject private var account = Account.shared

    private var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? fallbackName : String(trimmed.prefix(20))
    }

    /// You and a few of the Hood crew hanging out.
    private var homeGuests: [Guest3D] {
        [Guest3D(id: 0, look: Look(code: look), name: displayName)] +
            (0..<5).map { Guest3D(id: $0 + 1, look: Look.crew($0), name: Crew.names[$0]) }
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    Basement3DView(guests: homeGuests)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                    VStack(spacing: 6) {
                        Text("Hood Protocol").font(.largeTitle.weight(.black))
                        Text(Words.tagline).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }

                    profile

                    VStack(spacing: 10) {
                        section("Play now")
                        HStack {
                            Stepper("Seats: \(soloSeats)", value: $soloSeats, in: GameState.minPlayers...GameState.maxPlayers)
                        }
                        bigButton("Play vs bots", symbol: "person.3.fill") {
                            onTable(HostTable(name: displayName, look: look, mode: .solo, seats: soloSeats))
                        }
                    }
                    .padding()
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))

                    VStack(spacing: 10) {
                        section("Host the basement")
                        bigButton("Host nearby (no internet)", symbol: "antenna.radiowaves.left.and.right") {
                            onTable(HostTable(name: displayName, look: look, mode: .nearby))
                        }
                        bigButton("Host online", symbol: "globe") {
                            onTable(HostTable(name: displayName, look: look, mode: .online))
                        }
                        .disabled(!OnlineTransport.isAvailable)
                    }
                    .padding()
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))

                    VStack(spacing: 10) {
                        section("Join friends")
                        bigButton("Join nearby", symbol: "dot.radiowaves.left.and.right") { joiningNearby = true }
                        bigButton("Join online with a code", symbol: "number") { joiningOnline = true }
                            .disabled(!OnlineTransport.isAvailable)
                    }
                    .padding()
                    .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))

                    NavigationLink("How to play") { RulesView() }
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, 16)
            }
        }
        .sheet(isPresented: $joiningNearby) {
            NearbyJoinView(name: displayName, look: look) { table in
                joiningNearby = false
                onTable(table)
            }
        }
        .sheet(isPresented: $joiningOnline) {
            OnlineJoinView { room in
                joiningOnline = false
                onTable(GuestTable.online(name: displayName, look: look, room: room))
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $editingLook, onDismiss: syncProfile) {
            LookEditorView(code: $look)
        }
        .sheet(isPresented: $showingAccount, onDismiss: syncProfile) {
            AccountView(name: displayName, look: look)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingAccount = true } label: {
                    Image(systemName: account.isSignedIn ? "person.crop.circle.fill.badge.checkmark" : "person.crop.circle")
                }
            }
        }
    }

    private func syncProfile() {
        Task { await account.syncProfile(name: displayName, look: look) }
    }

    private var profile: some View {
        VStack(spacing: 12) {
            section("You")
            HStack(spacing: 14) {
                LookPortrait(code: look, size: 64)
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Your name (optional)", text: $name)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.words)
                        .onSubmit(syncProfile)
                    Button { editingLook = true } label: {
                        Label("Edit appearance", systemImage: "tshirt.fill").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
            Button { showingAccount = true } label: {
                HStack {
                    Image(systemName: "trophy.fill").foregroundStyle(Theme.warning)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(account.stats.games) games · \(account.stats.wins) wins").font(.subheadline.bold())
                        if let next = Unlocks.next(for: account.stats) {
                            Text("Next unlock: \(next.name) (\(next.requirement.text.lowercased()))")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Text(account.isSignedIn ? "Account" : "Sign in").font(.footnote.bold()).foregroundStyle(Theme.accentText)
                }
                .padding(10)
                .background(Theme.panel2, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding()
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    private func section(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .foregroundStyle(Theme.accentText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func bigButton(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
    }
}

/// Lists basements hosted on phones nearby.
struct NearbyJoinView: View {
    let name: String
    let look: String
    let onJoin: (Table) -> Void
    @StateObject private var player: NearbyPlayer

    init(name: String, look: String, onJoin: @escaping (Table) -> Void) {
        self.name = name
        self.look = look
        self.onJoin = onJoin
        _player = StateObject(wrappedValue: NearbyPlayer(name: name))
    }

    var body: some View {
        NavigationStack {
            List {
                if player.tables.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Looking for nearby hosts. Make sure the host tapped Host nearby.")
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(player.tables) { table in
                    Button {
                        let guest = GuestTable(name: name, look: look, playerId: UUID().uuidString, transport: player)
                        player.join(table)
                        onJoin(guest)
                    } label: {
                        VStack(alignment: .leading) {
                            Text("\(table.host)'s basement").font(.headline)
                            Text("Room \(table.room)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Join nearby")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct OnlineJoinView: View {
    let onJoin: (String) -> Void
    @State private var code = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("Enter the room code").font(.title2.bold())
            TextField("ABCD", text: $code)
                .font(.system(size: 40, weight: .black, design: .monospaced))
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .onChange(of: code) { _, value in code = RoomCode.clean(value) }
            Button("Join") { onJoin(code) }
                .buttonStyle(.borderedProminent)
                .disabled(code.count != 4)
        }
        .padding(24)
    }
}

struct RulesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                rule("The Crew", "Most players are Crew. Pass 5 Chill house rules, or kick the Snitch out of the basement, to win.")
                rule("The Narcs", "A few players are Narcs, and one of them is the Snitch. Narcs know each other. They win with 6 Busted rules, or by getting the Snitch made Wingman once 3 Busted rules have passed.")
                rule("Each round", "The Host picks a Wingman and everyone votes. If the vote passes, the Host draws 3 house rules and tosses 1, then the Wingman passes 1 of the other 2.")
                rule("Drama", "Every failed vote adds drama. At 3, the parents come downstairs and the top rule passes on its own.")
                rule("Powers", "Some Busted rules give the Host a power: a bong rip (see who someone really is), check the group chat (peek at the next 3 rules), grab the remote (pick the next Host), or kick someone out.")
                rule("Veto", "After 5 Busted rules, the Wingman can ask to toss the whole hand if the Host agrees. That adds drama.")
                rule("Bots", "Short on friends? Empty seats are filled by bots from the Hood crew.")
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
