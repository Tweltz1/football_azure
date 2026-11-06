"""Backtest of the Start/Sit & Trades rules against real NFL weekly results.

Downloads nflverse weekly player stats (free, CC-BY 4.0: https://github.com/nflverse/nflverse-data)
for 2019 onward, rebuilds what the site would have known before each game, and compares the rules
the site used before October 2026 with the tuned ones now in frontend/src/data (startSitWhy.js,
startSitUtils.js, outlook.js). Fits on 2019-2024 and checks on 2025-2026, which the fit never saw.

    python3 -m pip install pandas numpy
    python3 scripts/model/backtest.py            # caches the CSVs in ~/.cache/hood-league-nfl

Scoring is PPR. Only fantasy-relevant players count (season average 6+ or last season 8+ a game).
"""
import os, urllib.request
from math import erf
import numpy as np, pandas as pd

CACHE = os.path.expanduser('~/.cache/hood-league-nfl')
URL = 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{}.csv'
COLS = ['player_id', 'position', 'season', 'week', 'season_type', 'opponent_team', 'fantasy_points_ppr', 'targets', 'carries']


def load(first=2019, last=2026):
    os.makedirs(CACHE, exist_ok=True)
    frames = []
    for year in range(first, last + 1):
        path = os.path.join(CACHE, f'week_{year}.csv')
        if not os.path.exists(path):
            try:
                urllib.request.urlretrieve(URL.format(year), path)
            except Exception as error:  # a season that hasn't started yet
                print(f'skipping {year}: {error}')
                continue
        frames.append(pd.read_csv(path, usecols=COLS, low_memory=False))
    df = pd.concat(frames)
    df = df[(df.season_type == 'REG') & (df.week <= 17) & df.position.isin(['QB', 'RB', 'WR', 'TE'])]
    return df.rename(columns={'fantasy_points_ppr': 'pts'}).sort_values(['player_id', 'season', 'week']).reset_index(drop=True)


def features(df):
    """What was known before each game: season average, last 3, last season, defense allowed so far."""
    g = df.groupby(['player_id', 'season'])
    df['gp'] = g.cumcount()
    df['season_avg'] = (g.pts.cumsum() - df.pts) / df.gp.replace(0, np.nan)
    df['last3'] = g.pts.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    df['work'] = df.targets.fillna(0) + df.carries.fillna(0) * (df.position == 'RB')
    df['work_season'] = (g.work.cumsum() - df.work) / df.gp.replace(0, np.nan)
    df['work_last3'] = g.work.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    rev = df.iloc[::-1].groupby(['player_id', 'season'])
    df['ros_ppg'] = (rev.pts.cumsum() / (rev.cumcount() + 1)).iloc[::-1]
    prev = df.groupby(['player_id', 'season']).pts.agg(['mean', 'size']).reset_index()
    prev = prev[prev['size'] >= 6].assign(season=lambda x: x.season + 1).rename(columns={'mean': 'prev_ppg'})
    df = df.merge(prev[['player_id', 'season', 'prev_ppg']], on=['player_id', 'season'], how='left')
    # Per-game totals each defense allowed to each position before this week, against the league average.
    dw = df.groupby(['season', 'opponent_team', 'position', 'week']).pts.sum().reset_index()
    gd = dw.groupby(['season', 'opponent_team', 'position'])
    dw['d_games'] = gd.cumcount()
    dw['d_avg'] = (gd.pts.cumsum() - dw.pts) / dw.d_games.replace(0, np.nan)
    lg = dw.groupby(['season', 'position', 'week']).d_avg.transform('mean')
    dw['d_factor'] = dw.d_avg / lg
    df = df.merge(dw[['season', 'opponent_team', 'position', 'week', 'd_games', 'd_factor']],
                  on=['season', 'opponent_team', 'position', 'week'], how='left')
    relevant = (df.season_avg.fillna(0) >= 6) | (df.prev_ppg.fillna(0) >= 8)
    return df[relevant & (df.gp >= 1)].reset_index(drop=True)


def own_level(x, season_weight, k):
    """Season average blended with the last 3 games, then with last season while games are few."""
    own = np.where(x.gp >= 3, season_weight * x.season_avg + (1 - season_weight) * x.last3, x.season_avg)
    w = x.gp / (x.gp + k)
    return np.where(x.prev_ppg.notna(), w * own + (1 - w) * x.prev_ppg, own)


