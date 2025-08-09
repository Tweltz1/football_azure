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
        [Queue("auction-timers", Connection = "AzureWebJobsStorage")] IAsyncCollector<string> timerMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }

            league.Status = "drafting";
            league.ActiveBids.Clear();
            league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league, league.CurrentPlayerId); // Exclude current player
            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };

            // --- QUEUE THE TIMER ---
            await QueueNextTimer(timerMessages, league.Id, league.CurrentPlayerId, "drafting", league.DraftTimers.BidTimer);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult("Player skipped successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error skipping player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static async Task QueueNextTimer(IAsyncCollector<string> queue, string leagueId, string playerId, string expectedStatus, int delayInSeconds)
    {
        var timerInfo = new { LeagueId = leagueId, PlayerId = playerId, ExpectedStatus = expectedStatus };
        var message = JsonConvert.SerializeObject(timerInfo);
        await queue.AddAsync(message, DateTime.UtcNow.AddSeconds(delayInSeconds));
    }

    public class AdminActionRequest { public string AdminId { get; set; } }
}
