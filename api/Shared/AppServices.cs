using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;

public static class AppServices
{
    private const string DatabaseName = "Fantasy Football";
    private const string LeaguesContainerName = "Leagues";
    private const string UsersContainerName = "Users";
    private const string HubName = "draftHub";

    private static readonly Lazy<CosmosClient> CosmosClient = new Lazy<CosmosClient>(
        () => new CosmosClient(GetRequiredSetting("CosmosDbConnectionString")));

    private static readonly Lazy<SignalRConfig> SignalR = new Lazy<SignalRConfig>(
        () => SignalRConfig.Parse(GetRequiredSetting("AzureSignalRConnectionString")));

    private static readonly HttpClient HttpClient = new HttpClient();

    public static Container LeaguesContainer => CosmosClient.Value.GetContainer(DatabaseName, LeaguesContainerName);

    public static Container UsersContainer => CosmosClient.Value.GetContainer(DatabaseName, UsersContainerName);

    public static object GetSignalRConnectionInfo(string userId)
    {
        var url = $"{SignalR.Value.Endpoint}/client/?hub={HubName}";
        return new
        {
            url,
            accessToken = GenerateAccessToken(url, userId, TimeSpan.FromHours(1))
        };
    }

    public static Task SendToAllAsync(string target, params object[] arguments)
    {
        return SendSignalRMessageAsync($"/api/v1/hubs/{HubName}", target, arguments);
    }

    public static Task SendToGroupAsync(string groupName, string target, params object[] arguments)
    {
        return SendSignalRMessageAsync($"/api/v1/hubs/{HubName}/groups/{Escape(groupName)}", target, arguments);
    }

    public static Task SendToUserAsync(string userId, string target, params object[] arguments)
    {
        return SendSignalRMessageAsync($"/api/v1/hubs/{HubName}/users/{Escape(userId)}", target, arguments);
    }

    public static Task AddUserToGroupAsync(string userId, string groupName)
    {
        return SendSignalRRequestAsync(HttpMethod.Put, $"/api/v1/hubs/{HubName}/groups/{Escape(groupName)}/users/{Escape(userId)}");
    }

    public static Task RemoveUserFromGroupAsync(string userId, string groupName)
    {
        return SendSignalRRequestAsync(HttpMethod.Delete, $"/api/v1/hubs/{HubName}/groups/{Escape(groupName)}/users/{Escape(userId)}");
    }

    private static Task SendSignalRMessageAsync(string path, string target, object[] arguments)
    {
        var payload = new { target, arguments };
        return SendSignalRRequestAsync(HttpMethod.Post, path, payload);
    }

    private static async Task SendSignalRRequestAsync(HttpMethod method, string path, object payload = null)
    {
        var requestUrl = $"{SignalR.Value.Endpoint}{path}";
        using (var request = new HttpRequestMessage(method, requestUrl))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                GenerateAccessToken(requestUrl, null, TimeSpan.FromMinutes(5)));

            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }

            using (var response = await HttpClient.SendAsync(request))
            {
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    throw new InvalidOperationException($"Azure SignalR REST call failed with {(int)response.StatusCode}: {body}");
                }
            }
        }
    }

    private static string GenerateAccessToken(string audience, string userId, TimeSpan lifetime)
    {
        var expires = DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds();
        var header = Base64UrlEncode(JsonConvert.SerializeObject(new { alg = "HS256", typ = "JWT" }));
        var payloadValues = new Dictionary<string, object>
        {
            ["aud"] = audience,
            ["exp"] = expires
        };

        if (!string.IsNullOrEmpty(userId))
        {
            payloadValues["nameid"] = userId;
            payloadValues["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] = userId;
        }

        var payload = Base64UrlEncode(JsonConvert.SerializeObject(payloadValues));
        var unsignedToken = $"{header}.{payload}";

        using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(SignalR.Value.AccessKey)))
        {
            var signature = Base64UrlEncode(hmac.ComputeHash(Encoding.UTF8.GetBytes(unsignedToken)));
            return $"{unsignedToken}.{signature}";
        }
    }

    private static string Base64UrlEncode(string value)
    {
        return Base64UrlEncode(Encoding.UTF8.GetBytes(value));
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string Escape(string value)
    {
        return Uri.EscapeDataString(value ?? string.Empty);
    }

    private static string GetRequiredSetting(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"Missing required app setting '{name}'.");
        }

        return value;
    }

    private sealed class SignalRConfig
    {
        public string Endpoint { get; private set; }
        public string AccessKey { get; private set; }

        public static SignalRConfig Parse(string connectionString)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var part in connectionString.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var pieces = part.Split(new[] { '=' }, 2);
                if (pieces.Length == 2)
                {
                    values[pieces[0].Trim()] = pieces[1].Trim();
                }
            }

            if (!values.TryGetValue("Endpoint", out var endpoint) || !values.TryGetValue("AccessKey", out var accessKey))
            {
                throw new InvalidOperationException("AzureSignalRConnectionString must include Endpoint and AccessKey.");
            }

            return new SignalRConfig
            {
                Endpoint = endpoint.TrimEnd('/'),
                AccessKey = accessKey
            };
        }
    }
}
