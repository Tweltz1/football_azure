using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using System.Linq;
using System.Text;

public static class GetDraftResultsAsCsv
{
    [FunctionName("GetDraftResultsAsCsv")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "leagues/{leagueId}/results.csv")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        try
        {
            var leagueResponse = await AppServices.LeaguesContainer.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            var csvBuilder = new StringBuilder();
            csvBuilder.AppendLine("Pick Number,Player Name,Position,NFL Team,Winning Bid,Drafted By");

            int pickNumber = 1;
            foreach (var pick in league.DraftLog)
            {
                var winningTeam = league.Teams.FirstOrDefault(t => t.Id == pick.WinningTeamId);
                csvBuilder.AppendLine(
                    $"{pickNumber}," +
                    $"\"{EscapeCsv(pick.Player.Name)}\"," +
                    $"{EscapeCsv(pick.Player.Position)}," +
                    $"{EscapeCsv(pick.Player.Team)}," +
                    $"{pick.WinningBid}," +
                    $"\"{EscapeCsv(winningTeam?.Name ?? "N/A")}\""
                );
                pickNumber++;
            }

            return new FileContentResult(Encoding.UTF8.GetBytes(csvBuilder.ToString()), "text/csv")
            {
                FileDownloadName = $"{league.Name}-DraftResults.csv"
            };
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error generating CSV.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string EscapeCsv(string value)
    {
        return string.IsNullOrEmpty(value) ? string.Empty : value.Replace("\"", "\"\"");
    }
}
