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
using System.Collections.Generic;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class SetReadyStatus
{
    [FunctionName("SetReadyStatus")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/ready")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub", ConnectionStringSetting = "AzureSignalRConnectionString")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<SetReadyStatusRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            if (data.IsReady)
            {
                if (!leagueToUpdate.ReadyMembers.Contains(data.UserId))
                {
                    leagueToUpdate.ReadyMembers.Add(data.UserId);
                }
            }
            else
            {
                leagueToUpdate.ReadyMembers.Remove(data.UserId);
            }

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));
            
            // Broadcast the updated league object to all clients
            await signalRMessages.AddAsync(new SignalRMessage
            {
                Target = "readyStatusUpdate",
                Arguments = new object[] { leagueToUpdate }
            });

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error setting ready status.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class SetReadyStatusRequest
    {
        public string UserId { get; set; }
        public bool IsReady { get; set; }
    }
}