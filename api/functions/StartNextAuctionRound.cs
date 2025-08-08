using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;

public static class StartNextAuctionRound
{
    [FunctionName("StartNextAuctionRound")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nextRound")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        if (league == null || league.Status != "intermission" || DateTime.UtcNow < league.AuctionTimer.EndTime)
        {
            // The intermission timer hasn't expired yet. Do nothing.
            return new OkResult();
        }

        log.LogInformation($"Intermission ended for league {league.Name}. Starting next round.");

        league.Status = "drafting";
        league.CurrentPlayerId = GetNextRandomPlayerId(league);
        
        if (league.CurrentPlayerId == null)
        {
            league.Status = "completed";
            log.LogInformation($"Draft completed for league {league.Name}.");
        }
        else
        {
            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };
        }

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Next round started.");
    }
    
    private static string GetNextRandomPlayerId(League league)
    {
        var undraftedPlayers = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        if (!undraftedPlayers.Any()) return null;
        var random = new Random();
        return undraftedPlayers[random.Next(undraftedPlayers.Count)].Id;
    }
}