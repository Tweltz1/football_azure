using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UpdateUserProfile
{
    private static readonly Dictionary<string, string> BudgetRosterSettingKeys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["qb"] = "qb",
        ["rb"] = "rb",
        ["wr"] = "wr",
        ["te"] = "te",
        ["flex"] = "flex",
        ["superFlex"] = "superFlex",
        ["k"] = "k",
        ["def"] = "def",
        ["dst"] = "def",
        ["bench"] = "bench"
    };

    [Function("UpdateUserProfile")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "user-profile/{userId}")] HttpRequest req,
        string userId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<UpdateUserProfileRequest>(requestBody);

        if (data == null || !data.HasUpdates())
        {
            return new BadRequestObjectResult("At least one profile field is required.");
        }

        try
        {
            var userProfile = await UserProfileStore.FindAsync(userId);
            if (userProfile == null)
            {
                return new NotFoundObjectResult($"User profile for '{userId}' not found.");
            }

            var shouldSyncLeagueFavorites = data.FavoritePlayerIds != null;

            if (data.DisplayName != null)
            {
                if (string.IsNullOrWhiteSpace(data.DisplayName))
                {
                    return new BadRequestObjectResult("Display name cannot be empty.");
                }

                userProfile.DisplayName = data.DisplayName.Trim();
            }

            if (data.DefaultTeamName != null)
            {
                if (string.IsNullOrWhiteSpace(data.DefaultTeamName))
                {
                    return new BadRequestObjectResult("Default team name cannot be empty.");
                }

                userProfile.DefaultTeamName = data.DefaultTeamName.Trim();
            }

            if (data.FavoritePlayerIds != null)
            {
                userProfile.FavoritePlayerIds = data.FavoritePlayerIds
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Select(id => id.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }

            if (data.PlayerNotes != null)
            {
                userProfile.PlayerNotes = SanitizePlayerNotes(data.PlayerNotes);
            }

            if (data.PlayerTiers != null)
            {
                userProfile.PlayerTiers = SanitizePlayerTiers(data.PlayerTiers);
            }

            if (data.BudgetPlan != null)
            {
                userProfile.BudgetPlan = SanitizeBudgetPlan(data.BudgetPlan);
            }

            if (data.BudgetRosterSettings != null)
            {
                userProfile.BudgetRosterSettings = SanitizeBudgetRosterSettings(data.BudgetRosterSettings);
            }

            log?.LogInformation("Updating profile for user {UserId}.", userId);

            await UserProfileStore.UpsertAsync(userProfile);

            if (shouldSyncLeagueFavorites)
            {
                await SyncFavoritePlayersToLeagueTeamsAsync(userId, userProfile.FavoritePlayerIds, log);
            }

            return new OkObjectResult(UserProfileStore.ToResponse(userProfile));
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error updating profile for user {UserId}.", userId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static async Task SyncFavoritePlayersToLeagueTeamsAsync(string userId, List<string> favoritePlayerIds, ILogger log)
    {
        var favoriteIds = favoritePlayerIds ?? new List<string>();
        var query = new QueryDefinition("SELECT * FROM c WHERE ARRAY_CONTAINS(c.members, @userId)")
            .WithParameter("@userId", userId);

        using (var iterator = AppServices.LeaguesContainer.GetItemQueryIterator<League>(query))
        {
            while (iterator.HasMoreResults)
            {
                var page = await iterator.ReadNextAsync();
                foreach (var league in page)
                {
                    try
                    {
                        league.EnsureDefaults();
                        var changed = false;

                        foreach (var team in league.Teams.Where(team => team != null && string.Equals(team.OwnerId, userId, StringComparison.OrdinalIgnoreCase)))
                        {
                            var currentFavoriteIds = team.FavoritePlayerIds ?? new List<string>();
                            if (!currentFavoriteIds.SequenceEqual(favoriteIds, StringComparer.OrdinalIgnoreCase))
                            {
                                team.FavoritePlayerIds = new List<string>(favoriteIds);
                                changed = true;
                            }
                        }

                        if (!changed)
                        {
                            continue;
                        }

                        await AppServices.LeaguesContainer.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
                        await AppServices.BroadcastDraftStateAsync(league.Id, league, log);
                    }
                    catch (Exception ex)
                    {
                        log?.LogWarning(ex, "Profile favorites were saved, but league {LeagueId} could not be synced for user {UserId}.", league?.Id, userId);
                    }
                }
            }
        }
    }

    private static Dictionary<string, string> SanitizePlayerNotes(Dictionary<string, string> playerNotes)
    {
        return playerNotes
            .Where(note => !string.IsNullOrWhiteSpace(note.Key) && !string.IsNullOrWhiteSpace(note.Value))
            .GroupBy(note => note.Key.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => Truncate(group.Last().Value.Trim(), 1000),
                StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, int> SanitizePlayerTiers(Dictionary<string, int> playerTiers)
    {
        return playerTiers
            .Where(tier => !string.IsNullOrWhiteSpace(tier.Key) && tier.Value >= 1 && tier.Value <= 5)
            .GroupBy(tier => tier.Key.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.Last().Value,
                StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, int> SanitizeBudgetPlan(Dictionary<string, int> budgetPlan)
    {
        return budgetPlan
            .Where(item => !string.IsNullOrWhiteSpace(item.Key))
            .GroupBy(item => item.Key.Trim().ToUpperInvariant(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => Math.Max(0, Math.Min(200, group.Last().Value)),
                StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, int> SanitizeBudgetRosterSettings(Dictionary<string, int> rosterSettings)
    {
        var sanitized = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in rosterSettings)
        {
            if (string.IsNullOrWhiteSpace(item.Key)) continue;

            if (BudgetRosterSettingKeys.TryGetValue(item.Key.Trim(), out var canonicalKey))
            {
                sanitized[canonicalKey] = Math.Max(0, Math.Min(30, item.Value));
            }
        }

        return sanitized;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength) return value;
        return value.Substring(0, maxLength);
    }

    public class UpdateUserProfileRequest
    {
        public string DisplayName { get; set; }
        public string DefaultTeamName { get; set; }
        public List<string> FavoritePlayerIds { get; set; }
        public Dictionary<string, string> PlayerNotes { get; set; }
        public Dictionary<string, int> PlayerTiers { get; set; }
        public Dictionary<string, int> BudgetPlan { get; set; }
        public Dictionary<string, int> BudgetRosterSettings { get; set; }

        public bool HasUpdates()
        {
            return DisplayName != null
                || DefaultTeamName != null
                || FavoritePlayerIds != null
                || PlayerNotes != null
                || PlayerTiers != null
                || BudgetPlan != null
                || BudgetRosterSettings != null;
        }
    }
}
