import test from 'node:test';
import assert from 'node:assert/strict';
import { personalModel } from '../server/personal.js';
import { choosePair, pairKey } from '../server/scheduler.js';
import { mulberry32, sigmoid } from '../server/rating.js';

const ids = Array.from({ length: 12 }, (_, i) => i + 1);

// A voter with a fixed hidden ordering: item 1 is their favourite, item 12 their least.
function answer(a, b, rng) {
  const truth = (id) => -id * 0.5;
  return rng() < sigmoid(3 * (truth(a) - truth(b))) ? 'a' : 'b';
}

test('no answers means zero confidence and a neutral ranking', () => {
  const m = personalModel(ids, []);
  assert.equal(m.confidence, 0);
  assert.equal(m.prob(1, 2), 0.5);
});

test('confidence climbs as a voter answers, and never claims certainty early', () => {
  const rng = mulberry32(3);
  const votes = [];
  const seen = new Set();
  const counts = new Map();
  const at = {};
  for (let k = 1; k <= 60; k++) {
    const m = k > 6 ? personalModel(ids, votes) : null;
    const pair = choosePair({ itemIds: ids, seen, itemCounts: counts, personal: m ? { prob: m.prob } : null, totalVotes: 1e9, rng });
    const [a, b] = pair;
    votes.push({ a, b, result: answer(a, b, rng) });
    seen.add(pairKey(a, b));
    for (const id of pair) counts.set(id, (counts.get(id) || 0) + 1);
    if ([5, 15, 30, 60].includes(k)) at[k] = personalModel(ids, votes).confidence;
  }
  assert.ok(at[5] < at[15] && at[15] < at[30] && at[30] < at[60], JSON.stringify(at));
  assert.ok(at[5] < 0.4, `5 answers should not look confident: ${at[5]}`);
  assert.ok(at[60] > 0.6, `60 answers from a consistent voter should be fairly sure: ${at[60]}`);
});

test('the fitted ranking recovers a consistent voter\'s order', () => {
  const rng = mulberry32(8);
  const votes = [];
  for (let x = 0; x < ids.length; x++)
    for (let y = x + 1; y < ids.length; y++) votes.push({ a: ids[x], b: ids[y], result: answer(ids[x], ids[y], rng) });
  const m = personalModel(ids, votes);
  const order = [...m.scores].sort((p, q) => q[1] - p[1]).map(([id]) => id);
  assert.ok(order.indexOf(1) < 3 && order.indexOf(12) > 8, order.join(','));
});

test('personal mode asks about unsettled pairs, not ones already implied', () => {
  // 1 beat 2, and 2 beat 3: that 1 beats 3 is already implied, so the unsettled 3-vs-4 style pair wins.
  const votes = [
    { a: 1, b: 2, result: 'a' }, { a: 2, b: 3, result: 'a' },
    { a: 1, b: 3, result: 'a' }, { a: 4, b: 5, result: 'a' }, { a: 5, b: 6, result: 'a' },
  ];
  const m = personalModel([1, 2, 3, 4, 5, 6], votes);
  const seen = new Set(votes.map((v) => pairKey(v.a, v.b)));
  const counts = new Map();
  const pair = choosePair({ itemIds: [1, 2, 3, 4, 5, 6], seen, itemCounts: counts, personal: { prob: m.prob }, totalVotes: 1e9, rng: () => 0.5 });
  const crossGroup = (id) => (id <= 3 ? 'top' : 'bottom');
  assert.notEqual(crossGroup(pair[0]), crossGroup(pair[1]), `expected a pair linking the two groups, got ${pair}`);
});
