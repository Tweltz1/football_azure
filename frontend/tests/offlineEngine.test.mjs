import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bundleEngine, OUT_FILE } from '../scripts/build-offline-engine.mjs';

test('the offline draft engine matches the server code (run `npm run offline-engine` if not)', async () => {
  assert.equal(fs.readFileSync(OUT_FILE, 'utf8'), await bundleEngine());
});
