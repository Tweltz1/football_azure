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
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        
        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            var csvBuilder = new StringBuilder();
            // Add Header Row
            csvBuilder.AppendLine("Pick Number,Player Name,Position,NFL Team,Winning Bid,Drafted By");

            // Add Data Rows
            int pickNumber = 1;
            foreach (var pick in league.DraftLog)
            {
                var winningTeam = league.Teams.FirstOrDefault(t => t.Id == pick.WinningTeamId);
                csvBuilder.AppendLine(
                    $"{pickNumber}," +
                    $"\"{pick.Player.Name}\"," +
                    $"{pick.Player.Position}," +
                    $"{pick.Player.Team}," +
                    $"{pick.WinningBid}," +
                    $"\"{winningTeam?.Name ?? "N/A"}\""
                );
                pickNumber++;
            }

            return new FileContentResult(Encoding.UTF8.GetBytes(csvBuilder.ToString()), "text/csv")
            {
                FileDownloadName = $"{league.Name}-DraftResults.csv"
            };
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error generating CSV.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }
}