def matchup(x, firm_games):
    f, g = x.d_factor.fillna(1), x.d_games.fillna(0)
    shrink = g / (g + firm_games) if firm_games else (g >= 2).astype(float)
    return np.clip(1 + 0.5 * (f - 1) * shrink, 0.88, 1.12)


OLD_SPREAD = {'QB': 7.5, 'RB': 7.5, 'WR': 7.5, 'TE': 6}           # blended with the player's own swing
NEW_SPREAD = {'QB': (66.5, 1.73), 'RB': (15.7, 5.72), 'WR': (0, 7.63), 'TE': (0.9, 6.68)}  # variance = a + b x proj


def spread_old(x):
    fb = x.position.map(OLD_SPREAD).values
    n = (x.gp - 1).clip(lower=0).values
    own = x.pts_sd.values
    return np.where(~np.isnan(own) & (n > 0), np.sqrt((n * own ** 2 + 3 * fb ** 2) / (n + 3)), fb)


def spread_new(x, proj):
    a = x.position.map(lambda p: NEW_SPREAD[p][0]).values
    b = x.position.map(lambda p: NEW_SPREAD[p][1]).values
    return np.sqrt(np.maximum(a + b * np.maximum(np.asarray(proj, float), 1), 13))


ncdf = np.vectorize(lambda z: 0.5 * (1 + erf(z / np.sqrt(2))))


def calibration(t, proj, spread, cap=None, seed=7):
    """Random same-position pairs each week: how often the favorite really outscored the other."""
    rng = np.random.default_rng(seed)
    pairs = []
    for _, grp in t.groupby(['season', 'week', 'position']):
        idx = grp.index.values
        if len(idx) > 1:
            a, b = rng.choice(idx, 60), rng.choice(idx, 60)
            pairs.append(np.vstack([a[a != b], b[a != b]]).T)
    p = np.vstack(pairs)
    chance = ncdf((proj[p[:, 0]] - proj[p[:, 1]]) / np.sqrt(spread[p[:, 0]] ** 2 + spread[p[:, 1]] ** 2))
    if cap:
        chance = np.clip(chance, 1 - cap, cap)
    won = (t.pts.values[p[:, 0]] > t.pts.values[p[:, 1]]).astype(float)
    fav = np.maximum(chance, 1 - chance)
    hit = np.where(chance >= 0.5, won, 1 - won)
    table = pd.DataFrame({'said': fav, 'happened': hit, 'bin': pd.cut(fav, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0])})
    return np.mean((chance - won) ** 2), table.groupby('bin', observed=True).agg(said=('said', 'mean'), happened=('happened', 'mean'), pairs=('said', 'size'))


def main():
    df = features(load())
    df['pts_sd'] = df.groupby(['player_id', 'season']).pts.transform(lambda s: s.shift(1).expanding(2).std())
    for label, t in [('fit seasons 2019-2024', df[df.season <= 2024]), ('held-back seasons 2025-2026', df[df.season >= 2025])]:
        t = t.reset_index(drop=True)
        old = own_level(t, 0.65, 4) * matchup(t, 0)
        new = own_level(t, 0.8, 4) * matchup(t, 6)
        mae = lambda p, y: np.mean(np.abs(p - y))
        print(f'\n== {label}: {len(t)} player-games ==')
        print(f'rest-of-season points/game miss: old {mae(old, t.ros_ppg):.3f}  new {mae(new, t.ros_ppg):.3f}')
        print(f'next-game points miss:           old {mae(old, t.pts):.3f}  new {mae(new, t.pts):.3f}')
        for name, proj, spread, cap in [('old win chances', old, spread_old(t), None), ('new win chances', new, spread_new(t, new), 0.85)]:
            brier, table = calibration(t, np.asarray(proj), spread, cap)
            print(f'{name} (Brier {brier:.4f}, lower is better):')
            print(table.round(2).to_string())
        res = t.pts - own_level(t, 0.8, 4)
        hot = (t.last3 - t.season_avg) >= np.maximum(1.5, 0.15 * t.season_avg)
        cold = (t.season_avg - t.last3) >= np.maximum(1.5, 0.15 * t.season_avg)
        print(f'hot streak vs cold streak, points vs expected: {res[hot].mean():+.2f} / {res[cold].mean():+.2f}')
        busy = (t.work_last3 - t.work_season) / t.work_season.replace(0, np.nan) >= 0.3
        print(f'workload up 30%+ lately, points vs expected: {res[busy].mean() - res.mean():+.2f} vs everyone')


if __name__ == '__main__':
    main()
