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
        var data = JsonConvert.DeserializeObject<UpdateFavoritesRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.UserId) || data.PlayerIds == null)
        {
            return new BadRequestObjectResult("User ID and a list of player IDs are required.");
        }

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

            var teamToUpdate = leagueToUpdate.Teams.FirstOrDefault(t => t.OwnerId == data.UserId);
            if (teamToUpdate == null)
            {
                return new NotFoundObjectResult($"Team for user '{data.UserId}' not found in league '{leagueId}'.");
            }

            teamToUpdate.FavoritePlayerIds = favoriteIds;

            var userProfile = await UserProfileStore.FindAsync(data.UserId);
            if (userProfile != null)
            {
                userProfile.FavoritePlayerIds = favoriteIds;
                await UserProfileStore.UpsertAsync(userProfile);
            }
            else
            {
                log?.LogWarning("Profile not found for user {UserId} while syncing draft favorites.", data.UserId);
            }

            log.LogInformation("Updated favorite players for user {UserId} in league {LeagueId}.", data.UserId, leagueId);

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));
            await AppServices.SendToAllAsync("draftStateUpdate", leagueToUpdate.ForBroadcast());

            return new OkObjectResult(new { message = "Favorite players updated successfully.", favoritePlayerIds = favoriteIds });
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error updating favorite players.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    public class UpdateFavoritesRequest
    {
        public string UserId { get; set; }
        public List<string> PlayerIds { get; set; }
    }
}
