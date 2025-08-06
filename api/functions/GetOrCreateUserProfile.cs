using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

// Note: We need a reference to our UserProfile model
// Make sure your .csproj file includes the models directory

public static class GetOrCreateUserProfile
{
    [FunctionName("GetOrCreateUserProfile")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "user-profile")] HttpRequest req,
        // This input binding tries to GET a document from the 'Users' container
        // with an 'id' that matches the 'userId' from the request body.
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Users",
            Connection = "CosmosDbConnectionString",
            Id = "{userId}", // Binds to the 'userId' property from the request body
            PartitionKey = "{userId}")] UserProfile userProfile,
        // This is an output binding to CREATE a document if the input was null.
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Users",
            Connection = "CosmosDbConnectionString")] IAsyncCollector<UserProfile> profilesOut,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<UserProfileRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId))
        {
            return new BadRequestObjectResult("UserId is required.");
        }

        // If the input binding is null, it means no profile was found for this user.
        if (userProfile == null)
        {
            log.LogInformation($"No profile found for user {data.UserId}. Creating a new one.");

            // Create a new profile object.
            var newProfile = new UserProfile
            {
                Id = data.UserId, // The document 'id' must be the user's ID
                UserId = data.UserId,
                DisplayName = data.DisplayName,
                FavoritePlayerIds = new System.Collections.Generic.List<string>()
            };

            // Use the output binding to save the new profile to the database.
            await profilesOut.AddAsync(newProfile);

            // Return the newly created profile.
            return new OkObjectResult(newProfile);
        }

        log.LogInformation($"Found profile for user {data.UserId}.");
        // Otherwise, if a profile was found, just return it.
        return new OkObjectResult(userProfile);
    }

    // A helper class for the request body
    public class UserProfileRequest
    {
        public string UserId { get; set; }
        public string DisplayName { get; set; }
    }
}