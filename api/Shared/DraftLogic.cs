using System.Linq;
using System.Collections.Generic;
using System;

public static class DraftLogic
{
    public static void AwardPlayerToTeam(League league, Player player, Team winningTeam, int amount)
    {
        player.IsDrafted = true;
        player.Price = amount;
        winningTeam.Budget -= amount;

        string rosterPosition = GetBestAvailableRosterSpot(league.RosterSettings, winningTeam.Roster, player);

        winningTeam.Roster.Add(new RosterSpot { Player = player, Position = rosterPosition });

        league.DraftLog.Add(new DraftPick
        {
            WinningTeamId = winningTeam.Id,
            WinningBid = amount,
            Player = player,
            AllBids = new Dictionary<string, Bid>(league.ActiveBids)
        });
        
        league.Status = "intermission";
        league.ActiveBids.Clear();
        league.CurrentPlayerId = null;
        league.TieBreaker = null;
        league.AuctionTimer = new AuctionTimer { EndTime = DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
    }

    public static string GetNextRandomPlayerId(League league, string currentPlayerId = null)
    {
        var playerPool = league.InitialPlayerPool ?? new List<Player>();
        var undraftedPlayers = playerPool
            .Where(p => !p.IsDrafted && NflByeWeeks.IsKnownTeam(p.Team))
            .ToList();
        
        if (currentPlayerId != null)
        {
            undraftedPlayers.RemoveAll(p => p.Id == currentPlayerId);
        }

        if (!undraftedPlayers.Any()) return null;
        
        var random = new Random();
        return undraftedPlayers[random.Next(undraftedPlayers.Count)].Id;
    }

    private static string GetBestAvailableRosterSpot(RosterSettings settings, List<RosterSpot> currentRoster, Player player)
    {
        string naturalPosition = player.Position.ToUpper();

        int maxForPosition = GetMaxForPosition(settings, naturalPosition);
        int currentOnRoster = currentRoster.Count(s => s.Position == naturalPosition);
        if (currentOnRoster < maxForPosition)
        {
            return naturalPosition;
        }

        if (naturalPosition == "RB" || naturalPosition == "WR" || naturalPosition == "TE")
        {
            int maxFlex = GetMaxForPosition(settings, "FLEX");
            int currentFlex = currentRoster.Count(s => s.Position == "FLEX");
            if (currentFlex < maxFlex)
            {
                return "FLEX";
            }
        }

        if (naturalPosition == "QB" || naturalPosition == "RB" || naturalPosition == "WR" || naturalPosition == "TE")
        {
            int maxSuperFlex = GetMaxForPosition(settings, "SUPERFLEX");
            int currentSuperFlex = currentRoster.Count(s => s.Position == "SUPERFLEX");
            if (currentSuperFlex < maxSuperFlex)
            {
                return "SUPERFLEX";
            }
        }

        return "BENCH";
    }

    private static int GetMaxForPosition(RosterSettings settings, string position)
    {
        switch (position.ToUpper())
        {
            case "QB": return settings.QB;
            case "RB": return settings.RB;
            case "WR": return settings.WR;
            case "TE": return settings.TE;
            case "K": return settings.K;
            case "DEF":
            case "DST": 
                return settings.DEF;
            case "FLEX": return settings.FLEX;
            case "SUPERFLEX": return settings.SuperFlex;
            case "BENCH": return settings.Bench;
            default: return 0;
        }
    }
}
