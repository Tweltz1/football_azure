using System;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

public static class GetSignalRInfo
{
    [Function("GetSignalRInfo")]
    public static IActionResult Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
        ILogger log)
    {
        string userId = req.Query["userId"];
        if (string.IsNullOrEmpty(userId))
        {
            userId = TryGetStaticWebAppsUserId(req);
        }

        return new OkObjectResult(AppServices.GetSignalRConnectionInfo(userId));
    }

    private static string TryGetStaticWebAppsUserId(HttpRequest req)
    {
        if (!req.Headers.TryGetValue("x-ms-client-principal", out var encodedPrincipalValues))
        {
            return null;
        }

        var encodedPrincipal = encodedPrincipalValues.ToString();
        if (string.IsNullOrEmpty(encodedPrincipal))
        {
            return null;
        }

        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(encodedPrincipal));
            return JObject.Parse(json)["userId"]?.ToString();
        }
        catch
        {
            return null;
        }
    }
}
