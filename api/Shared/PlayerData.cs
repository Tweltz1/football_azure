using System;
using System.Collections.Generic;

public static class PlayerData
{
    public static List<Player> GetInitialPlayerPool()
    {
        return new List<Player>
        {
            new Player { Id = "player1", Name = "JaMarr Chase", Position = "WR", Team = "CIN", Rank = 1, IsDrafted = false },
            new Player { Id = "player2", Name = "Bijan Robinson", Position = "RB", Team = "ATL", Rank = 2, IsDrafted = false },
            new Player { Id = "player3", Name = "CeeDee Lamb", Position = "WR", Team = "DAL", Rank = 3, IsDrafted = false },
            new Player { Id = "player4", Name = "Justin Jefferson", Position = "WR", Team = "MIN", Rank = 4, IsDrafted = false },
            new Player { Id = "player5", Name = "Jahmyr Gibbs", Position = "RB", Team = "DET", Rank = 5, IsDrafted = false },
            new Player { Id = "player6", Name = "Puka Nacua", Position = "WR", Team = "LAR", Rank = 6, IsDrafted = false },
            new Player { Id = "player7", Name = "Malik Nabers", Position = "WR", Team = "NYG", Rank = 7, IsDrafted = false },
            new Player { Id = "player8", Name = "Amon-Ra St. Brown", Position = "WR", Team = "DET", Rank = 8, IsDrafted = false },
            new Player { Id = "player9", Name = "Saquon Barkley", Position = "RB", Team = "PHI", Rank = 9, IsDrafted = false },
        };
    }
}