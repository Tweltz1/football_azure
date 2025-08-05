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
using Microsoft.Azure.WebJobs.Extensions.SignalRService; // <--- Add this line

public static class PlaceBid
{
    [FunctionName("PlaceBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/bid")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var bidRequest = JsonConvert.DeserializeObject<BidRequest>(requestBody);

        var container = cosmosClient.GetContainer("FantasyFootball", "Leagues");
        var league = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));

        // --- Bidding and validation logic ---
        // Find the team, validate budget, validate bid amount.

        // Update the active bids and the timer
        league.Resource.ActiveBids[bidRequest.UserId] = new Bid { Amount = bidRequest.Amount, Timestamp = DateTime.UtcNow };
        // Reset timer if bid comes in late (e.g., in the last 5 seconds)

        await container.ReplaceItemAsync(league.Resource, league.Resource.Id);

        // Send a real-time update
        await signalRMessages.AddAsync(new SignalRMessage
        {
            Target = "bidUpdate",
            Arguments = new object[] { leagueId, bidRequest.UserId, bidRequest.Amount }
        });

        return new OkResult();
    }
    public class BidRequest { public string UserId { get; set; } public int Amount { get; set; } }
}