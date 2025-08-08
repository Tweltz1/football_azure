using System.Linq;
using System.Collections.Generic;

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
        league.AuctionTimer = new AuctionTimer { EndTime = System.DateTime.UtcNow.AddSeconds(league.DraftTimers.IntermissionTimer) };
    }

    private static string GetBestAvailableRosterSpot(RosterSettings settings, List<RosterSpot> currentRoster, Player player)
    {
        string naturalPosition = player.Position.ToUpper();

        // 1. Try to fill the player's natural position first
        int maxForPosition = GetMaxForPosition(settings, naturalPosition);
        int currentOnRoster = currentRoster.Count(s => s.Position == naturalPosition);
        if (currentOnRoster < maxForPosition)
        {
            return naturalPosition;
        }

        // 2. If natural position is full, try to fill FLEX spot (for RB, WR, TE)
        if (naturalPosition == "RB" || naturalPosition == "WR" || naturalPosition == "TE")
        {
            int maxFlex = GetMaxForPosition(settings, "FLEX");
            int currentFlex = currentRoster.Count(s => s.Position == "FLEX");
            if (currentFlex < maxFlex)
            {
                return "FLEX";
            }
        }

        // 3. If FLEX is full, try SUPERFLEX (for QB, RB, WR, TE)
        if (naturalPosition == "QB" || naturalPosition == "RB" || naturalPosition == "WR" || naturalPosition == "TE")
        {
            int maxSuperFlex = GetMaxForPosition(settings, "SUPERFLEX");
            int currentSuperFlex = currentRoster.Count(s => s.Position == "SUPERFLEX");
            if (currentSuperFlex < maxSuperFlex)
            {
                return "SUPERFLEX";
            }
        }

        // 4. If all other options are exhausted, place them on the BENCH
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
            // --- THIS IS THE FIX ---
            // Treat both "DEF" and "DST" as the same position
            case "DEF":
            case "DST": 
                return settings.DEF;
            // --- END OF FIX ---
            case "FLEX": return settings.FLEX;
            case "SUPERFLEX": return settings.SuperFlex;
            case "BENCH": return settings.Bench;
            default: return 0;
        }
    }
}
