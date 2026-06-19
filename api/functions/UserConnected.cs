using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UserConnected
{
    [FunctionName("UserConnected")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/connect")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<PresenceRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        await AppServices.AddUserToGroupAsync(data.UserId, leagueId);

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (!league.OnlineUserIds.Contains(data.UserId))
            {
                league.OnlineUserIds.Add(data.UserId);
            }
            return null;
        }, log);

        if (error != null) return error;

        await AppServices.SendToGroupAsync(leagueId, "draftStateUpdate", league.ForBroadcast());
        return new OkResult();
    }

    public class PresenceRequest
    {
        public string UserId { get; set; }
    }
}
