using System;

public static class BidRules
{
    public static int GetRosterSpotTotal(RosterSettings settings)
    {
        settings = settings ?? new RosterSettings();
        return Math.Max(0, settings.QB)
            + Math.Max(0, settings.RB)
            + Math.Max(0, settings.WR)
            + Math.Max(0, settings.TE)
            + Math.Max(0, settings.K)
            + Math.Max(0, settings.DEF)
            + Math.Max(0, settings.FLEX)
            + Math.Max(0, settings.SuperFlex)
            + Math.Max(0, settings.Bench);
    }

    public static int GetOpenRosterSpots(League league, Team team)
    {
        if (league == null || team == null) return 0;
        var totalRosterSpots = GetRosterSpotTotal(league.RosterSettings);
        return Math.Max(0, totalRosterSpots - (team.Roster?.Count ?? 0));
    }

    public static int GetMaxBid(League league, Team team)
    {
        if (league == null || team == null) return 0;
        var openRosterSpots = GetOpenRosterSpots(league, team);
        if (openRosterSpots <= 0) return 0;

        var reserveForRemainingPlayers = openRosterSpots - 1;
        return Math.Max(0, team.Budget - reserveForRemainingPlayers);
    }
}
