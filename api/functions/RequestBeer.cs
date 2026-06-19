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

public static class RequestBeer
{
    [Function("RequestBeer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/request-beer")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        BeerRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<BeerRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid beer request payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid beer request payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.RequestingTeamId))
        {
            return new BadRequestObjectResult("Requesting team ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            league.EnsureDefaults();

            if (string.IsNullOrWhiteSpace(league.BeerBitchTeamId))
            {
                return new BadRequestObjectResult("No team is currently on beer duty.");
            }

            var requestingTeam = league.Teams.FirstOrDefault(t => t?.Id == data.RequestingTeamId);
            if (requestingTeam == null)
            {
                return new NotFoundObjectResult("Requesting team not found.");
            }

            var beerDutyTeam = league.Teams.FirstOrDefault(t => t?.Id == league.BeerBitchTeamId);
            if (beerDutyTeam == null || string.IsNullOrWhiteSpace(beerDutyTeam.OwnerId))
            {
                return new NotFoundObjectResult("Beer duty team not found.");
            }

            try
            {
                await AppServices.SendToUserAsync(beerDutyTeam.OwnerId, "beerRequestReceived", requestingTeam.Name);
            }
            catch (Exception ex)
            {
                log?.LogWarning(ex, "Direct beer request notification failed for beer duty owner {OwnerId}; trying league group.", beerDutyTeam.OwnerId);
                await AppServices.SendToGroupAsync(leagueId, "beerRequestReceived", requestingTeam.Name);
            }

            return new OkObjectResult("Beer request sent.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error sending beer request for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class BeerRequest
    {
        public string RequestingTeamId { get; set; }
    }
}
