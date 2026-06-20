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

public static class ResolveTie
{
    [Function("ResolveTie")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/resolve-tie")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        ResolveTieRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<ResolveTieRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid resolve-tie payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid resolve-tie payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.AdminId) || string.IsNullOrWhiteSpace(data.WinningTeamId))
        {
            return new BadRequestObjectResult("Admin ID and winning team ID are required.");
        }

        var container = AppServices.LeaguesContainer;

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(container, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (league.Status?.ToLowerInvariant() != "tiebreaker" || league.TieBreaker?.Round != 2)
                    return new BadRequestObjectResult("Can only resolve a final tie after the rebid round also tied.");

                var winningTeam = league.Teams.FirstOrDefault(t => t.Id == data.WinningTeamId);
                var draftedPlayer = league.InitialPlayerPool.FirstOrDefault(p => p.Id == league.CurrentPlayerId);

                if (winningTeam == null)
                    return new NotFoundObjectResult("Winning team not found.");

                if (draftedPlayer == null)
                    return new NotFoundObjectResult("Current player not found.");

                var tiedIds = league.TieBreaker.TiedTeamIds ?? new System.Collections.Generic.List<string>();
                var winnerIsTied = tiedIds.Contains(winningTeam.OwnerId) || tiedIds.Contains(winningTeam.Id);
                if (!winnerIsTied)
                    return new BadRequestObjectResult("Winner must be one of the tied teams.");

                if (league.TieBreaker.TieAmount <= 0)
                    return new BadRequestObjectResult("Final tie amount is invalid.");

                foreach (var tiedId in tiedIds.Distinct())
                {
                    var tiedTeam = league.Teams.FirstOrDefault(t => t.OwnerId == tiedId || t.Id == tiedId);
                    if (tiedTeam == null || string.IsNullOrWhiteSpace(tiedTeam.OwnerId))
                    {
                        continue;
                    }

                    if (!league.ActiveBids.ContainsKey(tiedTeam.OwnerId))
                    {
                        league.ActiveBids[tiedTeam.OwnerId] = new Bid
                        {
                            Amount = league.TieBreaker.TieAmount,
                            Timestamp = DateTime.UtcNow
                        };
                    }
                }

                league.ActiveBids[winningTeam.OwnerId] = new Bid
                {
                    Amount = league.TieBreaker.TieAmount,
                    Timestamp = DateTime.UtcNow
                };

                log?.LogInformation("Admin resolved tie, awarding {PlayerName} to {TeamName}.", draftedPlayer.Name, winningTeam.Name);
                DraftLogic.AwardPlayerToTeam(league, draftedPlayer, winningTeam, league.TieBreaker.TieAmount);

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult("Tie resolved.");
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error resolving final tie for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class ResolveTieRequest
    {
        public string AdminId { get; set; }
        public string WinningTeamId { get; set; }
    }
}
