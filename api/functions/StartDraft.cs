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

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football", // Corrected database name
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<StartDraftRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required to start the draft.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            if (leagueToUpdate.AdminId != data.AdminId)
            {
                return new UnauthorizedResult(); // Only the admin can start the draft
            }

            // Allow the draft to start with only one member, as per your request
            // The logic to check for all members ready is now optional based on this
            if (leagueToUpdate.Members.Count > 1 && leagueToUpdate.ReadyMembers.Count != leagueToUpdate.Members.Count)
            {
                return new BadRequestObjectResult("Not all members are ready.");
            }

            // Update league status and set the first player
            leagueToUpdate.Status = "drafting";
            leagueToUpdate.CurrentPlayerId = GetRandomPlayerId(leagueToUpdate);
            leagueToUpdate.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(leagueToUpdate.DraftTimers.BidTimer), IsPaused = false };

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string GetRandomPlayerId(League league)
    {
        // Logic to get a random player from the undrafted pool
        return league.DraftPlayers.Where(p => !p.IsDrafted).OrderBy(p => Guid.NewGuid()).FirstOrDefault()?.Id;
    }

    public class StartDraftRequest
    {
        public string AdminId { get; set; }
    }
}