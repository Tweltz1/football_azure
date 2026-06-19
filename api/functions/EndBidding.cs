using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class EndBidding
{
    [Function("EndBidding")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/endBidding")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            league.EnsureDefaults();
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

            if (status == "tiebreaker")
            {
                var tieDefaultsError = AddDefaultTieBreakerBids(league, log);
                if (tieDefaultsError != null)
                {
                    return tieDefaultsError;
                }
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
                    var previousTieRound = status == "tiebreaker" ? (league.TieBreaker?.Round ?? 1) : 0;
                    league.Status = "tiebreaker";
                    league.TieBreaker = new TieBreakerInfo
                    {
                        TiedTeamIds = winningBids.Select(wb => wb.Key).ToList(),
                        TieAmount = highBidAmount,
                        Round = previousTieRound >= 1 ? 2 : 1
                    };
                    league.ClearActiveBids();

                    if (league.TieBreaker.Round == 2)
                    {
                        league.AuctionTimer = new AuctionTimer
                        {
                            EndTime = DateTime.UtcNow,
                            IsPaused = true,
                            TimeRemainingOnPause = 0
                        };
                    }
                    else
                    {
                        league.AuctionTimer = new AuctionTimer
                        {
                            EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.RebidTimer),
                            IsPaused = false,
                            TimeRemainingOnPause = 0
                        };
                    }
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
            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);

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

    private static IActionResult AddDefaultTieBreakerBids(League league, ILogger log)
    {
        if (league.TieBreaker == null || league.TieBreaker.TiedTeamIds == null || !league.TieBreaker.TiedTeamIds.Any())
        {
            return new BadRequestObjectResult("Tie-breaker state is missing tied teams.");
        }

        if (league.TieBreaker.Round >= 2)
        {
            return null;
        }

        var requiredBid = league.TieBreaker.TieAmount + 1;
        foreach (var tiedUserId in league.TieBreaker.TiedTeamIds.Distinct())
        {
            if (league.ActiveBids.ContainsKey(tiedUserId))
            {
                continue;
            }

            var tiedTeam = league.Teams.FirstOrDefault(t => t.OwnerId == tiedUserId);
            if (tiedTeam == null)
            {
                log?.LogWarning("Unable to find tied team for user {UserId} while adding default tie-breaker bid.", tiedUserId);
                continue;
            }

            var maxBid = GetMaxBid(league, tiedTeam);
            if (requiredBid > maxBid)
            {
                log?.LogWarning(
                    "Team {TeamName} could not receive default tie-breaker bid of {RequiredBid}; max bid is {MaxBid}.",
                    tiedTeam.Name,
                    requiredBid,
                    maxBid);
                continue;
            }

            league.ActiveBids[tiedUserId] = new Bid
            {
                Amount = requiredBid,
                Timestamp = DateTime.UtcNow
            };
        }

        return null;
    }

    private static int GetMaxBid(League league, Team team)
    {
        var totalRosterSpots = league.RosterSettings.QB + league.RosterSettings.RB + league.RosterSettings.WR +
                               league.RosterSettings.TE + league.RosterSettings.K + league.RosterSettings.DEF +
                               league.RosterSettings.FLEX + league.RosterSettings.SuperFlex + league.RosterSettings.Bench;
        var spotsToFill = totalRosterSpots - (team.Roster?.Count ?? 0);
        return team.Budget - (spotsToFill > 0 ? spotsToFill - 1 : 0);
    }
}
