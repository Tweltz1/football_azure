import SwiftUI
import RogueEngine

struct HomeView: View {
    let onTable: (Table) -> Void

    @AppStorage("name") private var name = ""
    @AppStorage("look") private var look = Look.starter().code
    @AppStorage("fallbackName") private var fallbackName = Crew.names.randomElement() ?? "Guest"
    @AppStorage("soloSeats") private var soloSeats = 7
    @State private var joiningNearby = false
    @State private var joiningOnline = false
    @State private var editingLook = false
    @State private var showingAccount = false
    @ObservedObject private var account = Account.shared

    private var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { return String(trimmed.prefix(20)) }
        return account.suggestedName.map { String($0.prefix(20)) } ?? fallbackName
    }

    /// You and a few of the Hood crew hanging out.
    private var homeGuests: [HangoutGuest] {
        [HangoutGuest(id: 0, look: Look(code: look), name: displayName)] +
            (0..<5).map { HangoutGuest(id: $0 + 1, look: Look.crew($0), name: Crew.names[$0]) }
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    HangoutView(guests: homeGuests, me: 0)
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
            AccountView(look: look)
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
                    TextField(account.suggestedName ?? "Your name (optional)", text: $name)
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
