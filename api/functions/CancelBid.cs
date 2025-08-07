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
using System.Linq;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class CancelBid
{
    [FunctionName("CancelBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/cancel-bid")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<CancelBidRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.ActiveBids.ContainsKey(data.UserId))
            {
                league.ActiveBids.Remove(data.UserId);
                log.LogInformation($"User {data.UserId} cancelled their bid in league {league.Name}.");

                await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
                await signalRMessages.AddAsync(new SignalRMessage { Target = "draftStateUpdate", Arguments = new object[] { league } });
            }

            return new OkObjectResult("Bid cancelled successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error cancelling bid.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class CancelBidRequest
    {
        public string UserId { get; set; }
    }
}