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

public static class SubmitTieBreakerBid
{
    [FunctionName("SubmitTieBreakerBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/tiebreaker-bid")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var bidRequest = JsonConvert.DeserializeObject<BidRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        if (league.Status.ToLower() != "tiebreaker") 
            return new BadRequestObjectResult("Not in a tie-breaker round.");
        if (league.TieBreaker == null || !league.TieBreaker.TiedTeamIds.Contains(bidRequest.UserId))
            return new UnauthorizedResult();
        if (bidRequest.Amount <= league.TieBreaker.TieAmount)
            return new BadRequestObjectResult($"Bid must be greater than the tie amount of ${league.TieBreaker.TieAmount}.");

        // --- MAX BID VALIDATION ---
        var biddingTeam = league.Teams.FirstOrDefault(t => t.OwnerId == bidRequest.UserId);
        if (biddingTeam == null) return new NotFoundObjectResult("Team not found.");

        var totalRosterSpots = league.RosterSettings.QB + league.RosterSettings.RB + league.RosterSettings.WR + league.RosterSettings.TE + league.RosterSettings.K + league.RosterSettings.DEF + league.RosterSettings.FLEX + league.RosterSettings.SuperFlex + league.RosterSettings.Bench;
        var spotsToFill = totalRosterSpots - biddingTeam.Roster.Count;
        var maxBid = biddingTeam.Budget - (spotsToFill > 0 ? spotsToFill - 1 : 0);

        if (bidRequest.Amount > maxBid)
        {
            return new BadRequestObjectResult($"Your bid of ${bidRequest.Amount} exceeds your max bid of ${maxBid}.");
        }
        // --- END VALIDATION ---

        league.ActiveBids[bidRequest.UserId] = new Bid { Amount = bidRequest.Amount, Timestamp = DateTime.UtcNow };

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Tie-breaker bid submitted.");
    }

    public class BidRequest { public string UserId { get; set; } public int Amount { get; set; } }
}
