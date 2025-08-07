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
    public string Password { get; set; }
    [JsonProperty("members")]
    public List<string> Members { get; set; } = new List<string>();
    [JsonProperty("teams")]
    public List<Team> Teams { get; set; } = new List<Team>();
    [JsonProperty("status")]
    public string Status { get; set; }

    [JsonProperty("readyMembers")]
    public List<string> ReadyMembers { get; set; } = new List<string>();

    [JsonProperty("rosterSettings")]
    public RosterSettings RosterSettings { get; set; } = new RosterSettings();
    [JsonProperty("draftTimers")]
    public DraftTimers DraftTimers { get; set; } = new DraftTimers();

    [JsonProperty("initialPlayerPool")]
    public List<Player> InitialPlayerPool { get; set; } = new List<Player>();
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
	[JsonProperty("beerBitchTeamId")]
    public string BeerBitchTeamId { get; set; }
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
    
    [JsonProperty("favoritePlayerIds")]
    public List<string> FavoritePlayerIds { get; set; } = new List<string>();
}

public class Player
{
    [JsonProperty("id")]
    public string Id { get; set; }
    [JsonProperty("name")]
    public string Name { get; set; }
    [JsonProperty("position")]
    public string Position { get; set; }
	[JsonProperty("Team")]
    public string Team { get; set; }
    [JsonProperty("Rank")]
    public int Rank { get; set; }
    [JsonProperty("isDrafted")]
    public bool IsDrafted { get; set; }
    [JsonProperty("price")]
    public int Price { get; set; }
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
    [JsonProperty("timeRemainingOnPause")]
    public int TimeRemainingOnPause { get; set; }
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
    [JsonProperty("winningTeamId")]
    public string WinningTeamId { get; set; }
    [JsonProperty("winningBid")]
    public int WinningBid { get; set; }
    [JsonProperty("player")]
    public Player Player { get; set; }
    [JsonProperty("allBids")]
    public Dictionary<string, Bid> AllBids { get; set; } = new Dictionary<string, Bid>();
}

public class RosterSettings
{
    [JsonProperty("qb")]
    public int QB { get; set; } = 1;
    [JsonProperty("wr")]
    public int WR { get; set; } = 3;
    [JsonProperty("rb")]
    public int RB { get; set; } = 2;
    [JsonProperty("te")]
    public int TE { get; set; } = 1;
    [JsonProperty("k")]
    public int K { get; set; } = 1;
    [JsonProperty("def")]
    public int DEF { get; set; } = 1;
    [JsonProperty("flex")]
    public int FLEX { get; set; } = 1;
    [JsonProperty("superFlex")]
    public int SuperFlex { get; set; } = 1;
    [JsonProperty("bench")]
    public int Bench { get; set; } = 6;
}

public class DraftTimers
{
    [JsonProperty("bidTimer")]
    public int BidTimer { get; set; } = 20;
    [JsonProperty("intermissionTimer")]
    public int IntermissionTimer { get; set; } = 30;
    [JsonProperty("rebidTimer")]
    public int RebidTimer { get; set; } = 15;
}