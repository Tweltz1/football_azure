using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UpdateUserPresence
{
    [Function("UpdateUserPresence")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/presence")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<PresenceRequest>(requestBody);
        if (string.IsNullOrWhiteSpace(data?.UserId))
        {
            return new BadRequestObjectResult("User ID is required.");
        }

        var normalizedStatus = (data.Status ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedStatus != "active" && normalizedStatus != "away")
        {
            return new BadRequestObjectResult("Presence status must be 'active' or 'away'.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            await AppServices.AddUserToGroupAsync(data.UserId, leagueId);
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Unable to add user {UserId} to draft group {LeagueId} while updating presence.", data.UserId, leagueId);
        }

        var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
        {
            league.EnsureDefaults();

            if (!league.OnlineUserIds.Contains(data.UserId))
            {
                league.OnlineUserIds.Add(data.UserId);
            }

            if (normalizedStatus == "away")
            {
                if (!league.AwayUserIds.Contains(data.UserId))
                {
                    league.AwayUserIds.Add(data.UserId);
                }
            }
            else
            {
                league.AwayUserIds.Remove(data.UserId);
            }

            return null;
        }, log);

        if (error != null) return error;

        await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
        return new OkObjectResult(new { status = normalizedStatus });
    }

    public class PresenceRequest
    {
        public string UserId { get; set; }
        public string Status { get; set; }
    }
}
