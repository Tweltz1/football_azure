using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.WebJobs.Extensions.SignalRService;

public static class GetSignalRInfo
{
    [FunctionName("GetSignalRInfo")]
    public static IActionResult Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = null)] HttpRequest req,
        [SignalRConnectionInfo(HubName = "draftHub", UserId = "{query.userId}")] string connectionInfo,
        ILogger log)
    {
        return connectionInfo != null
            ? (ActionResult)new OkObjectResult(connectionInfo)
            : new NotFoundObjectResult("SignalR connection info not found.");
    }
}
