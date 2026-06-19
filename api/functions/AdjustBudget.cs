using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;
using System.Linq;

public static class AdjustBudget
{
    [FunctionName("AdjustBudget")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/adjust-budget")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<AdjustBudgetRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }

            var teamToUpdate = league.Teams.FirstOrDefault(t => t.Id == data.TeamId);
            if (teamToUpdate == null) { return new NotFoundObjectResult("Team not found."); }

            teamToUpdate.Budget = data.NewBudget;
            log.LogInformation("Budget for team {TeamName} adjusted to {NewBudget}.", teamToUpdate.Name, data.NewBudget);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Budget adjusted successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error adjusting budget.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class AdjustBudgetRequest
    {
        public string AdminId { get; set; }
        public string TeamId { get; set; }
        public int NewBudget { get; set; }
    }
}
