import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The Bay filter chips (All Cars / Awaiting Approval / Ready for Pickup) are flex boxes with a gap. Their
// label has to sit in one <span>, otherwise every word becomes its own flex item and the gap shows up as a
// double space ("Awaiting  Approval"). The demo shop renders the same chips from its own copy of the code.
for (const file of ['../public/app.js', '../public/demo.html']) {
  test(`Bay filter chip labels are wrapped in a single span (${file.split('/').pop()})`, () => {
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    const chip = src.match(/class="qf [^`]*?data-queue="\$\{key\}"[^`]*?<\/button>/);
    assert.ok(chip, 'found the filter chip template');
    assert.match(chip[0], /><span>\$\{label\}<\/span><b>\$\{count\}<\/b><\/button>/);
  });
}
