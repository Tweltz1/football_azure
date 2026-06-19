using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class CancelBid
{
    [Function("CancelBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/cancel-bid")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<CancelBidRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(data?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.ActiveBids.ContainsKey(data.UserId))
                {
                    league.ActiveBids.Remove(data.UserId);
                    log.LogInformation("User {UserId} cancelled their bid in league {LeagueName}.", data.UserId, league.Name);
                }
                return null;
            }, log);

            if (error != null) return error;

            await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
            return new OkObjectResult("Bid cancelled successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error cancelling bid.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class CancelBidRequest
    {
        public string UserId { get; set; }
    }
}
