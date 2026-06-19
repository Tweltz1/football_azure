using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class CompleteDraft
{
    [Function("CompleteDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/complete")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        AdminActionRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid complete draft payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid complete draft payload.");
        }

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
                {
                    return new UnauthorizedResult();
                }

                league.Status = "completed";
                league.CurrentPlayerId = null;
                league.ClearActiveBids();
                league.AuctionTimer = null;
                league.TieBreaker = null;

                return null;
            }, log);

            if (error != null) return error;

            log?.LogInformation("Draft completed for league {LeagueName}.", league.Name);

            var broadcast = league.ForBroadcast();
            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);

            return new OkObjectResult(broadcast);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error completing draft for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
