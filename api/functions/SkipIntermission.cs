using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;

public static class SkipIntermission
{
    [FunctionName("SkipIntermission")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/skip-intermission")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
        if (league.Status.ToLower() != "intermission") { return new BadRequestObjectResult("Can only skip during intermission."); }

        log.LogInformation($"Admin skipping intermission for league {league.Name}.");

        // This logic is the same as starting the next round, but happens instantly
        league.Status = "drafting";
        league.CurrentPlayerId = GetNextRandomPlayerId(league);
        
        if (league.CurrentPlayerId == null)
        {
            league.Status = "completed";
            log.LogInformation($"Draft completed for league {league.Name}.");
        }
        else
        {
            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer), IsPaused = false };
        }

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Intermission skipped.");
    }
    
    private static string GetNextRandomPlayerId(League league)
    {
        var undraftedPlayers = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        if (!undraftedPlayers.Any()) return null;
        var random = new Random();
        return undraftedPlayers[random.Next(undraftedPlayers.Count)].Id;
    }

    // Using a shared request class
    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
