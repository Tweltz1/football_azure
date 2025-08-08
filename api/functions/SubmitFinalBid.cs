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

public static class SubmitFinalBid
{
    [FunctionName("SubmitFinalBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/submit-final-bid")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<FinalBidRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            // Only record bids that are greater than 0
            if (data.Amount > 0)
            {
                league.ActiveBids[data.UserId] = new Bid { Amount = data.Amount, Timestamp = DateTime.UtcNow };
                await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            }

            return new OkResult();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error submitting final bid.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class FinalBidRequest
    {
        public string UserId { get; set; }
        public int Amount { get; set; }
    }
}