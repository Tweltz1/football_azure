using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class CheckLeagueName
{
    [Function("CheckLeagueName")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "CheckLeagueName")] HttpRequest req,
        ILogger log)
    {
        string leagueName = req.Query["leagueName"];

        if (string.IsNullOrEmpty(leagueName))
        {
            return new BadRequestObjectResult("Please provide a league name.");
        }

        var container = AppServices.LeaguesContainer;
        var query = new QueryDefinition("SELECT * FROM c WHERE c.name = @leagueName")
            .WithParameter("@leagueName", leagueName);

        var result = await container.GetItemQueryIterator<League>(query).ReadNextAsync();

        return new OkObjectResult(new { isUnique = result.Count == 0 });
    }
}
