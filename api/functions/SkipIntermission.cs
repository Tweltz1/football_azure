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
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (league.AdminId != data.AdminId)
                return new UnauthorizedResult();

            if (league.Status.ToLower() != "intermission")
                return new BadRequestObjectResult("Can only skip during intermission.");

            log.LogInformation("Admin skipping intermission for league {LeagueName}.", league.Name);

            league.Status = "drafting";
            league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);

            if (league.CurrentPlayerId == null)
            {
                league.Status = "completed";
                log.LogInformation("Draft completed for league {LeagueName}.", league.Name);
            }
            else
            {
                league.AuctionTimer = new AuctionTimer
                {
                    EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                    IsPaused = false,
                    TimeRemainingOnPause = 0
                };
                league.ActiveBids.Clear();
                league.TieBreaker = null;
            }

            return null;
        }, log);

        if (error != null) return error;

        await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
        return new OkObjectResult("Intermission skipped.");
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
