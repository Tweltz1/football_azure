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

        if (league == null || league.AuctionTimer.IsPaused || DateTime.UtcNow < league.AuctionTimer.EndTime)
        {
            return new OkResult(); // Timer not expired or is paused
        }

        if (league.Status.ToLower() == "drafting")
        {
            // --- HANDLE END OF REGULAR AUCTION ---
            var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
            if (draftedPlayer == null) { return new BadRequestObjectResult("Player not found."); }

            if (league.ActiveBids.Any())
            {
                var highBidAmount = league.ActiveBids.Max(b => b.Value.Amount);
                var winningBids = league.ActiveBids.Where(b => b.Value.Amount == highBidAmount).ToList();

                if (winningBids.Count == 1)
                {
                    // Single Winner
                    var winningBidEntry = winningBids.First();
                    var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);
                    AwardPlayerToTeam(league, draftedPlayer, winningTeam, winningBidEntry.Value.Amount);
                }
                else
                {
                    // Tie Breaker Round 1
                    log.LogInformation($"Tie detected at ${highBidAmount} for player {draftedPlayer.Name}.");
                    league.Status = "tiebreaker";
                    league.TieBreaker = new TieBreakerInfo
                    {
                        TiedTeamIds = winningBids.Select(wb => wb.Key).ToList(),
                        TieAmount = highBidAmount,
                        Round = 1
                    };
                    league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.RebidTimer) };
                    league.ActiveBids.Clear();
                }
            }
            else 
            {
                // No bids, go to intermission
                league.Status = "intermission";
                league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
            }
        }
        else if (league.Status.ToLower() == "tiebreaker")
        {
            // --- HANDLE END OF TIE-BREAKER AUCTION ---
            var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);

            if (league.ActiveBids.Any())
            {
                var highBidAmount = league.ActiveBids.Max(b => b.Value.Amount);
                var winningBids = league.ActiveBids.Where(b => b.Value.Amount == highBidAmount).ToList();

                if (winningBids.Count == 1)
                {
                    // Single Winner in Tie-breaker
                    var winningBidEntry = winningBids.First();
                    var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);
                    AwardPlayerToTeam(league, draftedPlayer, winningTeam, winningBidEntry.Value.Amount);
                }
                else
                {
                    // Second Tie, admin must resolve
                    log.LogInformation($"Second tie detected at ${highBidAmount}. Admin must resolve.");
                    league.TieBreaker.TiedTeamIds = winningBids.Select(wb => wb.Key).ToList();
                    league.TieBreaker.TieAmount = highBidAmount;
                    league.TieBreaker.Round = 2;
                    // Timer is effectively stopped until admin acts
                }
            }
            else // No one bid in the tie-breaker
            {
                // Admin must resolve between the original tied teams
                log.LogInformation("No bids in tie-breaker. Admin must resolve.");
                league.TieBreaker.Round = 2; 
            }
        }
        
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

        return new OkObjectResult("Bidding phase ended.");
    }

    private static void AwardPlayerToTeam(League league, Player player, Team winningTeam, int amount)
    {
        player.IsDrafted = true;
        player.Price = amount;
        winningTeam.Budget -= amount;
        winningTeam.Roster.Add(new RosterSpot { Player = player, Position = player.Position });

        league.DraftLog.Add(new DraftPick
        {
            WinningTeamId = winningTeam.Id,
            WinningBid = amount,
            Player = player,
            AllBids = new Dictionary<string, Bid>(league.ActiveBids)
        });
        
        league.Status = "intermission";
        league.ActiveBids.Clear();
        league.CurrentPlayerId = null;
        league.TieBreaker = null;
        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
    }
}
