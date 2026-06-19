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

public static class AssignBeerBitch
{
    [Function("AssignBeerBitch")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/beer-bitch")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        AssignBeerBitchRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<AssignBeerBitchRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid beer duty payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid beer duty payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.AdminId) || string.IsNullOrWhiteSpace(data.TeamId))
        {
            return new BadRequestObjectResult("Admin ID and team ID are required.");
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

                var beerDutyTeam = league.Teams.FirstOrDefault(t => t?.Id == data.TeamId);
                if (beerDutyTeam == null)
                {
                    return new NotFoundObjectResult("Team not found.");
                }

                league.BeerBitchTeamId = beerDutyTeam.Id;
                log?.LogInformation("Team {TeamId} assigned beer duty in league {LeagueName}.", beerDutyTeam.Id, league.Name);

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult("Beer duty assigned successfully.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error assigning beer duty for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AssignBeerBitchRequest
    {
        public string AdminId { get; set; }
        public string TeamId { get; set; }
    }
}
