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
using System.Collections.Generic;

public static class UpdateFavoritePlayers
{
    [Function("UpdateFavoritePlayers")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/favorites")] HttpRequest req,
        string leagueId,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        UpdateFavoritesRequest data;

        try
        {
            data = JsonConvert.DeserializeObject<UpdateFavoritesRequest>(requestBody);
        }
        catch (JsonException ex)
        {
            log?.LogWarning(ex, "Invalid favorite player payload for league {LeagueId}.", leagueId);
            return new BadRequestObjectResult("Invalid favorite player payload.");
        }

        if (string.IsNullOrWhiteSpace(data?.UserId) || data.PlayerIds == null)
        {
            return new BadRequestObjectResult("User ID and a list of player IDs are required.");
        }

        var userId = data.UserId.Trim();
        var favoriteIds = data.PlayerIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var container = AppServices.LeaguesContainer;

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;
            leagueToUpdate.EnsureDefaults();

            var teamToUpdate = leagueToUpdate.Teams.FirstOrDefault(t =>
                t != null && string.Equals(t.OwnerId, userId, StringComparison.OrdinalIgnoreCase));
            var userIsLeagueMember = leagueToUpdate.Members.Any(memberId =>
                string.Equals(memberId, userId, StringComparison.OrdinalIgnoreCase));

            if (teamToUpdate == null && !userIsLeagueMember)
            {
                return new NotFoundObjectResult($"Team for user '{userId}' not found in league '{leagueId}'.");
            }

            var userProfile = await UserProfileStore.FindAsync(userId) ?? new UserProfile
            {
                Id = userId,
                UserId = userId,
                DisplayName = userId,
                DefaultTeamName = $"{userId}'s Team",
                FavoritePlayerIds = new List<string>(),
                PlayerNotes = new Dictionary<string, string>(),
                PlayerTiers = new Dictionary<string, int>(),
                BudgetPlan = new Dictionary<string, int>(),
                BudgetRosterSettings = new Dictionary<string, int>()
            };

            userProfile.FavoritePlayerIds = favoriteIds;
            await UserProfileStore.UpsertAsync(userProfile);

            var leagueTeamSynced = false;
            if (teamToUpdate != null)
            {
                teamToUpdate.FavoritePlayerIds = favoriteIds;
                leagueTeamSynced = await TryReplaceLeagueAsync(container, leagueToUpdate, log);

                if (leagueTeamSynced)
                {
                    await TryBroadcastLeagueAsync(leagueToUpdate, log);
                }
            }
            else
            {
                log?.LogWarning(
                    "User {UserId} is a member of league {LeagueId}, but no team copy was found while syncing favorites. Profile favorites were updated.",
                    userId,
                    leagueId);
            }

            log?.LogInformation("Updated favorite players for user {UserId} in league {LeagueId}.", userId, leagueId);

            return new OkObjectResult(new
            {
                message = "Favorite players updated successfully.",
                favoritePlayerIds = favoriteIds,
                leagueTeamSynced
            });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log?.LogError(ex, "Error updating favorite players for user {UserId} in league {LeagueId}.", userId, leagueId);
            return new ObjectResult("Could not update favorite players. Please try again.")
            {
                StatusCode = StatusCodes.Status500InternalServerError
            };
        }
    }

    private static async Task<bool> TryReplaceLeagueAsync(Container container, League leagueToUpdate, ILogger log)
    {
        try
        {
            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));
            return true;
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Profile favorites were updated, but the league team favorite copy could not be saved for league {LeagueId}.", leagueToUpdate.Id);
            return false;
        }
    }

    private static async Task TryBroadcastLeagueAsync(League leagueToUpdate, ILogger log)
    {
        try
        {
            await AppServices.SendToAllAsync("draftStateUpdate", leagueToUpdate.ForBroadcast());
        }
        catch (Exception ex)
        {
            log?.LogWarning(ex, "Favorite players were saved, but the draft favorite broadcast failed for league {LeagueId}.", leagueToUpdate.Id);
        }
    }

    public class UpdateFavoritesRequest
    {
        public string UserId { get; set; }
        public List<string> PlayerIds { get; set; }
    }
}
