using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Cosmos;

public static class SubmitFinalBid
{
    private class ClientPrincipal
    {
        [JsonProperty("identityProvider")] public string IdentityProvider { get; set; }
        [JsonProperty("userId")] public string UserId { get; set; }
        [JsonProperty("userDetails")] public string UserDetails { get; set; }
        [JsonProperty("userRoles")] public System.Collections.Generic.IEnumerable<string> UserRoles { get; set; }
    }

    [FunctionName("SubmitFinalBid")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "leagues/{leagueId}/submit-bid")] HttpRequest req,
        string leagueId,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        ILogger log)
    {
        // Get Authenticated User Info from header
        ClientPrincipal principal = null;
        if (req.Headers.TryGetValue("x-ms-client-principal", out var header))
        {
            var data = header[0];
            var decoded = Convert.FromBase64String(data);
            var json = System.Text.Encoding.UTF8.GetString(decoded);
            principal = JsonConvert.DeserializeObject<ClientPrincipal>(json);
        }
        if (principal == null || string.IsNullOrEmpty(principal.UserId)) { return new UnauthorizedResult(); }
        
        // Get Bid Amount from Request Body
        string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
        dynamic bodyData = JsonConvert.DeserializeObject(requestBody);
        int bidAmount = bodyData?.bidAmount ?? 0;
        if (bidAmount <= 0) { return new BadRequestObjectResult("Bid amount must be greater than zero."); }

        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var league = (await container.ReadItemAsync<League>(leagueId, new PartitionKey(leagueId))).Resource;
        
        // Validation Checks
        if (league?.CurrentAuction?.Status != "awaiting_final_bids")
        {
            return new BadRequestObjectResult("Bidding is not currently open.");
        }

        var team = league.Teams.FirstOrDefault(t => t.OwnerId == principal.UserId);
        if (team == null) { return new ForbidResult("You are not a member of this league's draft."); }
        
        if (bidAmount > team.Budget)
        {
            return new BadRequestObjectResult($"Your bid of ${bidAmount} exceeds your budget of ${team.Budget}.");
        }

        // Add or Update the bid in the dictionary
        league.CurrentAuction.FinalBids[team.Id] = bidAmount;

        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));

        return new OkResult();
    }
}