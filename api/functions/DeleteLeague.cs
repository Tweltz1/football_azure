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

public static class DeleteLeague
{
    [FunctionName("DeleteLeague")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "leagues/{leagueId}")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasty Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<DeleteLeagueRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required to delete a league.");
        }

        var container = cosmosClient.GetContainer("Fantasty Football", "Leagues");

        try
        {
            // First, retrieve the league to verify admin privileges and get the correct PartitionKey
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToDelete = leagueResponse.Resource;

            if (leagueToDelete.AdminId != data.AdminId)
            {
                return new UnauthorizedResult(); // User is not the admin
            }

            // Delete the league document using the correct PartitionKey
            await container.DeleteItemAsync<League>(leagueId, new PartitionKey(leagueId));

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error deleting league.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class DeleteLeagueRequest
    {
        public string AdminId { get; set; }
    }
}