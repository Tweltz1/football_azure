using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;

public static class EndBiddingPhase
{
    [FunctionName("EndBiddingPhase")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = "leagues/{leagueId}/endBidding")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        // --- THIS IS THE FIX ---
        // We now also check if the timer is paused. If it is, we do nothing.
        if (league == null || league.Status != "drafting" || league.AuctionTimer.IsPaused || DateTime.UtcNow < league.AuctionTimer.EndTime)
        {
            return new OkResult();
        }

        var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
        if (draftedPlayer == null) { return new BadRequestObjectResult("Player not found."); }

        if (league.ActiveBids.Any())
        {
            var winningBidEntry = league.ActiveBids.OrderByDescending(b => b.Value.Amount).First();
            var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);

            draftedPlayer.IsDrafted = true;
            draftedPlayer.Price = winningBidEntry.Value.Amount;
            winningTeam.Budget -= winningBidEntry.Value.Amount;
            winningTeam.Roster.Add(new RosterSpot { Player = draftedPlayer, Position = draftedPlayer.Position });

            league.DraftLog.Add(new DraftPick
            {
                WinningTeamId = winningTeam.Id,
                WinningBid = winningBidEntry.Value.Amount,
                Player = draftedPlayer,
                AllBids = new Dictionary<string, Bid>(league.ActiveBids)
            });
        }
        
        league.Status = "intermission";
        league.ActiveBids.Clear();
        league.CurrentPlayerId = null;
        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Bidding phase ended.");
    }
}
