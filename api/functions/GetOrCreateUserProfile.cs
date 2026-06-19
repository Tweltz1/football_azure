using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public static class GetOrCreateUserProfile
{
    [Function("GetOrCreateUserProfile")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "user-profile")] HttpRequest req,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        UserProfileRequest data;

        try
        {
            data = JsonConvert.DeserializeObject<UserProfileRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid profile payload.");
            return new BadRequestObjectResult("Invalid profile payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.UserId))
        {
            return new BadRequestObjectResult("UserId is required.");
        }

        try
        {
            var userProfile = await UserProfileStore.FindAsync(data.UserId);
            if (userProfile == null)
            {
                log?.LogInformation("No profile found for user {UserId}. Creating a new one.", data.UserId);
                var displayName = GetDisplayName(data.DisplayName, data.UserId);
                userProfile = new UserProfile
                {
                    Id = data.UserId,
                    UserId = data.UserId,
                    DisplayName = displayName,
                    DefaultTeamName = $"{displayName}'s Team",
                    FavoritePlayerIds = new List<string>(),
                    PlayerNotes = new Dictionary<string, string>()
                };

                await UserProfileStore.UpsertAsync(userProfile);
            }
            else
            {
                log?.LogInformation("Found profile for user {UserId}.", data.UserId);
            }

            return new OkObjectResult(UserProfileStore.ToResponse(userProfile));
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error processing profile for user {UserId}.", data.UserId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string GetDisplayName(JToken displayName, string fallback)
    {
        if (displayName == null || displayName.Type == JTokenType.Null)
        {
            return fallback;
        }

        if (displayName.Type == JTokenType.String)
        {
            return displayName.Value<string>();
        }

        if (displayName.Type == JTokenType.Object)
        {
            return displayName["displayName"]?.Value<string>()
                ?? displayName["name"]?.Value<string>()
                ?? displayName["userDetails"]?.Value<string>()
                ?? fallback;
        }

        return fallback;
    }

    public class UserProfileRequest
    {
        public string UserId { get; set; }
        public JToken DisplayName { get; set; }
    }
}
