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
using System.Linq; // <-- Add this line

public static class GetDraftState
{
    [FunctionName("GetDraftState")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "leagues/{leagueId}/draftState")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League league = leagueResponse.Resource;

            // Find the current player in the league's player pool
            var currentPlayer = league.InitialPlayerPool
				.FirstOrDefault(p => p.Id == league.CurrentAuction.PlayerId);

			return new OkObjectResult(new {
				leagueStatus     = league.Status,
				currentPlayer   = currentPlayer,
				auctionTimer    = league.CurrentAuction.AuctionTimer,
				teams           = league.Teams
			});
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error fetching draft state.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }
}