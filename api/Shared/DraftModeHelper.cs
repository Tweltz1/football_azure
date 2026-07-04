using System;

public static class DraftModeHelper
{
    public const string Auction = "auction";
    public const string Manual = "manual";

    public static string Normalize(string value)
    {
        return string.Equals(value, Manual, StringComparison.OrdinalIgnoreCase) ? Manual : Auction;
    }

    public static bool IsManual(string value)
    {
        return string.Equals(Normalize(value), Manual, StringComparison.OrdinalIgnoreCase);
    }
}
