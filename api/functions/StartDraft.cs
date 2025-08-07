using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football",
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<StartDraftRequest>(requestBody);
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            // Load league
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            // Only admin can start
            if (league.AdminId != data.AdminId)
                return new UnauthorizedResult();

            // Ensure readiness
            var nonAdmins = league.Members.Where(id => id != league.AdminId).ToList();
            var allReady = !nonAdmins.Any() || nonAdmins.All(id => league.ReadyMembers.Contains(id));
            if (!allReady)
                return new BadRequestObjectResult("Not all other members are ready.");

            // Transition to drafting
            league.Status = "drafting";
            // Initialize CurrentAuction if missing
            if (league.CurrentAuction == null)
                league.CurrentAuction = new CurrentAuction();

            // Pick random player
            league.CurrentAuction.PlayerId = GetRandomPlayerId(league);
            // Set up timer
            league.CurrentAuction.Status = "bidding";
            league.CurrentAuction.AuctionTimer = new AuctionTimer
            {
                EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                IsPaused = false,
                TimeRemainingOnPause = 0
            };
            // Clear any prior bids
            league.CurrentAuction.FinalBids.Clear();

            // Persist and broadcast
            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await signalRMessages.AddAsync(new SignalRMessage
            {
                Target = "draftStateUpdate",
                Arguments = new object[] { league }
            });

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
    }

    private static string GetRandomPlayerId(League league)
    {
        var undrafted = league.InitialPlayerPool.Where(p => !p.IsDrafted).ToList();
        if (!undrafted.Any()) return null;
        var rnd = new Random();
        return undrafted[rnd.Next(undrafted.Count)].Id;
    }

    public class StartDraftRequest
    {
        public string AdminId { get; set; }
    }
}
