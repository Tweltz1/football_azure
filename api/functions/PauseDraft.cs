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
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class PauseDraft
{
    [FunctionName("PauseDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/pause")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            var timer = league.CurrentAuction.AuctionTimer;

            if (league.AdminId != data.AdminId)
                return new UnauthorizedResult();

            // Toggle the paused state
            timer.IsPaused = !timer.IsPaused;

            if (timer.IsPaused)
            {
                // PAUSING THE DRAFT
                var timeRemaining = (timer.EndTime - DateTime.UtcNow).TotalSeconds;
                timer.TimeRemainingOnPause = (int)Math.Max(0, timeRemaining);
                log.LogInformation($"Draft paused for league {league.Name} with {timer.TimeRemainingOnPause}s left.");
            }
            else
            {
                // RESUMING THE DRAFT
                timer.EndTime = DateTime.UtcNow.AddSeconds(timer.TimeRemainingOnPause);
                log.LogInformation($"Draft resumed for league {league.Name}. New end time: {timer.EndTime}");
            }

            // Save and broadcast
            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage 
            { 
                Target = "draftStateUpdate", 
                Arguments = new object[] { league } 
            });

            // Return the updated timer
            return new OkObjectResult(timer);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error pausing/resuming draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
