# Start/Sit & Trades model check

`backtest.py` tests the rules behind Start/Sit & Trades against seven seasons of real weekly NFL results
(nflverse, 2019 to week 6 of 2026, about 21,000 games by fantasy-relevant players). It fits on 2019-2024
and checks on 2025-2026, which the fit never saw. Run it after changing any of the numbers below.

## What it found (October 2026)

| Question | Answer from past seasons | Change on the site |
| --- | --- | --- |
| Are our win chances honest? | No. When we said 85%, it happened 75% of the time; 75% happened 68%. | Spread now grows with the projection (a 20-point WR swings about ±12, an 8-point WR about ±8), capped at 85%. Now 74% said = 73% happened, 83% = 86%. |
| Does a player's own week-to-week swing predict next week's? | No, once the projection is known. | No longer used. |
| Do hot and cold streaks carry over? | Barely. Hot players scored no more than expected (−0.6 in 2025-26). | Rest-of-season value counts the last 3 games at 20% (was 35%). "Heating up" needs a 3-point gap to count in a "?" card and is the second-to-last reason listed. |
| Does a bigger workload carry over? | Yes. 30%+ more targets or carries lately = about +0.3 to +0.5 points a game. | Workload is listed ahead of matchup and form in "?" cards. |
| How much do matchups matter? | Real but small: about +0.5 to +1 point against soft defenses, −0.5 against tough ones. Meaningless in a defense's first 2 games. | Matchups read "too early to tell" before a defense's 3rd game; schedule-ahead factors firm up as defenses play (3 games count a third, 6 half). |
| Does a "safer floor" (best worst game) predict points? | No; it only slightly predicts a bust week. | Listed last among reasons. |

Accuracy of rest-of-season points per game improved about 1.2% (4.02 → 3.97 points off on 2025-26) and
next-game points slightly; the bigger gain is that the percentages now mean what they say.

## Limits

- Sleeper's historical projections can't be downloaded, so the backtest uses our own season-average
  projection. Sleeper's projections are a bit sharper, so real misses may be a little smaller than this
  spread assumes. Saving each week's projections and comparing them with results would settle it.
- K and DST aren't in this data; their spreads are unchanged (±4 and ±5.5).
