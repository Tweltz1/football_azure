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
using Microsoft.Azure.Cosmos;

public static class CreateLeague
{
    [FunctionName("CreateLeague")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = null)] HttpRequest req,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] IAsyncCollector<League> leaguesOut,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Users", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<CreateLeagueRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.Name) || string.IsNullOrEmpty(data.AdminId))
        {
            return new BadRequestObjectResult("Please provide a league name and admin ID.");
        }

        var userProfile = await GetUserProfile(cosmosClient, data.AdminId, log);
        var userMasterFavorites = userProfile?.FavoritePlayerIds ?? new List<string>();
        
        // Use the provided roster settings, or the default if none are sent
        var rosterSettings = data.RosterSettings ?? new RosterSettings();
        
        // Get the full player pool from our shared data file
        var fullPlayerPool = PlayerData.GetInitialPlayerPool();

        // --- NEW FILTERING LOGIC ---
        var filteredPlayerPool = fullPlayerPool.Where(p =>
        {
            switch (p.Position.ToUpper())
            {
                case "QB": return rosterSettings.QB > 0;
                case "RB": return rosterSettings.RB > 0;
                case "WR": return rosterSettings.WR > 0;
                case "TE": return rosterSettings.TE > 0;
                case "K": return rosterSettings.K > 0;
                case "DST":
                case "DEF": return rosterSettings.DEF > 0;
                default: return true; // Failsafe for unknown positions
            }
        }).ToList();
        // --- END OF NEW LOGIC ---

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
                    Roster = new List<RosterSpot>(),
                    FavoritePlayerIds = userMasterFavorites
                }
            },
            Status = "created",
            RosterSettings = rosterSettings, // Save the chosen settings
            InitialPlayerPool = filteredPlayerPool, // Save the filtered pool
            DraftPlayers = filteredPlayerPool,
        };

        await leaguesOut.AddAsync(newLeague);

        return new OkObjectResult(new { id = newLeague.Id, name = newLeague.Name });
    }

    private static async Task<UserProfile> GetUserProfile(CosmosClient cosmosClient, string userId, ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Users");
        try
        {
            return await container.ReadItemAsync<UserProfile>(userId, new PartitionKey(userId));
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            log.LogWarning($"Profile not found for user {userId} during league creation.");
            return null;
        }
    }

    public class CreateLeagueRequest
    {
        public string Name { get; set; }
        public string AdminId { get; set; }
        public string Password { get; set; }
        public RosterSettings RosterSettings { get; set; } // Now accepts roster settings
    }
}
