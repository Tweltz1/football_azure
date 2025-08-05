using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.Cosmos;
using System.Collections.Generic;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class EndBiddingPhase
{
    [FunctionName("EndBiddingPhase")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
        [CosmosDB(databaseName: "Fantasy Football", containerName: "Leagues", Connection = "CosmosDbConnectionString")] CosmosClient cosmosClient,
        [SignalR(HubName = "draftHub")] IAsyncCollector<SignalRMessage> signalRMessages,
        ILogger log)
    {
        var container = cosmosClient.GetContainer("Fantasy Football", "Leagues");
        var query = new QueryDefinition("SELECT * FROM c WHERE c.status = 'drafting' AND c.auctionTimer.isPaused = false");

        using (FeedIterator<League> feed = container.GetItemQueryIterator<League>(query))
        {
            while (feed.HasMoreResults)
            {
                foreach (var league in await feed.ReadNextAsync())
                {
                    if (DateTime.UtcNow >= league.AuctionTimer.EndTime)
                    {
                        var winningBid = league.ActiveBids.OrderByDescending(b => b.Value.Amount).FirstOrDefault();

                        var winningTeam = league.Teams.Find(t => t.OwnerId == winningBid.Key);
                        var draftedPlayer = league.DraftPlayers.Find(p => p.Id == league.CurrentPlayerId);

                        winningTeam.Roster.Add(new RosterSpot { Player = draftedPlayer });
                        winningTeam.Budget -= winningBid.Value.Amount;
                        draftedPlayer.IsDrafted = true;

                        league.Status = "intermission";
                        league.CurrentPlayerId = GetNextPlayerId(league);
                        league.ActiveBids.Clear();

                        await container.ReplaceItemAsync(league, league.Id, new PartitionKey(league.Id));

                        await signalRMessages.AddAsync(new SignalRMessage
                        {
                            Target = "draftWinnerAnnounced",
                            Arguments = new object[] { league.Id, winningTeam.Name, winningBid.Value.Amount }
                        });
                    }
                }
            }
        }
        return new OkResult();
    }

    private static string GetNextPlayerId(League league)
    {
        return league.DraftPlayers.Where(p => !p.IsDrafted).OrderBy(p => Guid.NewGuid()).FirstOrDefault()?.Id;
    }
}