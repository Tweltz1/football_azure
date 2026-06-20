using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Linq;

public static class SubmitFinalBid
{
    [Function("SubmitFinalBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/submit-final-bid")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<FinalBidRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(data?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            if (data.Amount <= 0) return new BadRequestObjectResult("Bid must be at least $1.");

            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                var biddingTeam = league.Teams.FirstOrDefault(t => t.OwnerId == data.UserId);
                if (biddingTeam == null) return new NotFoundObjectResult("Team not found.");

                var maxBid = BidRules.GetMaxBid(league, biddingTeam);
                if (data.Amount > maxBid)
                    return new BadRequestObjectResult($"Your bid of ${data.Amount} exceeds your max bid of ${maxBid}. You must keep at least $1 for each remaining roster spot.");

                league.ActiveBids[data.UserId] = new Bid { Amount = data.Amount, Timestamp = DateTime.UtcNow };
                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkResult();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error submitting final bid.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class FinalBidRequest
    {
        public string UserId { get; set; }
        public int Amount { get; set; }
    }
}
