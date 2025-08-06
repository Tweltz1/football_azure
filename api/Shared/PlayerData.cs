using System;
using System.Collections.Generic;

// This static class is now the single source of truth for player data on the backend.
public static class PlayerData
{
    public static List<Player> GetInitialPlayerPool()
    {
        // This is now the one and only place this list is defined in your C# code.
        return new List<Player>
        {
            new Player { Id = Guid.NewGuid().ToString(), Name = "JaMarr Chase", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Bijan Robinson", Position = "RB", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "CeeDee Lamb", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Justin Jefferson", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Jahmyr Gibbs", Position = "RB", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Puka Nacua", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Malik Nabers", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Amon-Ra St. Brown", Position = "WR", IsDrafted = false },
            new Player { Id = Guid.NewGuid().ToString(), Name = "Saquon Barkley", Position = "RB", IsDrafted = false },
        };
    }
}