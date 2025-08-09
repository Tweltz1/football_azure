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
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using Azure.Storage.Queues;

public static class PauseDraft
{
    [FunctionName("PauseDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/pause")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        [Queue("auction-timers", Connection = "DraftStorageQueueConnection")] QueueClient timerQueue,
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

            league.AuctionTimer.IsPaused = !league.AuctionTimer.IsPaused;

            if (league.AuctionTimer.IsPaused)
            {
                var timeRemaining = (league.AuctionTimer.EndTime - DateTime.UtcNow).TotalSeconds;
                league.AuctionTimer.TimeRemainingOnPause = (int)Math.Max(0, timeRemaining);
            }
            else
            {
                var newEndTime = DateTime.UtcNow.AddSeconds(league.AuctionTimer.TimeRemainingOnPause);
                league.AuctionTimer.EndTime = newEndTime;
                
                string expectedStatus = league.Status.ToLower();
                string playerId = league.Status.ToLower() == "intermission" ? null : league.CurrentPlayerId;
                await QueueNextTimer(timerQueue, league.Id, playerId, expectedStatus, league.AuctionTimer.TimeRemainingOnPause);
            }

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult(league.AuctionTimer);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error pausing/resuming draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }
    
    private static async Task QueueNextTimer(QueueClient queue, string leagueId, string playerId, string expectedStatus, int delayInSeconds)
    {
        var timerInfo = new { LeagueId = leagueId, PlayerId = playerId, ExpectedStatus = expectedStatus };
        var message = JsonConvert.SerializeObject(timerInfo);
        await queue.SendMessageAsync(message, TimeSpan.FromSeconds(delayInSeconds));
    }

    public class AdminActionRequest { public string AdminId { get; set; } }
}