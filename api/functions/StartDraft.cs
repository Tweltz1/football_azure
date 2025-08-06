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
using System.Linq; // Make sure this is present
using System.Collections.Generic; // Make sure this is present

public static class StartDraft
{
    [FunctionName("StartDraft")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/startDraft")] HttpRequest req,
        string leagueId,
        [CosmosDB(
            databaseName: "Fantasy Football", // Corrected database name
            containerName: "Leagues",
            Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        var data = JsonConvert.DeserializeObject<StartDraftRequest>(requestBody);

        if (string.IsNullOrEmpty(data?.AdminId))
        {
            return new BadRequestObjectResult("Admin ID is required to start the draft.");
        }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");

        try
        {
            ItemResponse<League> leagueResponse = await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId));
            League leagueToUpdate = leagueResponse.Resource;

            if (leagueToUpdate.AdminId != data.AdminId)
            {
                return new UnauthorizedResult();
            }
            
            // CORRECTED LOGIC: Allow draft to start if there's only one member (admin only)
            // For multi-member leagues, check if all NON-ADMIN members are ready.
            if (leagueToUpdate.Members.Count > 1) 
            {
                // Get all members who are NOT the admin
                var nonAdminMembers = leagueToUpdate.Members.Where(m => m != leagueToUpdate.AdminId).ToList();
                
                // Check if the count of ready members matches the count of non-admin members
                // And ensure the admin is NOT in the ReadyMembers list (optional, but good for clarity)
                if (leagueToUpdate.ReadyMembers.Count != nonAdminMembers.Count || leagueToUpdate.ReadyMembers.Contains(leagueToUpdate.AdminId))
                {
                    return new BadRequestObjectResult("Not all non-admin members are ready or admin is incorrectly marked as ready.");
                }
            }

            leagueToUpdate.Status = "drafting";
            leagueToUpdate.CurrentPlayerId = GetRandomPlayerId(leagueToUpdate);
            leagueToUpdate.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(leagueToUpdate.DraftTimers.BidTimer), IsPaused = false };

            await container.ReplaceItemAsync(leagueToUpdate, leagueToUpdate.Id, new PartitionKey(leagueToUpdate.Id));

            return new OkResult();
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return new NotFoundObjectResult($"League with ID '{leagueId}' not found.");
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Error starting draft.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }
    }

    private static string GetRandomPlayerId(League league)
    {
        return league.DraftPlayers.Where(p => !p.IsDrafted).OrderBy(p => Guid.NewGuid()).FirstOrDefault()?.Id;
    }

    public class StartDraftRequest
    {
        public string AdminId { get; set; }
    }
}