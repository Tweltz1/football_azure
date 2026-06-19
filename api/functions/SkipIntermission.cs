using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class SkipIntermission
{
    [Function("SkipIntermission")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/skip-intermission")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

            if (string.IsNullOrEmpty(data?.AdminId))
            {
                return new BadRequestObjectResult("Admin ID is required.");
            }

            var container = AppServices.LeaguesContainer;

            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (league.Status?.ToLowerInvariant() != "intermission")
                    return new BadRequestObjectResult("Can only skip during intermission.");

                log?.LogInformation("Admin skipping intermission for league {LeagueName}.", league.Name);

                league.Status = "drafting";
                league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);

                if (league.CurrentPlayerId == null)
                {
                    league.Status = "completed";
                    league.AuctionTimer = null;
                    league.ClearActiveBids();
                    league.TieBreaker = null;
                    log?.LogInformation("Draft completed for league {LeagueName}.", league.Name);
                }
                else
                {
                    league.AuctionTimer = new AuctionTimer
                    {
                        EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                        IsPaused = false,
                        TimeRemainingOnPause = 0
                    };
                    league.ClearActiveBids();
                    league.TieBreaker = null;
                }

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult("Intermission skipped.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error skipping intermission for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
