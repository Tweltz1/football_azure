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
using Azure.Storage.Queues;

public static class NominatePlayer
{
    [FunctionName("NominatePlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nominate")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        [Queue("auction-timers", Connection = "DraftStorageQueueConnection")] QueueClient timerQueue,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<NominatePlayerRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        string queuedPlayerId = null;
        int queuedDelay = 0;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (!league.AuctionTimer.IsPaused)
                    return new BadRequestObjectResult("Draft must be paused to nominate a player.");

                var playerToNominate = league.InitialPlayerPool.FirstOrDefault(p => p.Id == data.PlayerId);
                if (playerToNominate == null || playerToNominate.IsDrafted)
                    return new BadRequestObjectResult("Player is not available to be nominated.");

                league.Status = "drafting";
                league.CurrentPlayerId = playerToNominate.Id;
                league.AuctionTimer.IsPaused = false;
                league.AuctionTimer.EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer);
                league.ActiveBids.Clear();

                queuedPlayerId = league.CurrentPlayerId;
                queuedDelay = league.DraftTimers.BidTimer;

                return null;
            }, log);

            if (error != null) return error;

            await QueueNextTimer(timerQueue, league.Id, queuedPlayerId, "drafting", queuedDelay);

            await signalRMessages.AddAsync(new SignalRMessage
            {
                GroupName = leagueId,
                Target = "draftStateUpdate",
                Arguments = new object[] { league.ForBroadcast() }
            });

            return new OkObjectResult("Player nominated successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error nominating player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static async Task QueueNextTimer(QueueClient queue, string leagueId, string playerId, string expectedStatus, int delayInSeconds)
    {
        var timerInfo = new { LeagueId = leagueId, PlayerId = playerId, ExpectedStatus = expectedStatus };
        var message = JsonConvert.SerializeObject(timerInfo);
        await queue.SendMessageAsync(message, TimeSpan.FromSeconds(delayInSeconds));
    }

    public class NominatePlayerRequest
    {
        public string AdminId { get; set; }
        public string PlayerId { get; set; }
    }
}
