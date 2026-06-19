using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class SkipPlayer
{
    [Function("SkipPlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/skip")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }

            league.ActiveBids.Clear();
            league.TieBreaker = null;
            league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league, league.CurrentPlayerId);

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

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Player skipped successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error skipping player.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest { public string AdminId { get; set; } }
}
