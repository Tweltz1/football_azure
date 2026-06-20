using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

public static class PlayerPoolCoverage
{
    private const string SleeperPlayersUrl = "https://api.sleeper.app/v1/players/nfl";
    private static readonly HttpClient HttpClient = new HttpClient();
    private static readonly string[] NflTeams = new[]
    {
        "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
        "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
        "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
        "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"
    };

    private static readonly Dictionary<string, string> TeamAliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["JAC"] = "JAX",
        ["WSH"] = "WAS",
    };

    public static async Task EnsureSpecialTeamsCoverageAsync(List<Player> players, bool includeKickers, bool includeDefenses, ILogger log = null)
    {
        if (players == null || (!includeKickers && !includeDefenses)) return;

        var needsKickers = includeKickers && GetMissingTeams(players, "K").Any();
        var needsDefenses = includeDefenses && GetMissingTeams(players, "DST").Any();
        if (!needsKickers && !needsDefenses) return;

        try
        {
            var candidates = await FetchSleeperSpecialTeamsAsync();
            if (includeKickers)
            {
                AppendMissingTeams(players, candidates, "K", log);
            }

            if (includeDefenses)
            {
                AppendMissingTeams(players, candidates, "DST", log);
            }

            RenumberRanks(players);
            NflByeWeeks.ApplyToPlayers(players);
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Unable to refresh kicker/defense coverage from Sleeper. Continuing with generated player pool.");
        }
    }

    private static async Task<List<PlayerCandidate>> FetchSleeperSpecialTeamsAsync()
    {
        using (var request = new HttpRequestMessage(HttpMethod.Get, SleeperPlayersUrl))
        {
            request.Headers.UserAgent.ParseAdd("hood-league-player-pool-coverage");
            using (var response = await HttpClient.SendAsync(request))
            {
                response.EnsureSuccessStatusCode();
                var body = await response.Content.ReadAsStringAsync();
                var map = JObject.Parse(body);
                return map.Properties()
                    .Select(property => NormalizeSleeperCandidate(property.Value as JObject))
                    .Where(candidate => candidate != null)
                    .OrderBy(candidate => candidate.SourceRank)
                    .ThenBy(candidate => candidate.DepthChartOrder)
                    .ThenBy(candidate => candidate.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
        }
    }

    private static PlayerCandidate NormalizeSleeperCandidate(JObject player)
    {
        if (player == null) return null;

        var position = NormalizePosition(FirstString(
            player.Value<string>("position"),
            player["fantasy_positions"]?.Values<string>()?.FirstOrDefault()));
        if (position != "K" && position != "DST") return null;

        var team = NormalizeTeam(FirstString(player.Value<string>("team"), player.Value<string>("team_abbr")));
        if (!NflTeams.Contains(team)) return null;

        var playerId = FirstString(player.Value<string>("player_id"), player.Value<string>("id"), position == "DST" ? team : null);
        var name = FirstString(
            player.Value<string>("full_name"),
            $"{player.Value<string>("first_name")} {player.Value<string>("last_name")}".Trim(),
            position == "DST" ? $"{team} DST" : null);
        if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(name)) return null;

        if (position == "K")
        {
            var active = player.Value<bool?>("active");
            var status = player.Value<string>("status");
            if (active == false || !string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase)) return null;
        }

        return new PlayerCandidate
        {
            Id = $"sleeper-{playerId}",
            Name = name,
            Position = position,
            Team = team,
            SourceRank = ParsePositiveInteger(player.Value<string>("search_rank"), position == "DST" ? 850 : 9999999),
            DepthChartOrder = ParsePositiveInteger(player.Value<string>("depth_chart_order"), position == "DST" ? 1 : 9999999)
        };
    }

    private static void AppendMissingTeams(List<Player> players, List<PlayerCandidate> candidates, string position, ILogger log)
    {
        var missingTeams = GetMissingTeams(players, position).ToList();
        if (missingTeams.Count == 0) return;

        var existingIds = new HashSet<string>(players.Select(player => player.Id), StringComparer.OrdinalIgnoreCase);
        foreach (var team in missingTeams)
        {
            var candidate = candidates.FirstOrDefault(item => item.Position == position && item.Team == team && !existingIds.Contains(item.Id));
            if (candidate == null)
            {
                log?.LogWarning("Sleeper did not return a usable {Position} candidate for {Team}.", position, team);
                continue;
            }

            players.Add(new Player
            {
                Id = candidate.Id,
                Name = candidate.Name,
                Position = candidate.Position,
                Team = candidate.Team,
                Bye = 0,
                IsDrafted = false,
                Price = 0,
                Rank = players.Count + 1
            });
            existingIds.Add(candidate.Id);
        }
    }

    private static IEnumerable<string> GetMissingTeams(IEnumerable<Player> players, string position)
    {
        var coveredTeams = new HashSet<string>(
            (players ?? Enumerable.Empty<Player>())
                .Where(player => NormalizePosition(player?.Position) == position)
                .Select(player => NormalizeTeam(player.Team))
                .Where(team => NflTeams.Contains(team)),
            StringComparer.OrdinalIgnoreCase);

        return NflTeams.Where(team => !coveredTeams.Contains(team));
    }

    private static void RenumberRanks(List<Player> players)
    {
        for (var index = 0; index < players.Count; index++)
        {
            players[index].Rank = index + 1;
        }
    }

    private static string NormalizePosition(string value)
    {
        var position = (value ?? string.Empty).Trim().ToUpperInvariant();
        if (position == "DEF" || position == "D/ST") return "DST";
        return position;
    }

    private static string NormalizeTeam(string value)
    {
        var team = (value ?? string.Empty).Trim().ToUpperInvariant();
        return TeamAliases.TryGetValue(team, out var alias) ? alias : team;
    }

    private static string FirstString(params string[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        }

        return null;
    }

    private static int ParsePositiveInteger(string value, int fallback)
    {
        return int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    }

    private sealed class PlayerCandidate
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Position { get; set; }
        public string Team { get; set; }
        public int SourceRank { get; set; }
        public int DepthChartOrder { get; set; }
    }
}
