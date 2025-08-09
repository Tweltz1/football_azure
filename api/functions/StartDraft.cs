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
        [Queue("auction-timers", Connection = "DraftStorageQueueConnection")] IAsyncCollector<string> timerMessages, // <-- CHANGED
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

            var nonAdminMembers = league.Members.Where(id => id != league.AdminId).ToList();
            bool allNonAdminsReady = nonAdminMembers.All(memberId => league.ReadyMembers.Contains(memberId));
            if (!allNonAdminsReady && nonAdminMembers.Any())
            {
                return new BadRequestObjectResult("Not all other members are ready.");
            }

            league.Status = "drafting";
            league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);
            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };

            await QueueNextTimer(timerMessages, league.Id, league.CurrentPlayerId, "drafting", league.DraftTimers.BidTimer);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkResult();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting draft.");
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