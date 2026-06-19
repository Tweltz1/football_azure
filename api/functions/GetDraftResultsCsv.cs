using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;

public static class GetDraftResultsCsv
{
    [FunctionName("GetDraftResultsCsv")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "leagues/{leagueId}/results.csv")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        try
        {
            var leagueResponse = await AppServices.LeaguesContainer.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;
            var csv = new StringBuilder();

            csv.AppendLine("Team,Player,Position,NFL Team,Bye,Price,Roster Spot");
            foreach (var team in league.Teams.OrderBy(t => t.Name))
            {
                foreach (var spot in team.Roster)
                {
                    csv.AppendLine(string.Join(",", new[]
                    {
                        EscapeCsv(team.Name),
                        EscapeCsv(spot.Player?.Name),
                        EscapeCsv(spot.Player?.Position),
                        EscapeCsv(spot.Player?.Team),
                        spot.Player?.Bye.ToString() ?? string.Empty,
                        spot.Player?.Price.ToString() ?? string.Empty,
                        EscapeCsv(spot.Position)
                    }));
                }
            }

            return new FileContentResult(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv")
            {
                FileDownloadName = $"{league.Name}-draft-results.csv"
            };
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
    }

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        if (value.Contains(",") || value.Contains("\"") || value.Contains("\n") || value.Contains("\r"))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        return value;
    }
}
