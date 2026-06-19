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

public static class AssignBeerBitch
{
    [FunctionName("AssignBeerBitch")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/beer-bitch")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AssignBeerBitchRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }

            league.BeerBitchTeamId = data.TeamId;
            log.LogInformation("Team {TeamId} assigned beer duty in league {LeagueName}.", data.TeamId, league.Name);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Beer Bitch assigned successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error assigning beer bitch.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AssignBeerBitchRequest
    {
        public string AdminId { get; set; }
        public string TeamId { get; set; }
    }
}
