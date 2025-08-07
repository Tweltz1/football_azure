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

public static class SkipPlayer
{
    [FunctionName("SkipPlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/skip")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            var auction = league.CurrentAuction;

            // Only the admin can skip a player
            if (league.AdminId != data.AdminId)
                return new UnauthorizedResult();

            log.LogInformation($"Admin is skipping player {auction.PlayerId} in league {league.Name}.");

            // Clear any final bids from this auction
            auction.FinalBids.Clear();

            // Pick next random player
            var nextId = GetNextRandomPlayerId(league);

            // Reset auction state
            league.Status = "drafting";
            auction.PlayerId = nextId;
            auction.AuctionTimer = new AuctionTimer
            {
                EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                IsPaused = false,
                TimeRemainingOnPause = 0
            };

            // Save & broadcast
            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage 
            { 
                Target = "draftStateUpdate", 
                Arguments = new object[] { league } 
            });

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
        var undrafted = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        var current = league.CurrentAuction.PlayerId;
        if (current != null)
            undrafted.RemoveAll(p => p.Id == current);

        if (!undrafted.Any()) return null;

        var rnd = new Random();
        return undrafted[rnd.Next(undrafted.Count)].Id;
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
