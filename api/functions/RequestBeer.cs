using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using System.Linq;

public static class RequestBeer
{
    [Function("RequestBeer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/request-beer")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<BeerRequest>(requestBody);

        var container = AppServices.LeaguesContainer;
        var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
        var league = leagueResponse.Resource;

        if (league.BeerBitchTeamId == null)
        {
            return new BadRequestObjectResult("No team is currently on beer duty.");
        }

        var requestingTeam = league.Teams.FirstOrDefault(t => t.Id == data.RequestingTeamId);
        if (requestingTeam == null)
        {
            return new NotFoundObjectResult("Requesting team not found.");
        }

        var beerDutyTeam = league.Teams.FirstOrDefault(t => t.Id == league.BeerBitchTeamId);
        if (beerDutyTeam != null)
        {
            await AppServices.SendToUserAsync(beerDutyTeam.OwnerId, "beerRequestReceived", requestingTeam.Name);
        }

        return new OkResult();
    }

    public class BeerRequest
    {
        public string RequestingTeamId { get; set; }
    }
}
