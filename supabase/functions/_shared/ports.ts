// Storage and live-update interfaces. The Supabase versions live in functions/api/;
// tests use the in-memory versions in supabase/tests/.

import type { DraftHistoryEntry, League, UserProfile } from './models.ts';

export interface StoredLeague {
  league: League;
  version: number;
}

export interface LightLeagueState {
  status: string | null;
  auctionTimer: League['auctionTimer'];
  version: number;
}

export interface LeagueStore {
  get(id: string): Promise<StoredLeague | null>;
  /** Cheap read of the few fields timer callbacks check first. */
  getLight(id: string): Promise<LightLeagueState | null>;
  /** Inserts a new league. */
  create(league: League): Promise<number>;
  /** Saves only if the stored version still equals expectedVersion. Returns the new version, or null on conflict. */
  replace(league: League, expectedVersion: number): Promise<number | null>;
  delete(id: string): Promise<void>;
  findByName(name: string): Promise<StoredLeague | null>;
  listForMember(userId: string): Promise<StoredLeague[]>;
}

export interface ProfileStore {
  find(userId: string): Promise<UserProfile | null>;
  upsert(profile: UserProfile): Promise<void>;
}

export interface HistoryStore {
  /** Inserts or replaces the entry with the same id. */
  save(entry: DraftHistoryEntry): Promise<void>;
  get(id: string): Promise<DraftHistoryEntry | null>;
  listForMember(userId: string): Promise<DraftHistoryEntry[]>;
}

export interface Broadcaster {
  /** Sends an event to everyone watching a league. When toUserId is set, only that user's browser acts on it. */
  send(leagueId: string, event: string, payload: unknown, toUserId?: string): Promise<void>;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** One player's projection as saved before kickoff: position, then PPR, half-PPR and standard points, then name. */
export type ProjectionSnapshot = [position: string, ppr: number, half: number, std: number, name: string];

export interface ProjectionSnapshotStore {
  /** The saved projections for a week, keyed by player id, or null when none were saved. */
  get(season: number, week: number): Promise<Record<string, ProjectionSnapshot> | null>;
  /** Adds or overwrites these players in the week's saved projections, keeping everyone else. */
  merge(season: number, week: number, players: Record<string, ProjectionSnapshot>): Promise<void>;
}

/** One line on a leaderboard: a player's best on one board of one game. */
export interface ScoreRow {
  game: string;
  board: string;
  userId: string;
  name: string;
  score: number;
  detail: string | null;
  at: string;
}

/** Leaderboards and the practice game (or race) each player has going, for the Games page. */
export interface GameStore {
  /** The player's game in progress of this kind ('practice:climb', 'race', ...), or null. */
  getSession(userId: string, kind: string): Promise<Record<string, unknown> | null>;
  setSession(userId: string, kind: string, data: Record<string, unknown> | null): Promise<void>;
  getScore(game: string, board: string, userId: string): Promise<ScoreRow | null>;
  putScore(row: ScoreRow): Promise<void>;
  deleteScore(game: string, board: string, userId: string): Promise<void>;
  /** Best first: highest score, or lowest when `lowFirst`. */
  topScores(game: string, board: string, limit: number, lowFirst: boolean): Promise<ScoreRow[]>;
  /** How many players have a better score than this on the board. */
  countBetter(game: string, board: string, score: number, lowFirst: boolean): Promise<number>;
}
