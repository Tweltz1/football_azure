using System.Collections.Generic;
using Newtonsoft.Json;

public class UserProfile
{
    // We will use the user's unique ID from the auth system as the 'id' for this document.
    [JsonProperty("id")]
    public string Id { get; set; }

    [JsonProperty("userId")]
    public string UserId { get; set; }

    // This will be their GitHub/Google username, e.g., "JohnDoe"
    [JsonProperty("displayName")]
    public string DisplayName { get; set; }

    [JsonProperty("defaultTeamName")]
    public string DefaultTeamName { get; set; }

    // This is the user's master list of favorite players
    [JsonProperty("favoritePlayerIds")]
    public List<string> FavoritePlayerIds { get; set; } = new List<string>();

    [JsonProperty("playerNotes")]
    public Dictionary<string, string> PlayerNotes { get; set; } = new Dictionary<string, string>();
}
