using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using Newtonsoft.Json;

public static class ProcessAuctionResults
{
    private class AuctionResultMessage { public string LeagueId { get; set; } public string AuctionPlayerId { get; set; } }

    [FunctionName("ProcessAuctionResults")]
    public static async Task Run(
        [QueueTrigger("process-auction-results", Connection = "AzureWebJobsStorage")] string myQueueItem,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        log.LogInformation($"ProcessAuctionResults triggered: {myQueueItem}");
        
        var message = JsonConvert.DeserializeObject<AuctionResultMessage>(myQueueItem);
        var leagueId = message.LeagueId;

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var league = (await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId))).Resource;

        // Validation checks
        if (league?.CurrentAuction?.Status != "awaiting_final_bids") { log.LogWarning("...Aborting, auction not in correct state."); return; }
        if (league.CurrentAuction.PlayerId != message.AuctionPlayerId) { log.LogWarning("...Aborting, stale message."); return; }

        var bids = league.CurrentAuction.FinalBids;
        var draftedPlayer = league.DraftPlayers.FirstOrDefault(p => p.Id == league.CurrentAuction.PlayerId);
        if (draftedPlayer == null) { log.LogError($"Player not found: {league.CurrentAuction.PlayerId}"); return; }
        
        // Determine Winner
        if (bids.Any())
        {
            // Tie-breaker: highest bid wins, then earliest teamId alphabetically
            var winningBidEntry = bids.OrderByDescending(b => b.Value).ThenBy(b => b.Key).First();
            var winningTeamId = winningBidEntry.Key;
            var winningBid = winningBidEntry.Value;
            var winningTeam = league.Teams.First(t => t.Id == winningTeamId);

            // Update player and team state
            draftedPlayer.IsDrafted = true;
            draftedPlayer.Price = winningBid;
            winningTeam.Budget -= winningBid;
            winningTeam.Roster.Add(new RosterSpot { Player = draftedPlayer, Position = draftedPlayer.Position });

            league.DraftLog.Add(new DraftPick { WinningTeamId = winningTeam.Id, WinningBid = winningBid, Player = draftedPlayer });
        }
        else
        {
            log.LogInformation($"Player {draftedPlayer.Name} received no bids.");
        }

        // Transition to Intermission
        league.Status = "drafting"; 
        league.CurrentAuction = new CurrentAuction {
            Status = "intermission",
            AuctionTimer = new AuctionTimer {
                EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer)
            }
        };

        // Save and Broadcast the final results
        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
        await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });
    }
}