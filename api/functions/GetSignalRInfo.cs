using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

public static class GetSignalRInfo
{
    [FunctionName("GetSignalRInfo")]
    public static IActionResult Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
        ILogger log)
    {
        string userId = req.Query["userId"];
        return new OkObjectResult(AppServices.GetSignalRConnectionInfo(userId));
    }
}
