using System;
using System.Collections.Generic;

public static class NflByeWeeks
{
    private static readonly Dictionary<string, int> ByTeam = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
    {
        ["ARI"] = 14,
        ["ATL"] = 11,
        ["BAL"] = 13,
        ["BUF"] = 7,
        ["CAR"] = 5,
        ["CHI"] = 10,
        ["CIN"] = 6,
        ["CLE"] = 11,
        ["DAL"] = 14,
        ["DEN"] = 10,
        ["DET"] = 6,
        ["GB"] = 11,
        ["HOU"] = 8,
        ["IND"] = 13,
        ["JAX"] = 7,
        ["KC"] = 5,
        ["LAC"] = 7,
        ["LAR"] = 11,
        ["LV"] = 13,
        ["MIA"] = 6,
        ["MIN"] = 6,
        ["NE"] = 11,
        ["NO"] = 8,
        ["NYG"] = 8,
        ["NYJ"] = 13,
        ["PHI"] = 10,
        ["PIT"] = 9,
        ["SEA"] = 11,
        ["SF"] = 8,
        ["TB"] = 10,
        ["TEN"] = 9,
        ["WAS"] = 7,
    };

    private static readonly Dictionary<string, string> TeamAliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["WSH"] = "WAS",
        ["JAC"] = "JAX",
    };

    public static bool IsKnownTeam(string team)
    {
        return ByTeam.ContainsKey(NormalizeTeam(team));
    }

    public static void ApplyToLeague(League league)
    {
        if (league == null) return;

        ApplyToPlayers(league.InitialPlayerPool);
        ApplyToPlayers(league.DraftPlayers);

        foreach (var team in league.Teams ?? new List<Team>())
        {
            foreach (var spot in team.Roster ?? new List<RosterSpot>())
            {
                ApplyToPlayer(spot.Player);
            }
        }

        foreach (var pick in league.DraftLog ?? new List<DraftPick>())
        {
            ApplyToPlayer(pick.Player);
        }
    }

    public static void ApplyToPlayers(IEnumerable<Player> players)
    {
        if (players == null) return;

        foreach (var player in players)
        {
            ApplyToPlayer(player);
        }
    }

    private static void ApplyToPlayer(Player player)
    {
        if (player == null || player.Bye > 0) return;

        var normalizedTeam = NormalizeTeam(player.Team);
        if (ByTeam.TryGetValue(normalizedTeam, out var byeWeek))
        {
            player.Team = normalizedTeam;
            player.Bye = byeWeek;
        }
    }

    private static string NormalizeTeam(string team)
    {
        if (string.IsNullOrWhiteSpace(team)) return string.Empty;

        var normalized = team.Trim().ToUpperInvariant();
        return TeamAliases.TryGetValue(normalized, out var alias) ? alias : normalized;
    }
}
