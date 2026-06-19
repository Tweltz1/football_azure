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

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdminActionRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                var nonAdminMembers = league.Members.Where(id => id != league.AdminId).ToList();
                bool allNonAdminsReady = nonAdminMembers.All(memberId => league.ReadyMembers.Contains(memberId));

                if (!allNonAdminsReady && nonAdminMembers.Any())
                    return new BadRequestObjectResult("Not all other members are ready.");

                league.CurrentPlayerId = DraftLogic.GetNextRandomPlayerId(league);
                league.ActiveBids.Clear();
                league.TieBreaker = null;

                if (league.CurrentPlayerId == null)
                {
                    league.Status = "completed";
                    league.AuctionTimer = null;
                }
                else
                {
                    league.Status = "drafting";
                    league.AuctionTimer = new AuctionTimer
                    {
                        EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.BidTimer),
                        IsPaused = false,
                        TimeRemainingOnPause = 0
                    };
                }

                return null;
            }, log);

            if (error != null) return error;

            await signalRMessages.AddAsync(new SignalRMessage
            {
                GroupName = leagueId,
                Target = "draftStateUpdate",
                Arguments = new object[] { league.ForBroadcast() }
            });

            return new OkResult();
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdminActionRequest
    {
        public string AdminId { get; set; }
    }
}
