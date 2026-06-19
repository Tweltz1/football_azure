using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class UndoLastPick
{
    [Function("UndoLastPick")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/undo-pick")] HttpRequest req,
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
            log?.LogWarning(ex, "Invalid undo-pick payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid undo-pick payload.");
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
                    return new UnauthorizedResult();

                if (league.Status?.ToLowerInvariant() != "intermission")
                    return new BadRequestObjectResult("Can only undo a pick during intermission.");

                var lastPick = league.DraftLog.LastOrDefault();
                if (lastPick == null)
                    return new BadRequestObjectResult("There are no picks to undo.");

                var playerId = lastPick.Player?.Id;
                if (string.IsNullOrWhiteSpace(playerId))
                    return new BadRequestObjectResult("The last pick is missing player data and cannot be undone safely.");

                var winningTeam = league.Teams.FirstOrDefault(t => t?.Id == lastPick.WinningTeamId);
                if (winningTeam == null)
                    return new NotFoundObjectResult("Winning team not found.");

                var playerInPool = league.InitialPlayerPool.FirstOrDefault(p => p?.Id == playerId);
                if (playerInPool == null)
                {
                    playerInPool = lastPick.Player;
                    league.InitialPlayerPool.Add(playerInPool);
                }

                winningTeam.Roster = winningTeam.Roster ?? new System.Collections.Generic.List<RosterSpot>();
                winningTeam.Budget += lastPick.WinningBid;
                winningTeam.Roster.RemoveAll(spot => spot?.Player?.Id == playerId);

                playerInPool.IsDrafted = false;
                playerInPool.Price = 0;

                league.DraftLog.Remove(lastPick);
                league.ClearActiveBids();
                league.TieBreaker = null;
                league.CurrentPlayerId = null;

                log?.LogInformation("Admin undid the last pick: {PlayerName} from {TeamName} for league {LeagueName}.", playerInPool.Name, winningTeam.Name, league.Name);
                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult("Last pick has been undone.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error undoing last pick for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
