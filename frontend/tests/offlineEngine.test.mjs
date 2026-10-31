import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bundleEngine, bundleGames, bundleRace, GAMES_OUT_FILE, OUT_FILE, RACE_OUT_FILE } from '../scripts/build-offline-engine.mjs';

test('the offline draft engine matches the server code (run `npm run offline-engine` if not)', async () => {
  assert.equal(fs.readFileSync(OUT_FILE, 'utf8'), await bundleEngine());
});

test('the Games page mini-games match the server code (run `npm run offline-engine` if not)', async () => {
  assert.equal(fs.readFileSync(GAMES_OUT_FILE, 'utf8'), await bundleGames());
});

test('the Crew Fun Run rules match the server code (run `npm run offline-engine` if not)', async () => {
  assert.equal(fs.readFileSync(RACE_OUT_FILE, 'utf8'), await bundleRace());
});
