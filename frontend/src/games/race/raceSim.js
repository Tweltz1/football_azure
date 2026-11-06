// The race rules live with the API (supabase/functions/_shared/raceSim.js), which replays leaderboard
// runs with them; this is the bundled copy (`npm run offline-engine` refreshes it).
export * from './raceSim.generated.js';
