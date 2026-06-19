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
            "SELECT TOP 1 c.id, c.userId, c.displayName, c.favoritePlayerIds FROM c WHERE c.userId = @userId OR c.id = @userId")
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
            favoritePlayerIds = profile.FavoritePlayerIds
        };
    }

    private static UserProfile FromDocument(JObject document, string fallbackUserId)
    {
        var profile = new UserProfile
        {
            Id = document.Value<string>("id") ?? fallbackUserId,
            UserId = document.Value<string>("userId") ?? fallbackUserId,
            DisplayName = document.Value<string>("displayName"),
            FavoritePlayerIds = document["favoritePlayerIds"] is JArray favorites
                ? favorites.Values<string>().Where(id => !string.IsNullOrWhiteSpace(id)).ToList()
                : new List<string>()
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
            ["favoritePlayerIds"] = JArray.FromObject(profile.FavoritePlayerIds ?? new List<string>())
        };
    }

    private static void Normalize(UserProfile profile)
    {
        profile.UserId = string.IsNullOrWhiteSpace(profile.UserId) ? profile.Id : profile.UserId;
        profile.Id = string.IsNullOrWhiteSpace(profile.Id) ? profile.UserId : profile.Id;
        profile.DisplayName = string.IsNullOrWhiteSpace(profile.DisplayName) ? profile.UserId : profile.DisplayName;
        profile.FavoritePlayerIds = profile.FavoritePlayerIds ?? new List<string>();
    }
}
