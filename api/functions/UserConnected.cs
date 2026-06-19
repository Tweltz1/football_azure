using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UserConnected
{
    [Function("UserConnected")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/connect")] HttpRequest req,
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
            await AppServices.AddUserToGroupAsync(data.UserId, leagueId);
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Unable to add user {UserId} to draft group {LeagueId}.", data.UserId, leagueId);
        }

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            league.EnsureDefaults();

            if (!league.OnlineUserIds.Contains(data.UserId))
            {
                league.OnlineUserIds.Add(data.UserId);
            }
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
