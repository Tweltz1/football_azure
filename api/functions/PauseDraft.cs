using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class PauseDraft
{
    [Function("PauseDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/pause")] HttpRequest req,
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
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            league.EnsureDefaults();

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
            if (league.AuctionTimer == null) { return new BadRequestObjectResult("There is no active draft timer to pause."); }

            league.AuctionTimer.IsPaused = !league.AuctionTimer.IsPaused;

            if (league.AuctionTimer.IsPaused)
            {
                var timeRemaining = (league.AuctionTimer.EndTime - DateTime.UtcNow).TotalSeconds;
                league.AuctionTimer.TimeRemainingOnPause = (int)Math.Max(0, timeRemaining);
            }
            else
            {
                league.AuctionTimer.EndTime = DateTime.UtcNow.AddSeconds(league.AuctionTimer.TimeRemainingOnPause);
                league.AuctionTimer.TimeRemainingOnPause = 0;
            }

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);

            return new OkObjectResult(league.AuctionTimer);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error pausing/resuming draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest { public string AdminId { get; set; } }
}
