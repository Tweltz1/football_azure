using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Linq;

public static class NominatePlayer
{
    [Function("NominatePlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/nominate")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<NominatePlayerRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(data?.AdminId) || string.IsNullOrWhiteSpace(data.PlayerId))
        {
            return new BadRequestObjectResult("Admin ID and player ID are required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (league.AuctionTimer == null || !league.AuctionTimer.IsPaused)
                    return new BadRequestObjectResult("Draft must be paused to nominate a player.");

                var playerToNominate = league.InitialPlayerPool.FirstOrDefault(p => p.Id == data.PlayerId);
                if (playerToNominate == null || playerToNominate.IsDrafted)
                    return new BadRequestObjectResult("Player is not available to be nominated.");

                league.Status = "drafting";
                league.CurrentPlayerId = playerToNominate.Id;
                league.ClearActiveBids();
                league.TieBreaker = null;
                league.AuctionTimer = new AuctionTimer
                {
                    EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                    IsPaused = false,
                    TimeRemainingOnPause = 0
                };

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
            return new OkObjectResult("Player nominated successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error nominating player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class NominatePlayerRequest
    {
        public string AdminId { get; set; }
        public string PlayerId { get; set; }
    }
}
