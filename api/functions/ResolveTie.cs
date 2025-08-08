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

public static class ResolveTie
{
    [FunctionName("ResolveTie")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/resolve-tie")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<ResolveTieRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
        if (league.Status.ToLower() != "tiebreaker" || league.TieBreaker?.Round != 2)
        {
            return new BadRequestObjectResult("Can only resolve a second-round tie.");
        }

        var winningTeam = league.Teams.FirstOrDefault(t => t.Id == data.WinningTeamId);
        var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
        if (winningTeam == null || draftedPlayer == null) { return new NotFoundObjectResult("Team or player not found."); }

        log.LogInformation($"Admin resolved tie, awarding {draftedPlayer.Name} to {winningTeam.Name}.");

        // --- USE SHARED LOGIC ---
        DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, league.TieBreaker.TieAmount);
        
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Tie resolved.");
    }

    public class ResolveTieRequest
    {
        public string AdminId { get; set; }
        public string WinningTeamId { get; set; }
    }
}
