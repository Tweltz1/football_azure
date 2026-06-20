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
                        PauseForAdminTieResolution(league);
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
            else if (status == "tiebreaker")
            {
                var cappedTieError = MoveCappedTieToAdminResolution(league, log);
                if (cappedTieError != null)
                {
                    return cappedTieError;
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

            var maxBid = BidRules.GetMaxBid(league, tiedTeam);
            if (requiredBid > maxBid)
            {
                log?.LogInformation(
                    "Team {TeamName} cannot receive default tie-breaker bid of {RequiredBid}; max bid is {MaxBid}.",
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

    private static IActionResult MoveCappedTieToAdminResolution(League league, ILogger log)
    {
        if (league.TieBreaker == null || league.TieBreaker.TiedTeamIds == null || !league.TieBreaker.TiedTeamIds.Any())
        {
            return new BadRequestObjectResult("Tie-breaker state is missing tied teams.");
        }

        var requiredBid = league.TieBreaker.TieAmount + 1;
        var tiedTeams = league.TieBreaker.TiedTeamIds
            .Distinct()
            .Select(userId => league.Teams.FirstOrDefault(team => team.OwnerId == userId))
            .Where(team => team != null)
            .ToList();

        if (!tiedTeams.Any())
        {
            return new BadRequestObjectResult("No tied teams were found.");
        }

        var teamsAbleToRebid = tiedTeams.Where(team => BidRules.GetMaxBid(league, team) >= requiredBid).ToList();
        if (teamsAbleToRebid.Any())
        {
            log?.LogWarning(
                "Tie-breaker ended with no active bids even though {Count} tied team(s) could still bid. Moving to admin resolution to avoid skipping the player.",
                teamsAbleToRebid.Count);
        }
        else
        {
            log?.LogInformation("All tied teams are capped at the tie amount. Moving to admin resolution.");
        }

        league.Status = "tiebreaker";
        league.TieBreaker.Round = 2;
        league.ClearActiveBids();
        PauseForAdminTieResolution(league);
        return null;
    }

    private static void PauseForAdminTieResolution(League league)
    {
        league.AuctionTimer = new AuctionTimer
        {
            EndTime = DateTime.UtcNow,
            IsPaused = true,
            TimeRemainingOnPause = 0
        };
    }
}
