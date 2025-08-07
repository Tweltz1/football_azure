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

public static class SkipPlayer
{
    [FunctionName("SkipPlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/skip")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        // For simplicity, we'll get the adminId from the request body
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            // Security check: Only the admin can skip a player
            if (league.AdminId != data.AdminId)
            {
                return new UnauthorizedResult();
            }

            // The current player is not marked as drafted, so they remain in the pool.
            // We just need to pick a new player and reset the timer.
            
            log.LogInformation($"Admin is skipping player {league.CurrentPlayerId}.");

            league.Status = "drafting"; // Ensure status is 'drafting'
            league.ActiveBids.Clear();
            league.CurrentPlayerId = GetNextRandomPlayerId(league);
            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));

            // Broadcast the new state with the next player
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult("Player skipped successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error skipping player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string GetNextRandomPlayerId(League league)
    {
        var undraftedPlayers = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        
        // Exclude the player who was just skipped from being immediately re-nominated
        if (league.CurrentPlayerId != null)
        {
            undraftedPlayers.RemoveAll(p => p.Id == league.CurrentPlayerId);
        }

        if (!undraftedPlayers.Any()) return null; // No players left
        
        var random = new Random();
        return undraftedPlayers[random.Next(undraftedPlayers.Count)].Id;
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}