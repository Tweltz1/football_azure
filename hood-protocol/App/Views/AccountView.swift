import SwiftUI

/// Sign in or register, then see your wins, what you've unlocked, and the leaderboard.
struct AccountView: View {
    let look: String
    @AppStorage("name") private var typedName = ""
    @AppStorage("fallbackName") private var fallbackName = "Guest"
    @ObservedObject private var account = Account.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if account.isSignedIn {
                    signedIn
                } else {
                    SignInForm(fallback: name, look: look)
                }
                statsSection
                unlocksSection
                Section {
                    NavigationLink("Leaderboard") { LeaderboardView() }
                }
                if account.isSignedIn {
                    AccountActions()
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(account.isSignedIn ? "Your account" : "Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.bold() }
            }
        }
    }

    /// What you go by: the name you typed, else your Google first name, else a crew name.
    private var name: String {
        let trimmed = typedName.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { return String(trimmed.prefix(20)) }
        return account.suggestedName.map { String($0.prefix(20)) } ?? fallbackName
    }

    private var signedIn: some View {
        Section {
            HStack(spacing: 12) {
                LookPortrait(code: look, size: 52)
                VStack(alignment: .leading) {
                    Text(name).font(.headline)
                    Text(account.session?.email ?? "Signed in").font(.footnote).foregroundStyle(.secondary)
                }
            }
            TextField(account.suggestedName ?? "Your name", text: $typedName)
                .textInputAutocapitalization(.words)
                .onSubmit { Task { await account.syncProfile(name: name, look: look) } }
        } footer: {
            Text("Your wins are saved to your account, so they follow you to a new phone.")
        }
    }

    private var statsSection: some View {
        let stats = account.stats
        let rate = stats.games == 0 ? 0 : Int((Double(stats.wins) / Double(stats.games) * 100).rounded())
        return Section("Your nights") {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                stat("Games", stats.games)
                stat("Wins", stats.wins)
                stat("Win rate", rate, suffix: "%")
                stat("As Crew", stats.crewWins)
                stat("As a Narc", stats.narcWins)
                stat("As the Snitch", stats.snitchWins)
            }
            .padding(.vertical, 6)
        }
    }

    private func stat(_ title: String, _ value: Int, suffix: String = "") -> some View {
        VStack(spacing: 2) {
            Text("\(value)\(suffix)").font(.title2.weight(.black))
            Text(title).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var unlocksSection: some View {
        let stats = account.stats
        return Section("Unlocks") {
            ForEach(Unlocks.items, id: \.name) { item in
                let done = item.requirement.isMet(by: stats)
                HStack {
                    Image(systemName: done ? "checkmark.seal.fill" : "lock.fill")
                        .foregroundStyle(done ? Theme.secure : .secondary)
                    Text(item.name)
                    Spacer()
                    Text(done ? "Unlocked" : item.requirement.text).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct SignInForm: View {
    /// The name before signing in; once signed in, a typed name or the Google name wins over a crew name.
    let fallback: String
    let look: String
    @AppStorage("name") private var typedName = ""

    private var name: String {
        let trimmed = typedName.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { return String(trimmed.prefix(20)) }
        return Account.shared.suggestedName.map { String($0.prefix(20)) } ?? fallback
    }
    @State private var registering = false
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var message: String?

    private var account: Account { .shared }

    var body: some View {
        Section {
            Picker("", selection: $registering) {
                Text("Sign in").tag(false)
                Text("Register").tag(true)
            }
            .pickerStyle(.segmented)
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            SecureField(registering ? "Password (6+ characters)" : "Password", text: $password)
                .textContentType(registering ? .newPassword : .password)
            Button {
                run { try await submit() }
            } label: {
                HStack {
                    Spacer()
                    if busy { ProgressView() } else { Text(registering ? "Create account" : "Sign in").bold() }
                    Spacer()
                }
            }
            .disabled(busy || !email.contains("@") || password.count < 6)
            if !registering {
                Button("Forgot password?") {
                    run {
                        try await account.sendPasswordReset(email: email)
                        message = "Check your email for a link to reset your password."
                    }
                }
                .font(.footnote)
                .disabled(busy || !email.contains("@"))
            }
        } footer: {
            if let message { Text(message) } else { Text("Sign in to save your wins and unlocks to your account.") }
        }

        Section {
            Button {
                run {
                    try await account.signInWithGoogle()
                    await account.syncProfile(name: name, look: look)
                }
            } label: {
                HStack {
                    Spacer()
                    Image(systemName: "g.circle.fill")
                    Text("Continue with Google").bold()
                    Spacer()
                }
            }
            .disabled(busy)
        }
    }

    private func submit() async throws {
        if registering {
            switch try await account.signUp(email: email, password: password) {
            case .signedIn:
                await account.syncProfile(name: name, look: look)
            case .checkEmail:
                message = "Almost there: open the link we emailed to \(email) on this phone, then sign in."
                registering = false
            }
        } else {
            try await account.signIn(email: email, password: password)
            await account.syncProfile(name: name, look: look)
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        message = nil
        Task {
            do {
                try await work()
            } catch {
                if (error as NSError).domain != "com.apple.AuthenticationServices.WebAuthenticationSession" {
                    message = error.localizedDescription
                }
            }
            busy = false
        }
    }
}

private struct AccountActions: View {
    @State private var confirmingDelete = false
    @State private var message: String?

    var body: some View {
        Section {
            Button("Sign out") { Account.shared.signOut() }
            Button("Delete account", role: .destructive) { confirmingDelete = true }
                .confirmationDialog("Delete your Hood Protocol account?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                    Button("Delete account and stats", role: .destructive) {
                        Task {
                            do { try await Account.shared.deleteAccount() } catch { message = error.localizedDescription }
                        }
                    }
                } message: {
                    Text("Your profile, wins and unlocks are removed for good.")
                }
        } footer: {
            if let message { Text(message) }
        }
    }
}

struct LeaderboardView: View {
    @State private var rows: [Profile] = []
    @State private var error: String?
    @State private var loading = true
    @ObservedObject private var account = Account.shared

    var body: some View {
        List {
            if loading {
                ProgressView()
            } else if let error {
                Text(error).foregroundStyle(.secondary)
            } else if rows.isEmpty {
                Text("No one has finished a night yet. Be the first.").foregroundStyle(.secondary)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                HStack(spacing: 12) {
                    Text("\(index + 1)").font(.headline.monospacedDigit()).frame(width: 28)
                    LookPortrait(code: row.look, size: 36)
                    VStack(alignment: .leading) {
                        Text(row.displayName).bold()
                        Text("\(row.games) games").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(row.wins) W").font(.headline)
                }
                .listRowBackground(row.userId == account.session?.userId ? Theme.accent.opacity(0.18) : Theme.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.background)
        .navigationTitle("Leaderboard")
        .task {
            do { rows = try await account.leaderboard() } catch { self.error = "The leaderboard isn't available yet." }
            loading = false
        }
        .refreshable {
            if let fresh = try? await account.leaderboard() { rows = fresh }
        }
    }
}
