using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UserDisconnected
{
    [Function("UserDisconnected")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/disconnect")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<PresenceRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        await AppServices.RemoveUserFromGroupAsync(data.UserId, leagueId);

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            if (league.OnlineUserIds.Contains(data.UserId))
            {
                league.OnlineUserIds.Remove(data.UserId);
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
