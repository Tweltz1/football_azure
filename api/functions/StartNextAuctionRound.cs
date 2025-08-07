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

public static class StartNextAuctionRound
{
    [FunctionName("StartNextAuctionRound")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nextRound")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        // Only proceed if we were in intermission and the timer has truly expired
        if (league == null
            || league.CurrentAuction == null
            || league.CurrentAuction.Status != "intermission"
            || DateTime.UtcNow < league.CurrentAuction.AuctionTimer.EndTime)
        {
            return new OkResult();
        }

        log.LogInformation($"Intermission ended for league {league.Name}. Starting next round.");

        // Pick the next player (or mark completed)
        var nextPlayerId = GetNextRandomPlayerId(league);
        if (nextPlayerId == null)
        {
            // No players left; draft is complete
            league.Status = "completed";
            league.CurrentAuction.Status = "completed";
        }
        else
        {
            // Continue drafting
            league.Status = "drafting";
            league.CurrentAuction.Status = "bidding";
            league.CurrentAuction.PlayerId = nextPlayerId;
            league.CurrentAuction.AuctionTimer = new AuctionTimer
            {
                EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                IsPaused = false,
                TimeRemainingOnPause = 0
            };
            // Clear any prior bids
            league.CurrentAuction.FinalBids.Clear();
        }

        // Persist and broadcast the state
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage
        {
            Target = "draftStateUpdate",
            Arguments = new object[] { league }
        });

        return new OkObjectResult("Next round started.");
    }

    private static string GetNextRandomPlayerId(League league)
    {
        var undrafted = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        // Exclude the just‐finished player if needed
        if (league.CurrentAuction.PlayerId != null)
            undrafted.RemoveAll(p => p.Id == league.CurrentAuction.PlayerId);

        if (!undrafted.Any()) return null;

        var rnd = new Random();
        return undrafted[rnd.Next(undrafted.Count)].Id;
    }
}
