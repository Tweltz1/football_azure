using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using System.Linq;

public static class CheckLeagueName
{
    [FunctionName("CheckLeagueName")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "CheckLeagueName")] HttpRequest req,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string leagueName = req.Query["leagueName"];
        
        if (string.IsNullOrEmpty(leagueName))
        {
            return new BadRequestObjectResult("Please provide a league name.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var query = new QueryDefinition("SELECT * FROM c WHERE c.name = @leagueName");
        query.WithParameter("@leagueName", leagueName);

        var result = await container.GetItemQueryIterator<League>(query).ReadNextAsync();

        if (result.Count > 0)
        {
            return new OkObjectResult(new { isUnique = false });
        }
        
        return new OkObjectResult(new { isUnique = true });
    }
}