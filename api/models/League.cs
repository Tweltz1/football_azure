using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class League
{
    [JsonProperty("id")]
    public string Id { get; set; }
    [JsonProperty("name")]
    public string Name { get; set; }
    [JsonProperty("adminId")]
    public string AdminId { get; set; }
    [JsonProperty("password")]
    public string Password { get; set; } // Remember to hash this
    [JsonProperty("members")]
    public List<string> Members { get; set; } = new List<string>();
    [JsonProperty("teams")]
    public List<Team> Teams { get; set; } = new List<Team>();
    [JsonProperty("status")]
    public string Status { get; set; } // e.g., "created", "drafting", "paused"

    [JsonProperty("draftPlayers")]
    public List<Player> DraftPlayers { get; set; } = new List<Player>();
    [JsonProperty("currentPlayerId")]
    public string CurrentPlayerId { get; set; }

    [JsonProperty("activeBids")]
    public Dictionary<string, Bid> ActiveBids { get; set; } = new Dictionary<string, Bid>();
    [JsonProperty("auctionTimer")]
    public AuctionTimer AuctionTimer { get; set; }
    [JsonProperty("draftLog")]
    public List<DraftPick> DraftLog { get; set; } = new List<DraftPick>();
}

public class Team
{
    [JsonProperty("id")]
    public string Id { get; set; }
    [JsonProperty("ownerId")]
    public string OwnerId { get; set; }
    [JsonProperty("name")]
    public string Name { get; set; }
    [JsonProperty("budget")]
    public int Budget { get; set; }
    [JsonProperty("roster")]
    public List<RosterSpot> Roster { get; set; } = new List<RosterSpot>();
}

public class Player
{
    [JsonProperty("id")]
    public string Id { get; set; }
    [JsonProperty("name")]
    public string Name { get; set; }
    [JsonProperty("position")]
    public string Position { get; set; }
    [JsonProperty("isDrafted")]
    public bool IsDrafted { get; set; }
}

public class Bid
{
    [JsonProperty("amount")]
    public int Amount { get; set; }
    [JsonProperty("timestamp")]
    public DateTime Timestamp { get; set; }
}

public class AuctionTimer
{
    [JsonProperty("endTime")]
    public DateTime EndTime { get; set; }
    [JsonProperty("isPaused")]
    public bool IsPaused { get; set; }
}

public class RosterSpot
{
    [JsonProperty("position")]
    public string Position { get; set; }
    [JsonProperty("player")]
    public Player Player { get; set; }
}

public class DraftPick
{
    [JsonProperty("playerId")]
    public string PlayerId { get; set; }
    [JsonProperty("teamId")]
    public string TeamId { get; set; }
    [JsonProperty("price")]
    public int Price { get; set; }
}