using System;
using System.Collections.Generic;
using System.IO;
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

        if (data?.FavoritePlayerIds == null)
        {
            return new BadRequestObjectResult("A list of favoritePlayerIds is required.");
        }

        try
        {
            var userProfile = await UserProfileStore.FindAsync(userId);
            if (userProfile == null)
            {
                return new NotFoundObjectResult($"User profile for '{userId}' not found.");
            }

            userProfile.FavoritePlayerIds = data.FavoritePlayerIds;
            log?.LogInformation("Updating favorite players for user {UserId}.", userId);

            await UserProfileStore.UpsertAsync(userProfile);

            return new OkObjectResult(UserProfileStore.ToResponse(userProfile));
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error updating profile for user {UserId}.", userId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class UpdateUserProfileRequest
    {
        public List<string> FavoritePlayerIds { get; set; }
    }
}
