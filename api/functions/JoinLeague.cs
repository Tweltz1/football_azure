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
using System.Collections.Generic;
using Microsoft.Azure.WebJobs.Extensions.SignalRService; // New import

public static class JoinLeague
{
    [FunctionName("JoinLeague")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "joinLeague")] HttpRequest req,
        [CosmosDB(
            databaseName: "Fantasy Football", // Corrected database name
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub", ConnectionStringSetting = "AzureSignalRConnectionString")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<JoinLeagueRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId) || string.IsNullOrEmpty(data.LeagueName))
        {
            return new BadRequestObjectResult("User ID and league name are required.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            var query = new QueryDefinition("SELECT * FROM c WHERE c.name = @leagueName");
            query.WithParameter("@leagueName", data.LeagueName);
            
            var queryIterator = container.GetItemQueryIterator<League>(query);
            var leagueResponse = await queryIterator.ReadNextAsync();

            if (!leagueResponse.Any())
            {
                return new NotFoundObjectResult("League not found.");
            }

            var leagueToJoin = leagueResponse.First();

            if (!string.IsNullOrEmpty(leagueToJoin.Password) && leagueToJoin.Password != data.Password)
            {
                return new UnauthorizedResult(); // Incorrect password
            }

            if (leagueToJoin.Members.Contains(data.UserId))
            {
                return new ConflictObjectResult("You are already a member of this league.");
            }

            // Add the user to the league
            leagueToJoin.Members.Add(data.UserId);
            leagueToJoin.Teams.Add(new Team 
            { 
                Id = Guid.NewGuid().ToString(), 
                OwnerId = data.UserId, 
                Name = "New Team", // Placeholder name
                Budget = 200, 
                Roster = new List<RosterSpot>() 
            });

            await container.ReplaceItemAsync(leagueToJoin, leagueToJoin.Id, new PartitionKey(leagueToJoin.Id));
            
            // Broadcast the updated league object to all clients
            await signalRMessages.AddAsync(new SignalRMessage
            {
                Target = "leagueUpdate",
                Arguments = new object[] { leagueToJoin }
            });

            return new OkObjectResult(new { id = leagueToJoin.Id, name = leagueToJoin.Name });
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error joining league.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class JoinLeagueRequest
    {
        public string UserId { get; set; }
        public string LeagueName { get; set; }
        public string Password { get; set; }
    }
}