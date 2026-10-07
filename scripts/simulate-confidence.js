// Does the confidence number tell the truth, and how fast does it climb?
//   node scripts/simulate-confidence.js [items=16] [voters=120] [decisiveness=3] [lambda=0.5]
//
// Synthetic voters have a hidden true preference strength for each option and answer matchups with
// logistic noise (higher decisiveness = more consistent). After k answers we compare:
//   claimed  = the confidence the model reports
//   actual   = how right the fitted ranking really is: 2 * (share of item pairs in the true order) - 1
// for three question-picking policies: random, the old balanced one, and the new personal-adaptive one.

import { choosePair, pairKey } from '../server/scheduler.js';
import { personalModel } from '../server/personal.js';
import { mulberry32, sigmoid } from '../server/rating.js';

const N = Number(process.argv[2] || 16);
const VOTERS = Number(process.argv[3] || 120);
const SHARP = Number(process.argv[4] || 3);
const LAMBDA = Number(process.argv[5] || 0.5);
const CHECKS = [10, 20, 30, 40, 50, 60, 80, 100, 120].filter((k) => k <= (N * (N - 1)) / 2);
const ids = Array.from({ length: N }, (_, i) => i + 1);
const total = (N * (N - 1)) / 2;

const rng = mulberry32(2024);
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());

function accuracy(theta, truth) {
  let ok = 0;
  let pairs = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      pairs++;
      if ((theta.get(ids[i]) - theta.get(ids[j])) * (truth[i] - truth[j]) > 0) ok++;
    }
  return 2 * (ok / pairs) - 1;
}

function runVoter(policy) {
  const truth = ids.map(() => gauss());
  const seen = new Set();
  const itemCounts = new Map();
  const votes = [];
  const out = {};
  for (let k = 1; k <= Math.max(...CHECKS); k++) {
    let pair;
    if (policy === 'random') {
      const all = [];
      for (let x = 0; x < N; x++) for (let y = x + 1; y < N; y++) if (!seen.has(pairKey(ids[x], ids[y]))) all.push([ids[x], ids[y]]);
      pair = all[Math.floor(rng() * all.length)];
    } else {
      let personal = null;
      if (policy === 'adaptive' && votes.length >= Math.ceil(N / 2)) {
        const m = personalModel(ids, votes, { lambda: LAMBDA });
        personal = { prob: m.prob };
      }
      pair = choosePair({ itemIds: ids, seen, itemCounts, personal, totalVotes: 1e9, rng });
    }
    const [a, b] = pair;
    const aWins = rng() < sigmoid(SHARP * (truth[a - 1] - truth[b - 1]));
    votes.push({ a, b, result: aWins ? 'a' : 'b' });
    seen.add(pairKey(a, b));
    for (const id of pair) itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
    if (CHECKS.includes(k)) {
      const m = personalModel(ids, votes, { lambda: LAMBDA });
      out[k] = { claimed: m.confidence, actual: accuracy(m.theta, truth) };
    }
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`.padStart(4);
console.log(`${N} items, ${total} possible matchups, ${VOTERS} synthetic voters, decisiveness ${SHARP}, prior ${LAMBDA}\n`);
const policies = ['random', 'balanced', 'adaptive'];
const results = {};
for (const p of policies) {
  const sums = Object.fromEntries(CHECKS.map((k) => [k, { claimed: 0, actual: 0 }]));
  for (let v = 0; v < VOTERS; v++) {
    const r = runVoter(p);
    for (const k of CHECKS) {
      sums[k].claimed += r[k].claimed / VOTERS;
      sums[k].actual += r[k].actual / VOTERS;
    }
  }
  results[p] = sums;
}
console.log('answers  (share of all)   |  random           |  balanced         |  adaptive (new)   | rough guess');
console.log('                          |  claimed actual   |  claimed actual   |  claimed actual   |');
// A made-up reference curve (20/120 -> 20%, 60/120 -> 75%, 80/120 -> 95%) to compare the measured one against.
const anchor = (x) => {
  const pts = [[0, 0], [20 / 120, 0.2], [60 / 120, 0.75], [80 / 120, 0.95], [1, 1]];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])) * (pts[i][1] - pts[i - 1][1]);
  return 1;
};
for (const k of CHECKS) {
  const row = (p) => `${pct(results[p][k].claimed)}    ${pct(results[p][k].actual)}`;
  console.log(
    `${String(k).padStart(4)}     (${pct(k / total)})        |  ${row('random')}      |  ${row('balanced')}      |  ${row('adaptive')}      |  ${pct(anchor(k / total))}`,
  );
}
