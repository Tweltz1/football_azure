using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class CompleteDraft
{
    [FunctionName("CompleteDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/complete")] HttpRequest req,
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

            league.Status = "completed";
            league.CurrentPlayerId = null;
            league.ActiveBids.Clear();
            league.AuctionTimer = null;

            log.LogInformation("Draft completed for league {LeagueName}.", league.Name);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Draft completed successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error completing draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
