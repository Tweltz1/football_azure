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
using System.Linq;
using System.Collections.Generic;

public static class UpdateFavoritePlayers
{
    [FunctionName("UpdateFavoritePlayers")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/favorites")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<UpdateFavoritesRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId) || data.PlayerIds == null)
        {
            return new BadRequestObjectResult("User ID and a list of player IDs are required.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            // 1. READ: Get the league document from the database
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            // 2. MODIFY: Find the user's team and update their favorite players list
            var teamToUpdate = leagueToUpdate.Teams.FirstOrDefault(t => t.OwnerId == data.UserId);
            if (teamToUpdate == null)
            {
                return new NotFoundObjectResult($"Team for user '{data.UserId}' not found in league '{leagueId}'.");
            }

            // Replace the old list of favorites with the new one from the client
            teamToUpdate.FavoritePlayerIds = data.PlayerIds;
            log.LogInformation($"Updated favorite players for user {data.UserId} in league {leagueId}.");

            // 3. REPLACE: Save the updated league document back to the database
            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));

            return new OkObjectResult(new { message = "Favorite players updated successfully." });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error updating favorite players.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    // Helper class for deserializing the request body
    public class UpdateFavoritesRequest
    {
        public string UserId { get; set; }
        public List<string> PlayerIds { get; set; }
    }
}