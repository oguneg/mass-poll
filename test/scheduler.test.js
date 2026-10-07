import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePair, pairKey } from '../server/scheduler.js';
import { mulberry32 } from '../server/rating.js';

const ids = [1, 2, 3, 4, 5, 6, 7, 8];

test('a voter walks through every pair exactly once, then runs out', () => {
  const rng = mulberry32(5);
  const seen = new Set();
  const itemCounts = new Map();
  for (let k = 0; k < 28; k++) {
    const pair = choosePair({ itemIds: ids, seen, itemCounts, rng });
    assert.ok(pair, `pair ${k}`);
    const key = pairKey(...pair);
    assert.ok(!seen.has(key));
    seen.add(key);
    for (const id of pair) itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
  }
  assert.equal(choosePair({ itemIds: ids, seen, itemCounts, rng }), null);
});

test('items marked unknown never appear', () => {
  const rng = mulberry32(9);
  const unknown = new Set([3, 6]);
  const seen = new Set();
  for (let k = 0; k < 15; k++) {
    const pair = choosePair({ itemIds: ids, seen, unknown, rng });
    assert.ok(pair && !pair.some((id) => unknown.has(id)));
    seen.add(pairKey(...pair));
  }
});

test('first ten questions show a voter every item', () => {
  const rng = mulberry32(11);
  for (let trial = 0; trial < 20; trial++) {
    const seen = new Set();
    const itemCounts = new Map();
    const shown = new Set();
    for (let k = 0; k < 10; k++) {
      const pair = choosePair({ itemIds: ids, seen, itemCounts, rng });
      seen.add(pairKey(...pair));
      for (const id of pair) (shown.add(id), itemCounts.set(id, (itemCounts.get(id) || 0) + 1));
    }
    assert.equal(shown.size, 8);
  }
});

test('once warmed up, close matchups are preferred over lopsided ones', () => {
  const theta = new Map([[1, 2], [2, 1.9], [3, -2]]);
  let close = 0;
  const rng = mulberry32(2);
  for (let k = 0; k < 200; k++) {
    const pair = choosePair({ itemIds: [1, 2, 3], theta, totalVotes: 1000, rng });
    if (pairKey(...pair) === '1-2') close++;
  }
  assert.ok(close > 150);
});
