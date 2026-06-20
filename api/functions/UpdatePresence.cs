using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public static class UpdatePresence
{
    [Function("UpdatePresence")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/presence")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        PresenceRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<PresenceRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid presence payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid presence payload.");
        }

        var status = NormalizeStatus(data?.Status);
        if (string.IsNullOrWhiteSpace(data?.UserId) || status == null)
        {
            return new BadRequestObjectResult("User ID and a valid status are required.");
        }

        var userId = data.UserId.Trim();
        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (!league.Members.Contains(userId) && !league.Teams.Any(team => team?.OwnerId == userId))
                {
                    return new NotFoundObjectResult("User is not a member of this league.");
                }

                ApplyPresence(league, userId, status);
                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult(new { userId, status });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error updating presence for user {UserId} in league {LeagueId}.", userId, leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string NormalizeStatus(string status)
    {
        switch ((status ?? string.Empty).Trim().ToLowerInvariant())
        {
            case "active":
            case "online":
                return "active";
            case "away":
            case "hidden":
            case "blurred":
                return "away";
            case "offline":
            case "disconnect":
            case "disconnected":
                return "offline";
            default:
                return null;
        }
    }

    private static void ApplyPresence(League league, string userId, string status)
    {
        if (status == "offline")
        {
            league.OnlineUserIds.Remove(userId);
            league.AwayUserIds.Remove(userId);
            return;
        }

        if (!league.OnlineUserIds.Contains(userId))
        {
            league.OnlineUserIds.Add(userId);
        }

        if (status == "away")
        {
            if (!league.AwayUserIds.Contains(userId))
            {
                league.AwayUserIds.Add(userId);
            }
        }
        else
        {
            league.AwayUserIds.Remove(userId);
        }
    }

    public class PresenceRequest
    {
        public string UserId { get; set; }
        public string Status { get; set; }
    }
}