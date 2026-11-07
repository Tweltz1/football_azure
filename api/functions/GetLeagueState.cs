using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class GetLeagueState
{
    [Function("GetLeagueState")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "leagues/{leagueId}/state")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        var container = AppServices.LeaguesContainer;
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            if (await LeagueMemberProfileHelper.HydrateMissingAsync(league))
            {
                await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            }
            NflByeWeeks.ApplyToLeague(league);
            return new OkObjectResult(league);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
    }
}
