using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class ManualSelectPlayer
{
    [Function("ManualSelectPlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/manual-current-player")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        ManualSelectPlayerRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<ManualSelectPlayerRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid manual current-player payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid manual current-player payload.");
        }

        if (data == null)
            return new BadRequestObjectResult("Manual current-player payload is required.");
        if (string.IsNullOrWhiteSpace(data.AdminId))
            return new BadRequestObjectResult("Admin ID is required.");
        if (string.IsNullOrWhiteSpace(data.PlayerId))
            return new BadRequestObjectResult("Player ID is required.");

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(AppServices.LeaguesContainer, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (!DraftModeHelper.IsManual(league.DraftMode) || league.Status?.ToLowerInvariant() != DraftModeHelper.Manual)
                    return new BadRequestObjectResult("Manual player selection is only available during a manual draft.");

                var selectedPlayer = league.InitialPlayerPool.FirstOrDefault(player => player?.Id == data.PlayerId);
                if (selectedPlayer == null || selectedPlayer.IsDrafted)
                    return new BadRequestObjectResult("Player is not available.");

                league.CurrentPlayerId = selectedPlayer.Id;
                league.ClearActiveBids();
                league.TieBreaker = null;
                league.AuctionTimer = null;

                log?.LogInformation("Manual current player set to {PlayerName} for league {LeagueName}.", selectedPlayer.Name, league.Name);
                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult(league.ForBroadcast());
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error selecting manual current player for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class ManualSelectPlayerRequest
    {
        public string AdminId { get; set; }
        public string PlayerId { get; set; }
    }
}
