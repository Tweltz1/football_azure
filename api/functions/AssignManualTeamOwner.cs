using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class AssignManualTeamOwner
{
    [Function("AssignManualTeamOwner")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/manual-teams/assign")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        AssignManualTeamOwnerRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<AssignManualTeamOwnerRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid manual team assignment payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid manual team assignment payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.AdminId) || string.IsNullOrWhiteSpace(data.TeamId) || string.IsNullOrWhiteSpace(data.UserId))
        {
            return new BadRequestObjectResult("Admin ID, team ID, and user ID are required.");
        }

        try
        {
            var userProfile = await UserProfileStore.FindAsync(data.UserId);
            var userFavorites = userProfile?.FavoritePlayerIds ?? new List<string>();

            var (league, error) = await CosmosHelper.UpdateLeagueAsync(AppServices.LeaguesContainer, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (!DraftModeHelper.IsManual(league.DraftMode))
                    return new BadRequestObjectResult("Manual team assignment is only available for manual drafts.");

                if (!league.Members.Contains(data.UserId))
                    return new BadRequestObjectResult("That user has not joined this league yet.");

                var targetTeam = league.Teams.FirstOrDefault(team => team?.Id == data.TeamId);
                if (targetTeam == null)
                    return new NotFoundObjectResult("Team not found.");

                foreach (var team in league.Teams.Where(team => team?.OwnerId == data.UserId))
                {
                    team.OwnerId = $"manual-{Guid.NewGuid()}";
                }

                targetTeam.OwnerId = data.UserId;
                targetTeam.FavoritePlayerIds = userFavorites;

                log?.LogInformation("Manual team {TeamName} assigned to user {UserId} in league {LeagueName}.", targetTeam.Name, data.UserId, league.Name);
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
            log?.LogError(ex, "Error assigning manual team owner for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AssignManualTeamOwnerRequest
    {
        public string AdminId { get; set; }
        public string TeamId { get; set; }
        public string UserId { get; set; }
    }
}
