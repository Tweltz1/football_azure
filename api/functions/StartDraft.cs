using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Linq;

public static class StartDraft
{
    [Function("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                var nonAdminMembers = league.Members.Where(id => id != league.AdminId).ToList();
                bool allNonAdminsReady = nonAdminMembers.All(memberId => league.ReadyMembers.Contains(memberId));

                if (!allNonAdminsReady && nonAdminMembers.Any())
                    return new BadRequestObjectResult("Not all other members are ready.");

                league.ClearActiveBids();
                league.TieBreaker = null;
                league.DraftMode = DraftModeHelper.Normalize(league.DraftMode);

                if (DraftModeHelper.IsManual(league.DraftMode))
                {
                    league.CurrentPlayerId = null;
                    league.Status = DraftModeHelper.Manual;
                    league.AuctionTimer = null;
                    return null;
                }

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

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkResult();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
