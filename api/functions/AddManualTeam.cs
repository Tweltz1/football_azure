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

public static class AddManualTeam
{
    [Function("AddManualTeam")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/manual-teams")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        AddManualTeamRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<AddManualTeamRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid manual team payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid manual team payload.");
        }

        if (data == null)
            return new BadRequestObjectResult("Manual team payload is required.");
        if (string.IsNullOrWhiteSpace(data.AdminId))
            return new BadRequestObjectResult("Admin ID is required.");

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(AppServices.LeaguesContainer, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (!DraftModeHelper.IsManual(league.DraftMode))
                    return new BadRequestObjectResult("Manual teams can only be added to manual drafts.");

                var status = (league.Status ?? string.Empty).ToLowerInvariant();
                if (status == "completed")
                    return new BadRequestObjectResult("Cannot add a team after the draft is completed.");

                var baseTeamName = string.IsNullOrWhiteSpace(data.TeamName)
                    ? $"Team {league.Teams.Count + 1}"
                    : data.TeamName.Trim();
                var teamName = TeamNameHelper.GetUniqueTeamName(league.Teams, baseTeamName, baseTeamName);
                var budget = data.Budget > 0 ? data.Budget : 200;

                league.Teams.Add(new Team
                {
                    Id = Guid.NewGuid().ToString(),
                    OwnerId = $"manual-{Guid.NewGuid()}",
                    Name = teamName,
                    Budget = budget,
                    Roster = new System.Collections.Generic.List<RosterSpot>(),
                    FavoritePlayerIds = new System.Collections.Generic.List<string>()
                });

                log?.LogInformation("Manual team {TeamName} added to league {LeagueName}.", teamName, league.Name);
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
            log?.LogError(ex, "Error adding manual team for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AddManualTeamRequest
    {
        public string AdminId { get; set; }
        public string TeamName { get; set; }
        public int Budget { get; set; }
    }
}
