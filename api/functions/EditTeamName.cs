using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using System.Linq;

public static class EditTeamName
{
    [Function("EditTeamName")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/teams")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<EditTeamNameRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId) || string.IsNullOrEmpty(data?.NewTeamName))
        {
            return new BadRequestObjectResult("User ID and a new team name are required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            var teamToUpdate = leagueToUpdate.Teams.FirstOrDefault(t => t.OwnerId == data.UserId);
            if (teamToUpdate == null)
            {
                return new NotFoundObjectResult($"Team for user '{data.UserId}' not found in league '{leagueId}'.");
            }

            teamToUpdate.Name = data.NewTeamName;
            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));

            return new OkObjectResult(new { newTeamName = data.NewTeamName });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error updating team name.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class EditTeamNameRequest
    {
        public string UserId { get; set; }
        public string NewTeamName { get; set; }
    }
}
