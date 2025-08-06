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

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
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
                return new UnauthorizedResult();
            }

            // Corrected logic:
            // Allow the draft to start with only one member, as per your design.
            // For multi-member leagues, all members must be ready.
            bool allMembersReady = leagueToUpdate.ReadyMembers.Count == leagueToUpdate.Members.Count;
            bool canStart = (leagueToUpdate.Members.Count == 1) || (leagueToUpdate.Members.Count > 1 && allMembersReady);

            if (!canStart)
            {
                return new BadRequestObjectResult("Not all members are ready.");
            }

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
        return league.DraftPlayers.Where(p => !p.IsDrafted).OrderBy(p => Guid.NewGuid()).FirstOrDefault()?.Id;
    }

    public class StartDraftRequest
    {
        public string AdminId { get; set; }
    }
}