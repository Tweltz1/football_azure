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

public static class AdjustBudget
{
    [Function("AdjustBudget")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/adjust-budget")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        AdjustBudgetRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<AdjustBudgetRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid budget adjustment payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid budget adjustment payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.AdminId) || string.IsNullOrWhiteSpace(data.TeamId))
        {
            return new BadRequestObjectResult("Admin ID and team ID are required.");
        }

        if (data.NewBudget < 0)
        {
            return new BadRequestObjectResult("Budget cannot be negative.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var oldBudget = 0;
            var teamName = string.Empty;
            var budgetChanged = false;
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                oldBudget = 0;
                teamName = string.Empty;
                budgetChanged = false;
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                var teamToUpdate = league.Teams.FirstOrDefault(t => t?.Id == data.TeamId);
                if (teamToUpdate == null)
                    return new NotFoundObjectResult("Team not found.");

                oldBudget = teamToUpdate.Budget;
                teamName = teamToUpdate.Name;
                budgetChanged = oldBudget != data.NewBudget;
                teamToUpdate.Budget = data.NewBudget;
                log?.LogInformation("Budget for team {TeamName} adjusted from {OldBudget} to {NewBudget}.", teamToUpdate.Name, oldBudget, data.NewBudget);

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            if (budgetChanged)
            {
                try
                {
                    await AppServices.SendToGroupAsync(leagueId, "budgetAdjustmentNotice", new
                    {
                        leagueId,
                        adminId = data.AdminId,
                        teamId = data.TeamId,
                        teamName,
                        oldBudget,
                        newBudget = data.NewBudget,
                        sentAt = DateTime.UtcNow
                    });
                }
                catch (Exception ex)
                {
                    log?.LogWarning(ex, "Budget adjustment notice failed for league {LeagueId}.", leagueId);
                }
            }

            return new OkObjectResult("Budget adjusted successfully.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error adjusting budget for league {LeagueId}.", leagueId);
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
