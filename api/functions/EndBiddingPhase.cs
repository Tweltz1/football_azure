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

        if (league == null || league.Status != "drafting" || DateTime.UtcNow < league.AuctionTimer.EndTime)
        {
            // The timer hasn't expired yet, or the draft isn't active. Do nothing.
            return new OkResult();
        }

        var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
        if (draftedPlayer == null) { /* handle error */ return new BadRequestObjectResult("Player not found."); }

        // Determine the winner
        if (league.ActiveBids.Any())
        {
            var winningBidEntry = league.ActiveBids.OrderByDescending(b => b.Value.Amount).First();
            var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);

            // Update player and team
            draftedPlayer.IsDrafted = true;
            draftedPlayer.Price = winningBidEntry.Value.Amount;
            winningTeam.Budget -= winningBidEntry.Value.Amount;
            winningTeam.Roster.Add(new RosterSpot { Player = draftedPlayer, Position = draftedPlayer.Position });

            // Log the pick
            league.DraftLog.Add(new DraftPick
            {
                WinningTeamId = winningTeam.Id,
                WinningBid = winningBidEntry.Value.Amount,
                Player = draftedPlayer,
                AllBids = new Dictionary<string, Bid>(league.ActiveBids) // Copy all bids for the log
            });
        }
        else 
        {
            // No bids were placed, player goes undrafted for now
            // We can add logic later to put them back in the pool if desired
        }

        // Transition to Intermission
        league.Status = "intermission";
        league.ActiveBids.Clear();
        league.CurrentPlayerId = null; // Clear the current player
        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Bidding phase ended.");
    }
}