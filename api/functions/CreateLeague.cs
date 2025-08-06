using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;

public static class CreateLeague
{
    [FunctionName("CreateLeague")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = null)] HttpRequest req,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")]IAsyncCollector<League> leagues,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<CreateLeagueRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.Name) || string.IsNullOrEmpty(data.AdminId))
        {
            return new BadRequestObjectResult("Please provide a league name and admin ID.");
        }
        
        // This is a static list of players for now, as per your design
        var playerPool = new List<Player>
        {
            new Player { Id = Guid.NewGuid().ToString(), Name = "JaMarr Chase", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Bijan Robinson", Position = "RB", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "CeeDee Lamb", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Justin Jefferson", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Jahmyr Gibbs", Position = "RB", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Puka Nacua", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Malik Nabers", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Amon-Ra St. Brown", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Saquon Barkley", Position = "RB", IsDrafted = false },
        };

        var newLeague = new League
        {
            Id = Guid.NewGuid().ToString(),
            Name = data.Name,
            AdminId = data.AdminId,
            Password = data.Password,
            Members = new List<string> { data.AdminId },
            Teams = new List<Team> {
                new Team {
                    Id = Guid.NewGuid().ToString(),
                    OwnerId = data.AdminId,
                    Name = "Admin Team",
                    Budget = 200,
                    Roster = new List<RosterSpot>()
                }
            },
            Status = "created",
            InitialPlayerPool = playerPool,
            DraftPlayers = playerPool,
        };

        await leagues.AddAsync(newLeague);

        return new OkObjectResult(new { id = newLeague.Id, name = newLeague.Name });
    }

    public class CreateLeagueRequest
    {
        public string Name { get; set; }
        public string AdminId { get; set; }
        public string Password { get; set; }
    }
}