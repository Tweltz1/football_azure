using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UndoLastPick
{
    [Function("UndoLastPick")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/undo-pick")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (league.Status.ToLower() != "intermission")
                    return new BadRequestObjectResult("Can only undo a pick during intermission.");

                if (!league.DraftLog.Any())
                    return new BadRequestObjectResult("There are no picks to undo.");

                var lastPick = league.DraftLog.Last();
                var winningTeam = league.Teams.FirstOrDefault(t => t.Id == lastPick.WinningTeamId);
                var playerInPool = league.InitialPlayerPool.FirstOrDefault(p => p.Id == lastPick.Player.Id);

                if (winningTeam != null && playerInPool != null)
                {
                    log.LogInformation("Admin is undoing the last pick: {PlayerName} from {TeamName}.", playerInPool.Name, winningTeam.Name);

                    winningTeam.Budget += lastPick.WinningBid;
                    winningTeam.Roster.RemoveAll(spot => spot.Player.Id == playerInPool.Id);
                    playerInPool.IsDrafted = false;
                    playerInPool.Price = 0;
                    league.DraftLog.Remove(lastPick);
                }

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
            return new OkObjectResult("Last pick has been undone.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error undoing last pick.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
