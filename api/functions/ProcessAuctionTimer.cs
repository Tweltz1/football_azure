using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;
using Newtonsoft.Json;

public static class ProcessAuctionTimer
{
    [FunctionName("ProcessAuctionTimer")]
    public static async Task Run(
        [QueueTrigger("auction-timers", Connection = "AzureWebJobsStorage")] string queueItem,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        [Queue("auction-timers", Connection = "AzureWebJobsStorage")] IAsyncCollector<string> nextTimerMessage,
        ILogger log)
    {
        var timerInfo = JsonConvert.DeserializeObject<TimerInfo>(queueItem);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(timerInfo.LeagueId, new PartitionKey(timerInfo.LeagueId));
            var league = leagueResponse.Resource;

            // --- SAFETY CHECKS ---
            // If the draft was paused, or the player has changed, this timer is old. Ignore it.
            if (league.AuctionTimer.IsPaused || league.CurrentPlayerId != timerInfo.PlayerId)
            {
                log.LogInformation($"Ignoring stale timer for player {timerInfo.PlayerId} in league {league.Name}.");
                return;
            }
            // If the status is not what we expect, something else happened. Ignore it.
             if (league.Status.ToLower() != timerInfo.ExpectedStatus)
            {
                log.LogInformation($"Ignoring timer due to status mismatch for league {league.Name}. Expected {timerInfo.ExpectedStatus}, was {league.Status}.");
                return;
            }


            // --- PROCESS THE TIMER ---
            if (league.Status.ToLower() == "drafting" || league.Status.ToLower() == "tiebreaker")
            {
                // --- END OF AUCTION LOGIC ---
                var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
                if (draftedPlayer == null) return;

                if (league.ActiveBids.Any())
                {
                    var highBidAmount = league.ActiveBids.Max(b => b.Value.Amount);
                    var winningBids = league.ActiveBids.Where(b => b.Value.Amount == highBidAmount).ToList();

                    if (winningBids.Count == 1)
                    {
                        var winningBidEntry = winningBids.First();
                        var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);
                        DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, winningBidEntry.Value.Amount);
                        
                        // Queue up the intermission timer
                        await QueueNextTimer(nextTimerMessage, league.Id, null, "intermission", league.DraftTimers.IntermissionTimer);
                    }
                    else
                    {
                        // Tie Breaker
                        league.Status = "tiebreaker";
                        league.TieBreaker = new TieBreakerInfo
                        {
                            TiedTeamIds = winningBids.Select(wb => wb.Key).ToList(),
                            TieAmount = highBidAmount,
                            Round = (league.TieBreaker?.Round ?? 0) + 1
                        };
                        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.RebidTimer) };
                        league.ActiveBids.Clear();
                        
                        // Queue up the tie-breaker timer
                        await QueueNextTimer(nextTimerMessage, league.Id, league.CurrentPlayerId, "tiebreaker", league.DraftTimers.RebidTimer);
                    }
                }
                else 
                {
                    league.Status = "intermission";
                    league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
                    await QueueNextTimer(nextTimerMessage, league.Id, null, "intermission", league.DraftTimers.IntermissionTimer);
                }
            }
            else if (league.Status.ToLower() == "intermission")
            {
                // --- END OF INTERMISSION LOGIC ---
                league.Status = "drafting";
                league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);
                
                if (league.CurrentPlayerId == null)
                {
                    league.Status = "completed";
                }
                else
                {
                    league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };
                    await QueueNextTimer(nextTimerMessage, league.Id, league.CurrentPlayerId, "drafting", league.DraftTimers.BidTimer);
                }
            }
            
            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });
        }
        catch (Exception ex)
        {
            log.LogError(ex, $"Error processing auction timer for league {timerInfo.LeagueId}.");
        }
    }

    private static async Task QueueNextTimer(IAsyncCollector<string> queue, string leagueId, string playerId, string expectedStatus, int delayInSeconds)
    {
        var timerInfo = new TimerInfo { LeagueId = leagueId, PlayerId = playerId, ExpectedStatus = expectedStatus };
        var message = JsonConvert.SerializeObject(timerInfo);
        await queue.AddAsync(message, DateTime.UtcNow.AddSeconds(delayInSeconds));
    }

    public class TimerInfo
    {
        public string LeagueId { get; set; }
        public string PlayerId { get; set; } // Null for intermission
        public string ExpectedStatus { get; set; }
    }
}
