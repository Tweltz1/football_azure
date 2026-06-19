using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Collections.Generic;
using Newtonsoft.Json;
using Azure.Storage.Queues;
using Microsoft.AspNetCore.Mvc;

public static class ProcessAuctionTimer
{
    [FunctionName("ProcessAuctionTimer")]
    public static async Task Run(
        [QueueTrigger("auction-timers", Connection = "DraftStorageQueueConnection")] string queueItem,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        [Queue("auction-timers", Connection = "DraftStorageQueueConnection")] QueueClient timerQueue,
        ILogger log)
    {
        var timerInfo = JsonConvert.DeserializeObject<TimerInfo>(queueItem);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        string nextTimerPlayerId = null;
        string nextTimerStatus = null;
        int nextTimerDelay = 0;
        bool shouldQueueTimer = false;

        try
        {
            var (league, aborted) = await CosmosHelper.UpdateLeagueAsync(container, timerInfo.LeagueId, league =>
            {
                if (league.AuctionTimer.IsPaused ||
                    league.Status.ToLower() != timerInfo.ExpectedStatus ||
                    league.CurrentPlayerId != timerInfo.PlayerId)
                {
                    log.LogInformation("Ignoring stale timer for league {LeagueName}.", league.Name);
                    return new OkResult();
                }

                if (league.Status.ToLower() == "drafting" || league.Status.ToLower() == "tiebreaker")
                {
                    var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
                    if (draftedPlayer == null) return new OkResult();

                    if (league.ActiveBids.Any())
                    {
                        var highBidAmount = league.ActiveBids.Max(b => b.Value.Amount);
                        var winningBids = league.ActiveBids.Where(b => b.Value.Amount == highBidAmount).ToList();

                        if (winningBids.Count == 1)
                        {
                            var winningBidEntry = winningBids.First();
                            var winningTeam = league.Teams.First(t => t.OwnerId == winningBidEntry.Key);
                            DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, winningBidEntry.Value.Amount);
                            nextTimerPlayerId = null;
                            nextTimerStatus = "intermission";
                            nextTimerDelay = league.DraftTimers.IntermissionTimer;
                            shouldQueueTimer = true;
                        }
                        else
                        {
                            league.Status = "tiebreaker";
                            league.TieBreaker = new TieBreakerInfo
                            {
                                TiedTeamIds = winningBids.Select(wb => wb.Key).ToList(),
                                TieAmount = highBidAmount,
                                Round = (league.TieBreaker?.Round ?? 0) + 1
                            };
                            league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.RebidTimer) };
                            league.ActiveBids.Clear();
                            nextTimerPlayerId = league.CurrentPlayerId;
                            nextTimerStatus = "tiebreaker";
                            nextTimerDelay = league.DraftTimers.RebidTimer;
                            shouldQueueTimer = true;
                        }
                    }
                    else
                    {
                        league.Status = "intermission";
                        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
                        nextTimerPlayerId = null;
                        nextTimerStatus = "intermission";
                        nextTimerDelay = league.DraftTimers.IntermissionTimer;
                        shouldQueueTimer = true;
                    }
                }
                else if (league.Status.ToLower() == "intermission")
                {
                    league.Status = "drafting";
                    league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);

                    if (league.CurrentPlayerId == null)
                    {
                        league.Status = "completed";
                    }
                    else
                    {
                        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer) };
                        nextTimerPlayerId = league.CurrentPlayerId;
                        nextTimerStatus = "drafting";
                        nextTimerDelay = league.DraftTimers.BidTimer;
                        shouldQueueTimer = true;
                    }
                }

                return null;
            }, log);

            if (aborted != null) return;

            if (shouldQueueTimer)
            {
                await QueueNextTimer(timerQueue, league.Id, nextTimerPlayerId, nextTimerStatus, nextTimerDelay);
            }

            await signalRMessages.AddAsync(new SignalRMessage
            {
                GroupName = timerInfo.LeagueId,
                Target = "draftStateUpdate",
                Arguments = new object[] { league.ForBroadcast() }
            });
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error processing auction timer for league {LeagueId}.", timerInfo.LeagueId);
        }
    }

    private static async Task QueueNextTimer(QueueClient queue, string leagueId, string playerId, string expectedStatus, int delayInSeconds)
    {
        var timerInfo = new TimerInfo
        {
            LeagueId = leagueId,
            PlayerId = playerId,
            ExpectedStatus = expectedStatus
        };
        var message = JsonConvert.SerializeObject(timerInfo);
        await queue.SendMessageAsync(message, TimeSpan.FromSeconds(delayInSeconds));
    }

    public class TimerInfo
    {
        public string LeagueId { get; set; }
        public string PlayerId { get; set; }
        public string ExpectedStatus { get; set; }
    }
}
