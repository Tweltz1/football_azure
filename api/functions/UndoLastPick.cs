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

public static class UndoLastPick
{
    [FunctionName("UndoLastPick")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/undo-pick")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
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

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
            if (league.Status.ToLower() != "intermission") { return new BadRequestObjectResult("Can only undo a pick during intermission."); }
            if (!league.DraftLog.Any()) { return new BadRequestObjectResult("There are no picks to undo."); }

            var lastPick = league.DraftLog.Last();
            
            var winningTeam = league.Teams.FirstOrDefault(t => t.Id == lastPick.WinningTeamId);
            var playerInPool = league.InitialPlayerPool.FirstOrDefault(p => p.Id == lastPick.Player.Id);

            if (winningTeam != null && playerInPool != null)
            {
                log.LogInformation($"Admin is undoing the last pick: {playerInPool.Name} from {winningTeam.Name}.");

                winningTeam.Budget += lastPick.WinningBid;
                winningTeam.Roster.RemoveAll(spot => spot.Player.Id == playerInPool.Id);
                playerInPool.IsDrafted = false;
                playerInPool.Price = 0;
                league.DraftLog.Remove(lastPick);
            }

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult("Last pick has been undone.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error undoing last pick.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
