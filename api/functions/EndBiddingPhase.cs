using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using Newtonsoft.Json;
using Azure.Storage.Queues; // Required for QueueClient

public static class EndBiddingPhase
{
    [FunctionName("EndBiddingPhase")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/endBidding")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [Queue("process-auction-results", Connection = "AzureWebJobsStorage")] QueueClient queueClient, // Binding to send to a queue
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        // Validation: Check if it's actually time to end the auction.
        if (league?.CurrentAuction == null || league.CurrentAuction.Status == "awaiting_final_bids" || league.CurrentAuction.AuctionTimer.IsPaused || DateTime.UtcNow < league.CurrentAuction.AuctionTimer.EndTime)
        {
            return new OkObjectResult("Bidding not yet ended or already processed.");
        }

        log.LogInformation($"EndBiddingPhase triggered for league {leagueId}. Starting grace period.");

        // 1. Change the status to signal to clients that bidding is over.
        league.CurrentAuction.Status = "awaiting_final_bids";
        league.CurrentAuction.FinalBids.Clear();

        // 2. Schedule the next function to run after a 2-second grace period.
        var message = new { LeagueId = league.Id, AuctionPlayerId = league.CurrentAuction.PlayerId };
        await queueClient.SendMessageAsync(JsonConvert.SerializeObject(message), visibilityTimeout: TimeSpan.FromSeconds(2));
        
        // 3. Save the state change and broadcast to all clients.
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Grace period started. Awaiting final bids.");
    }
}