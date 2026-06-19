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

public static class GetOrCreateUserProfile
{
    [FunctionName("GetOrCreateUserProfile")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "user-profile")] HttpRequest req,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<UserProfileRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId))
        {
            return new BadRequestObjectResult("UserId is required.");
        }

        var container = AppServices.UsersContainer;

        try
        {
            UserProfile userProfile = await container.ReadItemAsync<UserProfile>(data.UserId, new PartitionKey(data.UserId));
            log.LogInformation("Found profile for user {UserId}.", data.UserId);
            return new OkObjectResult(userProfile);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            log.LogInformation("No profile found for user {UserId}. Creating a new one.", data.UserId);

            var newProfile = new UserProfile
            {
                Id = data.UserId,
                UserId = data.UserId,
                DisplayName = data.DisplayName,
                FavoritePlayerIds = new System.Collections.Generic.List<string>()
            };

            await container.CreateItemAsync(newProfile, new PartitionKey(newProfile.UserId));
            return new OkObjectResult(newProfile);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error processing profile for user {UserId}.", data.UserId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class UserProfileRequest
    {
        public string UserId { get; set; }
        public string DisplayName { get; set; }
    }
}
