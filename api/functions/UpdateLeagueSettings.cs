using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class UpdateLeagueSettings
{
    [Function("UpdateLeagueSettings")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/settings")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<UpdateLeagueSettingsRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required to update league settings.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;
            leagueToUpdate.EnsureDefaults();

            if (leagueToUpdate.AdminId != data.AdminId)
            {
                return new UnauthorizedResult();
            }

            if (!string.IsNullOrWhiteSpace(data.DraftMode))
            {
                var nextDraftMode = DraftModeHelper.Normalize(data.DraftMode);
                if (nextDraftMode != leagueToUpdate.DraftMode)
                {
                    var status = (leagueToUpdate.Status ?? string.Empty).ToLowerInvariant();
                    if (status != "created" && status != "lobby")
                    {
                        return new BadRequestObjectResult("Draft mode can only be changed before the draft starts.");
                    }

                    leagueToUpdate.DraftMode = nextDraftMode;
                }
            }

            if (data.RosterSettings != null)
            {
                leagueToUpdate.RosterSettings = data.RosterSettings;
            }

            if (data.DraftTimers != null)
            {
                leagueToUpdate.DraftTimers = data.DraftTimers;
            }

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));
            await AppServices.BroadcastDraftStateAsync(leagueId, leagueToUpdate, log);

            return new OkObjectResult(leagueToUpdate);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error updating league settings.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class UpdateLeagueSettingsRequest
    {
        public string AdminId { get; set; }
        public string DraftMode { get; set; }
        public RosterSettings RosterSettings { get; set; }
        public DraftTimers DraftTimers { get; set; }
    }
}
