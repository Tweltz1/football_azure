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
        var container = AppServices.LeaguesContainer;

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (league.Status.ToLower() != "tiebreaker")
                return new BadRequestObjectResult("Not in a tie-breaker round.");

            if (league.TieBreaker == null || !league.TieBreaker.TiedTeamIds.Contains(bidRequest.UserId))
                return new UnauthorizedResult();

            if (bidRequest.Amount <= league.TieBreaker.TieAmount)
                return new BadRequestObjectResult($"Bid must be greater than the tie amount of ${league.TieBreaker.TieAmount}.");

            var biddingTeam = league.Teams.FirstOrDefault(t => t.OwnerId == bidRequest.UserId);
            if (biddingTeam == null) return new NotFoundObjectResult("Team not found.");

            var totalRosterSpots = league.RosterSettings.QB + league.RosterSettings.RB + league.RosterSettings.WR +
                                   league.RosterSettings.TE + league.RosterSettings.K + league.RosterSettings.DEF +
                                   league.RosterSettings.FLEX + league.RosterSettings.SuperFlex + league.RosterSettings.Bench;
            var spotsToFill = totalRosterSpots - biddingTeam.Roster.Count;
            var maxBid = biddingTeam.Budget - (spotsToFill > 0 ? spotsToFill - 1 : 0);

            if (bidRequest.Amount > maxBid)
                return new BadRequestObjectResult($"Your bid of ${bidRequest.Amount} exceeds your max bid of ${maxBid}.");

            league.ActiveBids[bidRequest.UserId] = new Bid { Amount = bidRequest.Amount, Timestamp = DateTime.UtcNow };
            return null;
        }, log);

        if (error != null) return error;

        await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
        return new OkObjectResult("Tie-breaker bid submitted.");
    }

    public class BidRequest
    {
        public string UserId { get; set; }
        public int Amount { get; set; }
    }
}
