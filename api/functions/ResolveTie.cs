using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Linq;

public static class ResolveTie
{
    [Function("ResolveTie")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/resolve-tie")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<ResolveTieRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (league.AdminId != data.AdminId)
                return new UnauthorizedResult();

            if (league.Status.ToLower() != "tiebreaker" || league.TieBreaker?.Round != 2)
                return new BadRequestObjectResult("Can only resolve a second-round tie.");

            var winningTeam = league.Teams.FirstOrDefault(t => t.Id == data.WinningTeamId);
            var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);

            if (winningTeam == null || draftedPlayer == null)
                return new NotFoundObjectResult("Team or player not found.");

            log.LogInformation("Admin resolved tie, awarding {PlayerName} to {TeamName}.", draftedPlayer.Name, winningTeam.Name);
            DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, league.TieBreaker.TieAmount);

            return null;
        }, log);

        if (error != null) return error;

        await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
        return new OkObjectResult("Tie resolved.");
    }

    public class ResolveTieRequest
    {
        public string AdminId { get; set; }
        public string WinningTeamId { get; set; }
    }
}
