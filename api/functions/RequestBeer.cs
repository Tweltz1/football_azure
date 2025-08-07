using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;
using System.Linq;

public static class RequestBeer
{
    [FunctionName("RequestBeer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/request-beer")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<BeerRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
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

        // Send a targeted message only to the user on beer duty
        var beerDutyTeam = league.Teams.FirstOrDefault(t => t.Id == league.BeerBitchTeamId); // <-- THIS LINE IS FIXED (t.Id)
        if (beerDutyTeam != null)
        {
            await signalRMessages.AddAsync(new SignalRMessage
            {
                // This targets the specific user, not everyone
                UserId = beerDutyTeam.OwnerId, 
                Target = "beerRequestReceived",
                Arguments = new object[] { requestingTeam.Name }
            });
        }

        return new OkResult();
    }

    public class BeerRequest
    {
        public string RequestingTeamId { get; set; }
    }
}