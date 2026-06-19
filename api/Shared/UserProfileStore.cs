using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;

public static class UserProfileStore
{
    public static async Task<UserProfile> FindAsync(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            return null;
        }

        var query = new QueryDefinition(
            "SELECT TOP 1 c.id, c.userId, c.displayName, c.defaultTeamName, c.favoritePlayerIds, c.playerNotes, c.playerTiers, c.budgetPlan, c.budgetRosterSettings FROM c WHERE c.userId = @userId OR c.id = @userId")
            .WithParameter("@userId", userId);

        using (var iterator = AppServices.UsersContainer.GetItemQueryIterator<JObject>(query))
        {
            while (iterator.HasMoreResults)
            {
                var page = await iterator.ReadNextAsync();
                var document = page.FirstOrDefault();
                if (document != null)
                {
                    return FromDocument(document, userId);
                }
            }
        }

        return null;
    }

    public static async Task<UserProfile> UpsertAsync(UserProfile profile)
    {
        Normalize(profile);
        await AppServices.UsersContainer.UpsertItemAsync(ToDocument(profile), new PartitionKey(profile.UserId));
        return profile;
    }

    public static object ToResponse(UserProfile profile)
    {
        Normalize(profile);
        return new
        {
            id = profile.Id,
            userId = profile.UserId,
            displayName = profile.DisplayName,
            defaultTeamName = profile.DefaultTeamName,
            favoritePlayerIds = profile.FavoritePlayerIds,
            playerNotes = profile.PlayerNotes,
            playerTiers = profile.PlayerTiers,
            budgetPlan = profile.BudgetPlan,
            budgetRosterSettings = profile.BudgetRosterSettings
        };
    }

    private static UserProfile FromDocument(JObject document, string fallbackUserId)
    {
        var profile = new UserProfile
        {
            Id = document.Value<string>("id") ?? fallbackUserId,
            UserId = document.Value<string>("userId") ?? fallbackUserId,
            DisplayName = document.Value<string>("displayName"),
            DefaultTeamName = document.Value<string>("defaultTeamName"),
            FavoritePlayerIds = document["favoritePlayerIds"] is JArray favorites
                ? favorites.Values<string>().Where(id => !string.IsNullOrWhiteSpace(id)).ToList()
                : new List<string>(),
            PlayerNotes = document["playerNotes"] is JObject notes
                ? notes.Properties()
                    .Where(property => !string.IsNullOrWhiteSpace(property.Name) && property.Value.Type != JTokenType.Null)
                    .ToDictionary(property => property.Name, property => property.Value.Value<string>() ?? string.Empty)
                : new Dictionary<string, string>(),
            PlayerTiers = document["playerTiers"] is JObject tiers
                ? tiers.Properties()
                    .Where(property => !string.IsNullOrWhiteSpace(property.Name) && property.Value.Type != JTokenType.Null)
                    .ToDictionary(property => property.Name, property => property.Value.Value<int>())
                : new Dictionary<string, int>(),
            BudgetPlan = document["budgetPlan"] is JObject budget
                ? budget.Properties()
                    .Where(property => !string.IsNullOrWhiteSpace(property.Name) && property.Value.Type != JTokenType.Null)
                    .ToDictionary(property => property.Name, property => property.Value.Value<int>(), StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase),
            BudgetRosterSettings = document["budgetRosterSettings"] is JObject rosterSettings
                ? rosterSettings.Properties()
                    .Where(property => !string.IsNullOrWhiteSpace(property.Name) && property.Value.Type != JTokenType.Null)
                    .ToDictionary(property => property.Name, property => property.Value.Value<int>(), StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        };

        Normalize(profile);
        return profile;
    }

    private static JObject ToDocument(UserProfile profile)
    {
        return new JObject
        {
            ["id"] = profile.Id,
            ["userId"] = profile.UserId,
            ["displayName"] = profile.DisplayName,
            ["defaultTeamName"] = profile.DefaultTeamName,
            ["favoritePlayerIds"] = JArray.FromObject(profile.FavoritePlayerIds ?? new List<string>()),
            ["playerNotes"] = JObject.FromObject(profile.PlayerNotes ?? new Dictionary<string, string>()),
            ["playerTiers"] = JObject.FromObject(profile.PlayerTiers ?? new Dictionary<string, int>()),
            ["budgetPlan"] = JObject.FromObject(profile.BudgetPlan ?? new Dictionary<string, int>()),
            ["budgetRosterSettings"] = JObject.FromObject(profile.BudgetRosterSettings ?? new Dictionary<string, int>())
        };
    }

    private static void Normalize(UserProfile profile)
    {
        profile.UserId = string.IsNullOrWhiteSpace(profile.UserId) ? profile.Id : profile.UserId;
        profile.Id = string.IsNullOrWhiteSpace(profile.Id) ? profile.UserId : profile.Id;
        profile.DisplayName = string.IsNullOrWhiteSpace(profile.DisplayName) ? profile.UserId : profile.DisplayName;
        profile.DefaultTeamName = string.IsNullOrWhiteSpace(profile.DefaultTeamName) ? $"{profile.DisplayName}'s Team" : profile.DefaultTeamName;
        profile.FavoritePlayerIds = profile.FavoritePlayerIds ?? new List<string>();
        profile.PlayerNotes = profile.PlayerNotes ?? new Dictionary<string, string>();
        profile.PlayerTiers = profile.PlayerTiers ?? new Dictionary<string, int>();
        profile.BudgetPlan = profile.BudgetPlan ?? new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        profile.BudgetRosterSettings = profile.BudgetRosterSettings ?? new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }
}
