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

public static class KickMember
{
    [FunctionName("KickMember")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/kick")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<KickMemberRequest>(requestBody);
        var container = AppServices.LeaguesContainer;

        try
        {
            var leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            var league = leagueResponse.Resource;

            if (league.AdminId != data.AdminId) { return new UnauthorizedResult(); }
            if (data.TeamIdToKick == league.Teams.First(t => t.OwnerId == league.AdminId).Id) { return new BadRequestObjectResult("Admin cannot kick themselves."); }

            var teamToRemove = league.Teams.FirstOrDefault(t => t.Id == data.TeamIdToKick);
            if (teamToRemove == null) { return new NotFoundObjectResult("Team not found."); }

            foreach (var spot in teamToRemove.Roster)
            {
                var playerInPool = league.InitialPlayerPool.FirstOrDefault(p => p.Id == spot.Player.Id);
                if (playerInPool != null)
                {
                    playerInPool.IsDrafted = false;
                    playerInPool.Price = 0;
                }
            }

            league.Teams.Remove(teamToRemove);
            league.Members.Remove(teamToRemove.OwnerId);
            league.ReadyMembers.Remove(teamToRemove.OwnerId);

            log.LogInformation("Team {TeamName} was kicked from league {LeagueName}.", teamToRemove.Name, league.Name);

            await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", league.ForBroadcast());

            return new OkObjectResult("Member kicked successfully.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error kicking member.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class KickMemberRequest
    {
        public string AdminId { get; set; }
        public string TeamIdToKick { get; set; }
    }
}
