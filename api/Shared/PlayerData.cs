using System;
using System.Collections.Generic;

public static class PlayerData
{
    public static List<Player> GetInitialPlayerPool()
    {
        // This list now uses the same consistent placeholder IDs as your frontend.
        return new List<Player>
        {
            new Player { Id = "player1", Name = "JaMarr Chase", Position = "WR", IsDrafted = false },
            new Player { Id = "player2", Name = "Bijan Robinson", Position = "RB", IsDrafted = false },
            new Player { Id = "player3", Name = "CeeDee Lamb", Position = "WR", IsDrafted = false },
            new Player { Id = "player4", Name = "Justin Jefferson", Position = "WR", IsDrafted = false },
            new Player { Id = "player5", Name = "Jahmyr Gibbs", Position = "RB", IsDrafted = false },
            new Player { Id = "player6", Name = "Puka Nacua", Position = "WR", IsDrafted = false },
            new Player { Id = "player7", Name = "Malik Nabers", Position = "WR", IsDrafted = false },
            new Player { Id = "player8", Name = "Amon-Ra St. Brown", Position = "WR", IsDrafted = false },
            new Player { Id = "player9", Name = "Saquon Barkley", Position = "RB", IsDrafted = false },
        };
    }
}