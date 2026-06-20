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

public static class NotifyBudgetReview
{
    [Function("NotifyBudgetReview")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/budget-review")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        BudgetReviewRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<BudgetReviewRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid budget review payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid budget review payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required.");
        }

        try
        {
            var response = await AppServices.LeaguesContainer.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = response.Resource;
            league.EnsureDefaults();

            if (!string.Equals(league.AdminId, data.AdminId, StringComparison.OrdinalIgnoreCase))
            {
                return new UnauthorizedResult();
            }

            var adminTeam = league.Teams.FirstOrDefault(team => string.Equals(team?.OwnerId, data.AdminId, StringComparison.OrdinalIgnoreCase));
            await AppServices.SendToGroupAsync(leagueId, "budgetReviewNotice", new
            {
                leagueId,
                adminId = data.AdminId,
                adminTeamName = adminTeam?.Name ?? "Commissioner",
                sentAt = DateTime.UtcNow
            });

            return new OkObjectResult("Budget review notice sent.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error sending budget review notice for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class BudgetReviewRequest
    {
        public string AdminId { get; set; }
    }
}
