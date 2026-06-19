using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class GetLeagues
{
    [FunctionName("GetLeagues")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = null)] HttpRequest req,
        ILogger log)
    {
        string userId = req.Query["userId"];

        if (string.IsNullOrEmpty(userId))
        {
            return new BadRequestObjectResult("Please provide a userId in the query string.");
        }

        var container = AppServices.LeaguesContainer;
        var query = new QueryDefinition("SELECT * FROM c WHERE ARRAY_CONTAINS(c.members, @userId)")
            .WithParameter("@userId", userId);

        var leagues = new List<League>();
        using (FeedIterator<League> feedIterator = container.GetItemQueryIterator<League>(query))
        {
            while (feedIterator.HasMoreResults)
            {
                foreach (var league in await feedIterator.ReadNextAsync())
                {
                    leagues.Add(league);
                }
            }
        }

        return new OkObjectResult(leagues);
    }
}
