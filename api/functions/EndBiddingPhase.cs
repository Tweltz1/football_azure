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

public static class EndBiddingPhase
{
    [FunctionName("EndBiddingPhase")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/endBidding")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var response  = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league    = response.Resource;
        var auction   = league.CurrentAuction;

        // Only proceed if bidding is over and we haven't already moved on
        if (auction == null
            || auction.Status == "awaiting_final_bids"
            || auction.Status == "intermission"
            || DateTime.UtcNow < auction.AuctionTimer.EndTime
            || auction.AuctionTimer.IsPaused)
        {
            return new OkObjectResult("No action needed.");
        }

        // 1) Signal clients that bidding window has closed
        auction.Status = "awaiting_final_bids";
        auction.FinalBids.Clear(); // reset any leftover
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage
        {
            Target    = "draftStateUpdate",
            Arguments = new object[] { league }
        });

        // 2) Wait grace period
        await Task.Delay(TimeSpan.FromSeconds(2));

        // 3) Process auction results
        var bids = auction.FinalBids;
        var player = league.DraftPlayers.FirstOrDefault(p => p.Id == auction.PlayerId);
        if (player != null && bids.Any())
        {
            // Determine winner: highest bid, tiebreak by team ID
            var winnerEntry = bids
                .OrderByDescending(b => b.Value)
                .ThenBy(b => b.Key)
                .First();
            var winningTeamId = winnerEntry.Key;
            var winningBid    = winnerEntry.Value;
            var winningTeam   = league.Teams.First(t => t.Id == winningTeamId);

            // Update player/team
            player.IsDrafted = true;
            player.Price     = winningBid;
            winningTeam.Budget -= winningBid;
            winningTeam.Roster.Add(new RosterSpot
            {
                Player   = player,
                Position = player.Position
            });

            league.DraftLog.Add(new DraftPick
            {
                WinningTeamId = winningTeamId,
                WinningBid    = winningBid,
                Player        = player,
                AllBids       = bids.ToDictionary(
                    kv => kv.Key,
                    kv => new Bid { Amount = kv.Value, Timestamp = DateTime.UtcNow }
                )
            });
        }
        else
        {
            log.LogInformation($"No bids received for player {auction.PlayerId}.");
        }

        // 4) Transition to intermission
        league.Status = "drafting";
        league.CurrentAuction = new CurrentAuction
        {
            Status       = "intermission",
            AuctionTimer = new AuctionTimer
            {
                EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer),
                IsPaused = false,
                TimeRemainingOnPause = 0
            },
            PlayerId = null,
            FinalBids = new System.Collections.Generic.Dictionary<string,int>()
        };

        // 5) Save and broadcast final results
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage
        {
            Target    = "draftStateUpdate",
            Arguments = new object[] { league }
        });

        return new OkObjectResult("Auction results processed.");
    }
} 
