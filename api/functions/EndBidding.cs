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

public static class EndBidding
{
    [FunctionName("EndBidding")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/endBidding")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            var status = league.Status?.ToLowerInvariant();

            if ((status != "drafting" && status != "tiebreaker") || league.AuctionTimer == null)
            {
                return new OkObjectResult("No active auction to close.");
            }

            if (league.AuctionTimer.IsPaused || league.AuctionTimer.EndTime > DateTime.UtcNow)
            {
                return new OkObjectResult("Auction timer is still active.");
            }

            var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);
            if (draftedPlayer == null)
            {
                return new BadRequestObjectResult("Current player was not found.");
            }

            if (league.ActiveBids.Any())
            {
                var highBidAmount = league.ActiveBids.Max(b => b.Value.Amount);
                var winningBids = league.ActiveBids.Where(b => b.Value.Amount == highBidAmount).ToList();

                if (winningBids.Count == 1)
                {
                    var winningBidEntry = winningBids.First();
                    var winningTeam = league.Teams.FirstOrDefault(t => t.OwnerId == winningBidEntry.Key);
                    if (winningTeam == null)
                    {
                        return new BadRequestObjectResult("Winning team was not found.");
                    }

                    DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, winningBidEntry.Value.Amount);
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
                    league.AuctionTimer = new AuctionTimer
                    {
                        EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.RebidTimer),
                        IsPaused = false,
                        TimeRemainingOnPause = 0
                    };
                    league.ActiveBids.Clear();
                }
            }
            else
            {
                league.Status = "intermission";
                league.CurrentPlayerId = null;
                league.TieBreaker = null;
                league.AuctionTimer = new AuctionTimer
                {
                    EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer),
                    IsPaused = false,
                    TimeRemainingOnPause = 0
                };
            }

            await container.ReplaceItemAsync(
                league,
                league.Id,
                new PartitionKey(league.Id),
                new ItemRequestOptions { IfMatchEtag = leagueResponse.ETag });
            await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });

            return new OkObjectResult("Auction closed.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
        {
            log.LogInformation(ex, "Auction close already handled for league {LeagueId}.", leagueId);
            return new OkObjectResult("Auction already closed.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error ending bidding for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }
}
