using System.Collections.Generic;
using System.Linq;
using System.Text;

public static class TeamNameHelper
{
    public static string GetPreferredTeamName(UserProfile profile, string fallbackUserId)
    {
        if (!string.IsNullOrWhiteSpace(profile?.DefaultTeamName))
        {
            return profile.DefaultTeamName.Trim();
        }

        var displayName = !string.IsNullOrWhiteSpace(profile?.DisplayName) ? profile.DisplayName.Trim() : fallbackUserId;
        return string.IsNullOrWhiteSpace(displayName) ? "New Team" : $"{displayName}'s Team";
    }

    public static string GetUniqueTeamName(IEnumerable<Team> existingTeams, string preferredName, string displayName)
    {
        var existingNames = new HashSet<string>(
            (existingTeams ?? Enumerable.Empty<Team>())
                .Select(team => team?.Name)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name.Trim()),
            System.StringComparer.OrdinalIgnoreCase);

        var baseName = string.IsNullOrWhiteSpace(preferredName) ? "New Team" : preferredName.Trim();
        if (!existingNames.Contains(baseName))
        {
            return baseName;
        }

        var ownerPart = Slugify(displayName);
        var candidateBase = string.IsNullOrWhiteSpace(ownerPart) ? baseName : $"{baseName}_{ownerPart}";
        if (!existingNames.Contains(candidateBase))
        {
            return candidateBase;
        }

        var index = 2;
        var candidate = $"{candidateBase}_{index}";
        while (existingNames.Contains(candidate))
        {
            index += 1;
            candidate = $"{candidateBase}_{index}";
        }

        return candidate;
    }

    private static string Slugify(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;

        var builder = new StringBuilder();
        foreach (var character in value.Trim())
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
            else if (builder.Length > 0 && builder[builder.Length - 1] != '_')
            {
                builder.Append('_');
            }
        }

        return builder.ToString().Trim('_');
    }
}
