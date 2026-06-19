using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UpdateUserProfile
{
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
                    .Distinct()
                    .ToList();
            }

            if (data.PlayerNotes != null)
            {
                userProfile.PlayerNotes = SanitizePlayerNotes(data.PlayerNotes);
            }

            log?.LogInformation("Updating profile for user {UserId}.", userId);

            await UserProfileStore.UpsertAsync(userProfile);

            return new OkObjectResult(UserProfileStore.ToResponse(userProfile));
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error updating profile for user {UserId}.", userId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
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

        public bool HasUpdates()
        {
            return DisplayName != null
                || DefaultTeamName != null
                || FavoritePlayerIds != null
                || PlayerNotes != null;
        }
    }
}
