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

public static class NominatePlayer
{
    [FunctionName("NominatePlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nominate")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<NominatePlayerRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
            if (!league.AuctionTimer.IsPaused) { return new BadRequestObjectResult("Draft must be paused to nominate a player."); }

            var playerToNominate = league.InitialPlayerPool.FirstOrDefault(p => p.Id == data.PlayerId);
            if (playerToNominate == null || playerToNominate.IsDrafted)
            {
                return new BadRequestObjectResult("Player is not available to be nominated.");
            }

            log.LogInformation($"Admin nominating player {playerToNominate.Name} in league {league.Name}.");

            league.Status = "drafting";
            league.CurrentPlayerId = playerToNominate.Id;
            league.AuctionTimer.IsPaused = false;
            league.AuctionTimer.EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult("Player nominated successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error nominating player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class NominatePlayerRequest
    {
        public string AdminId { get; set; }
        public string PlayerId { get; set; }
    }
}