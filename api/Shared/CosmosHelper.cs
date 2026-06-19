using System;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

public static class CosmosHelper
{
    private const int MaxRetries = 5;

    /// <summary>
    /// Read-modify-write with ETag-based optimistic concurrency and automatic retry.
    /// The modify function should mutate the league object and return null on success,
    /// or return an IActionResult to abort the write (e.g. a BadRequestObjectResult for validation errors).
    /// On ETag conflict (another writer modified the doc), the entire read-modify-write cycle is retried
    /// with a fresh read, up to MaxRetries times.
    /// </summary>
    public static async Task<(League league, IActionResult error)> UpdateLeagueAsync(
        Container container,
        string leagueId,
        Func<League, IActionResult> modify,
        ILogger log = null)
    {
        for (int attempt = 0; attempt <= MaxRetries; attempt++)
        {
            var response = await container.ReadItemAsync<League>(
                leagueId, new PartitionKey(leagueId));
            var league = response.Resource;
            var etag = response.ETag;

            var validationError = modify(league);
            if (validationError != null)
                return (null, validationError);

            try
            {
                await container.ReplaceItemAsync(league, league.Id,
                    new PartitionKey(league.Id),
                    new ItemRequestOptions { IfMatchEtag = etag });
                return (league, null);
            }
            catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
            {
                log?.LogWarning(
                    "ETag conflict on attempt {Attempt}/{MaxRetries} for league {LeagueId}. Retrying...",
                    attempt + 1, MaxRetries, leagueId);

                if (attempt == MaxRetries)
                    throw;
            }
        }

        throw new InvalidOperationException("Unreachable");
    }
}
