using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Linq;

public static class SubmitTieBreakerBid
{
    [Function("SubmitTieBreakerBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/tiebreaker-bid")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var bidRequest = JsonConvert.DeserializeObject<BidRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(bidRequest?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            league.EnsureDefaults();

            if (league.Status?.ToLowerInvariant() != "tiebreaker")
                return new BadRequestObjectResult("Not in a tie-breaker round.");

            if (league.TieBreaker == null || !league.TieBreaker.TiedTeamIds.Contains(bidRequest.UserId))
                return new UnauthorizedResult();

            if (league.TieBreaker.Round >= 2)
                return new BadRequestObjectResult("This tie is locked for admin resolution.");

            if (bidRequest.Amount <= league.TieBreaker.TieAmount)
                return new BadRequestObjectResult($"Bid must be greater than the tie amount of ${league.TieBreaker.TieAmount}.");

            var biddingTeam = league.Teams.FirstOrDefault(t => t.OwnerId == bidRequest.UserId);
            if (biddingTeam == null) return new NotFoundObjectResult("Team not found.");

            var maxBid = BidRules.GetMaxBid(league, biddingTeam);
            if (bidRequest.Amount > maxBid)
                return new BadRequestObjectResult($"Your bid of ${bidRequest.Amount} exceeds your max bid of ${maxBid}. You must keep at least $1 for each remaining roster spot.");

            league.ActiveBids[bidRequest.UserId] = new Bid { Amount = bidRequest.Amount, Timestamp = DateTime.UtcNow };
            return null;
        }, log);

        if (error != null) return error;

        await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
        return new OkObjectResult("Tie-breaker bid submitted.");
    }

    public class BidRequest
    {
        public string UserId { get; set; }
        public int Amount { get; set; }
    }
}
