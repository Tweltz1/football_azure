using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using System.Collections.Generic;

public static class UpdateUserProfile
{
    [FunctionName("UpdateUserProfile")]
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

        var container = AppServices.UsersContainer;

        try
        {
            UserProfile userProfile = await container.ReadItemAsync<UserProfile>(userId, new PartitionKey(userId));
            if (userProfile == null)
            {
                return new NotFoundObjectResult($"User profile for '{userId}' not found.");
            }

            userProfile.FavoritePlayerIds = data.FavoritePlayerIds;
            log.LogInformation("Updating favorite players for user {UserId}.", userId);

            await container.ReplaceItemAsync(userProfile, userProfile.Id, new PartitionKey(userProfile.UserId));

            return new OkObjectResult(userProfile);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"User profile for '{userId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error updating profile for user {UserId}.", userId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class UpdateUserProfileRequest
    {
        public List<string> FavoritePlayerIds { get; set; }
    }
}
