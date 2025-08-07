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
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<StartDraftRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            if (leagueToUpdate.AdminId != data.AdminId)
            {
                return new UnauthorizedResult();
            }

            // --- CORRECTED LOGIC ---
            // The draft can start if all non-admin members are ready.
            var nonAdminMembers = leagueToUpdate.Members.Where(id => id != leagueToUpdate.AdminId).ToList();
            bool allNonAdminsReady = nonAdminMembers.All(memberId => leagueToUpdate.ReadyMembers.Contains(memberId));
            
            // Allow start if there are no other members, OR if all other members are ready.
            if (!allNonAdminsReady && nonAdminMembers.Any())
            {
                return new BadRequestObjectResult("Not all other members are ready.");
            }
            // --- END CORRECTED LOGIC ---

            leagueToUpdate.Status = "drafting";
            leagueToUpdate.CurrentPlayerId = GetRandomPlayerId(leagueToUpdate);
            leagueToUpdate.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(leagueToUpdate.DraftTimers.BidTimer), IsPaused = false };

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));

            await signalRMessages.AddAsync(new SignalRMessage
            {
                Target = "draftStarted",
                Arguments = new object[] { leagueToUpdate.Id }
            });

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
    }

    private static string GetRandomPlayerId(League league)
    {
        var undraftedPlayers = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        if (!undraftedPlayers.Any()) return null; // No players left
        var random = new Random();
        return undraftedPlayers[random.Next(undraftedPlayers.Count)].Id;
    }

    public class StartDraftRequest
    {
        public string AdminId { get; set; }
    }
}