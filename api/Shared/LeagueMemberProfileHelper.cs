using System;
using System.Linq;
using System.Threading.Tasks;

public static class LeagueMemberProfileHelper
{
    public static void Upsert(League league, string userId, UserProfile userProfile = null, string displayName = null)
    {
        if (league == null || string.IsNullOrWhiteSpace(userId))
        {
            return;
        }

        league.EnsureDefaults();
        league.MemberProfiles.TryGetValue(userId, out var existingProfile);
        var profile = Build(userId, userProfile, displayName, existingProfile);
        league.MemberProfiles[userId] = profile;
    }

    public static async Task<bool> HydrateMissingAsync(League league)
    {
        if (league == null)
        {
            return false;
        }

        league.EnsureDefaults();
        var changed = false;
        foreach (var memberId in league.Members.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (HasReadableLabel(league, memberId))
            {
                continue;
            }

            var profile = await UserProfileStore.FindAsync(memberId);
            Upsert(league, memberId, profile);
            changed = true;
        }

        return changed;
    }

    private static LeagueMemberProfile Build(string userId, UserProfile userProfile, string displayName, LeagueMemberProfile existingProfile)
    {
        var providedName = Clean(displayName);
        var profileName = Clean(userProfile?.DisplayName);
        var label = FirstProvided(providedName, profileName, userId);
        var email = LooksLikeEmail(providedName)
            ? providedName
            : LooksLikeEmail(profileName)
                ? profileName
                : Clean(existingProfile?.Email);

        return new LeagueMemberProfile
        {
            UserId = userId,
            DisplayName = label,
            Email = email
        };
    }

    private static bool HasReadableLabel(League league, string userId)
    {
        if (!league.MemberProfiles.TryGetValue(userId, out var profile) || profile == null)
        {
            return false;
        }

        var label = FirstProvided(profile.Email, profile.DisplayName);
        return !string.IsNullOrWhiteSpace(label) && !string.Equals(label, userId, StringComparison.OrdinalIgnoreCase);
    }

    private static string FirstProvided(params string[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    private static string Clean(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool LooksLikeEmail(string value)
    {
        return !string.IsNullOrWhiteSpace(value) && value.Contains("@") && value.Contains(".");
    }
}
