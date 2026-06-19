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
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<CreateLeagueRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.Name) || string.IsNullOrEmpty(data.AdminId))
        {
            return new BadRequestObjectResult("Please provide a league name and admin ID.");
        }

        var userProfile = await GetUserProfile(data.AdminId, log);
        var userMasterFavorites = userProfile?.FavoritePlayerIds ?? new List<string>();
        var rosterSettings = data.RosterSettings ?? new RosterSettings();
        var draftTimers = data.DraftTimers ?? new DraftTimers();
        var fullPlayerPool = PlayerData.GetInitialPlayerPool();

        var filteredPlayerPool = fullPlayerPool.Where(p =>
        {
            switch (p.Position.ToUpperInvariant())
            {
                case "QB": return rosterSettings.QB > 0;
                case "RB": return rosterSettings.RB > 0;
                case "WR": return rosterSettings.WR > 0;
                case "TE": return rosterSettings.TE > 0;
                case "K": return rosterSettings.K > 0;
                case "DST":
                case "DEF": return rosterSettings.DEF > 0;
                default: return true;
            }
        }).ToList();

        var newLeague = new League
        {
            Id = Guid.NewGuid().ToString(),
            Name = data.Name,
            AdminId = data.AdminId,
            Password = data.Password,
            Members = new List<string> { data.AdminId },
            Teams = new List<Team>
            {
                new Team
                {
                    Id = Guid.NewGuid().ToString(),
                    OwnerId = data.AdminId,
                    Name = "Admin Team",
                    Budget = 200,
                    Roster = new List<RosterSpot>(),
                    FavoritePlayerIds = userMasterFavorites
                }
            },
            Status = "created",
            RosterSettings = rosterSettings,
            DraftTimers = draftTimers,
            InitialPlayerPool = filteredPlayerPool,
            DraftPlayers = filteredPlayerPool,
        };

        await AppServices.LeaguesContainer.CreateItemAsync(newLeague, new PartitionKey(newLeague.Id));

        return new OkObjectResult(new { id = newLeague.Id, name = newLeague.Name });
    }

    private static async Task<UserProfile> GetUserProfile(string userId, ILogger log)
    {
        try
        {
            return await AppServices.UsersContainer.ReadItemAsync<UserProfile>(userId, new PartitionKey(userId));
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            log.LogWarning("Profile not found for user {UserId} during league creation.", userId);
            return null;
        }
    }

    public class CreateLeagueRequest
    {
        public string Name { get; set; }
        public string AdminId { get; set; }
        public string Password { get; set; }
        public RosterSettings RosterSettings { get; set; }
        public DraftTimers DraftTimers { get; set; }
    }
}
