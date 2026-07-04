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

public static class ManualAwardPlayer
{
    [Function("ManualAwardPlayer")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/manual-award")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        ManualAwardRequest data;
        try
        {
            string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            data = JsonConvert.DeserializeObject<ManualAwardRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid manual-award payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid manual-award payload.");
        }

        if (data == null)
            return new BadRequestObjectResult("Manual-award payload is required.");
        if (string.IsNullOrWhiteSpace(data.AdminId))
            return new BadRequestObjectResult("Admin ID is required.");
        if (string.IsNullOrWhiteSpace(data.PlayerId))
            return new BadRequestObjectResult("Player ID is required.");
        if (string.IsNullOrWhiteSpace(data.TeamId))
            return new BadRequestObjectResult("Team ID is required.");
        if (data.Amount < 1)
            return new BadRequestObjectResult("Manual draft prices must be at least $1.");

        try
        {
            var (league, error) = await CosmosHelper.UpdateLeagueAsync(AppServices.LeaguesContainer, leagueId, league =>
            {
                league.EnsureDefaults();

                if (league.AdminId != data.AdminId)
                    return new UnauthorizedResult();

                if (!DraftModeHelper.IsManual(league.DraftMode) || league.Status?.ToLowerInvariant() != DraftModeHelper.Manual)
                    return new BadRequestObjectResult("Manual awards are only available after starting a manual draft.");

                var winningTeam = league.Teams.FirstOrDefault(team => team?.Id == data.TeamId);
                if (winningTeam == null)
                    return new NotFoundObjectResult("Team not found.");

                winningTeam.Roster = winningTeam.Roster ?? new System.Collections.Generic.List<RosterSpot>();

                var player = league.InitialPlayerPool.FirstOrDefault(poolPlayer => poolPlayer?.Id == data.PlayerId);
                if (player == null)
                    return new NotFoundObjectResult("Player not found in this league's draft pool.");
                if (player.IsDrafted)
                    return new BadRequestObjectResult($"{player.Name} has already been drafted.");

                var rosterTotal = GetRosterTotal(league.RosterSettings);
                if (rosterTotal > 0 && winningTeam.Roster.Count >= rosterTotal)
                    return new BadRequestObjectResult($"{winningTeam.Name} already has a full roster.");

                var remainingRosterSpots = rosterTotal > 0 ? rosterTotal - winningTeam.Roster.Count : 1;
                var maxBid = winningTeam.Budget - Math.Max(0, remainingRosterSpots - 1);
                if (data.Amount > maxBid)
                {
                    return new BadRequestObjectResult(
                        $"{winningTeam.Name} can spend up to ${Math.Max(0, maxBid)} and still keep $1 for each remaining roster spot.");
                }

                DraftLogic.AwardPlayerToTeam(league, player, winningTeam, data.Amount, DraftModeHelper.Manual, false);

                log?.LogInformation(
                    "Manual draft award: {PlayerName} to {TeamName} for ${Amount} in league {LeagueName}.",
                    player.Name,
                    winningTeam.Name,
                    data.Amount,
                    league.Name);

                return null;
            }, log);

            if (error != null) return error;

            await AppServices.BroadcastDraftStateAsync(leagueId, league, log);
            return new OkObjectResult(league.ForBroadcast());
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error manually awarding player for league {LeagueId}.", leagueId);
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static int GetRosterTotal(RosterSettings settings)
    {
        settings = settings ?? new RosterSettings();
        return settings.QB
            + settings.RB
            + settings.WR
            + settings.TE
            + settings.K
            + settings.DEF
            + settings.FLEX
            + settings.SuperFlex
            + settings.Bench;
    }

    public class ManualAwardRequest
    {
        public string AdminId { get; set; }
        public string TeamId { get; set; }
        public string PlayerId { get; set; }
        public int Amount { get; set; }
    }
}
