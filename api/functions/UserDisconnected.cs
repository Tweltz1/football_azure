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

public static class UserDisconnected
{
    [FunctionName("UserDisconnected")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/disconnect")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRGroupAction> signalRGroupActions,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<PresenceRequest>(requestBody);

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        await signalRGroupActions.AddAsync(new SignalRGroupAction
        {
            UserId = data.UserId,
            GroupName = leagueId,
            Action = GroupAction.Remove
        });

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (league.OnlineUserIds.Contains(data.UserId))
            {
                league.OnlineUserIds.Remove(data.UserId);
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

    public class PresenceRequest
    {
        public string UserId { get; set; }
    }
}
