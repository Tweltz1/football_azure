using System;
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
        if (string.IsNullOrWhiteSpace(data?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            await AppServices.RemoveUserFromGroupAsync(data.UserId, leagueId);
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Unable to remove user {UserId} from draft group {LeagueId}.", data.UserId, leagueId);
        }

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            league.EnsureDefaults();

            league.OnlineUserIds.Remove(data.UserId);
            league.AwayUserIds.Remove(data.UserId);
            return null;
        }, log);

        if (error != null) return error;

        await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
        return new OkResult();
    }

    public class PresenceRequest
    {
        public string UserId { get; set; }
    }
}
