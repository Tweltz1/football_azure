using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class SendDraftChatMessage
{
    [Function("SendDraftChatMessage")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/chat")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        DraftChatRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<DraftChatRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid draft chat payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid draft chat payload.");
        }

        var message = data?.Message?.Trim();
        if (string.IsNullOrWhiteSpace(data?.UserId) || string.IsNullOrWhiteSpace(message))
        {
            return new BadRequestObjectResult("User ID and message are required.");
        }

        if (message.Length > 240)
        {
            return new BadRequestObjectResult("Messages must be 240 characters or fewer.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            league.EnsureDefaults();

            var senderTeam = league.Teams.FirstOrDefault(t => t?.OwnerId == data.UserId);
            var teamName = senderTeam?.Name;
            if (string.IsNullOrWhiteSpace(teamName))
            {
                teamName = string.IsNullOrWhiteSpace(data.DisplayName) ? "Spectator" : data.DisplayName.Trim();
            }

            var chatMessage = new
            {
                leagueId = league.Id,
                userId = data.UserId,
                teamId = senderTeam?.Id,
                teamName,
                message,
                sentAt = DateTime.UtcNow
            };

            await AppServices.SendToAllAsync("draftChatMessage", chatMessage);
            return new OkObjectResult(chatMessage);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error sending draft chat message for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class DraftChatRequest
    {
        public string UserId { get; set; }
        public string DisplayName { get; set; }
        public string Message { get; set; }
    }
}
