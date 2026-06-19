using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class StartNextRound
{
    [Function("StartNextRound")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nextRound")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            league.EnsureDefaults();

            if (league.Status?.ToLowerInvariant() != "intermission" || league.AuctionTimer == null)
            {
                return new OkObjectResult("No intermission to advance.");
            }

            if (league.AuctionTimer.IsPaused || league.AuctionTimer.EndTime > DateTime.UtcNow)
            {
                return new OkObjectResult("Intermission timer is still active.");
            }

            league.ClearActiveBids();
            league.TieBreaker = null;
            league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);

            if (league.CurrentPlayerId == null)
            {
                league.Status = "completed";
                league.AuctionTimer = null;
            }
            else
            {
                league.Status = "drafting";
                league.AuctionTimer = new AuctionTimer
                {
                    EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                    IsPaused = false,
                    TimeRemainingOnPause = 0
                };
            }

            await container.ReplaceItemAsync(
                league,
                league.Id,
                new PartitionKey(league.Id),
                new ItemRequestOptions { IfMatchEtag = leagueResponse.ETag });
            await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Next round started.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
        {
            log.LogInformation(ex, "Next round already handled for league {LeagueId}.", leagueId);
            return new OkObjectResult("Next round already handled.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting next round for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }
}
