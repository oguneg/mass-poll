import test from 'node:test';
import assert from 'node:assert/strict';
import { fitBT, summarize, sigmoid, mulberry32 } from '../server/rating.js';

function simulate(trueTheta, nGames, rng) {
  const n = trueTheta.length;
  const agg = new Map();
  for (let g = 0; g < nGames; g++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;
    const iWins = rng() < sigmoid(trueTheta[i] - trueTheta[j]);
    const [a, b] = i < j ? [i, j] : [j, i];
    const key = `${a}-${b}`;
    const e = agg.get(key) || { i: a, j: b, si: 0, sj: 0 };
    if ((a === i) === iWins) e.si++;
    else e.sj++;
    agg.set(key, e);
  }
  return [...agg.values()];
}

test('fitBT recovers the true ordering from enough games', () => {
  const truth = [1.2, 0.6, 0.1, -0.3, -0.8, -1.0];
  const games = simulate(truth, 6000, mulberry32(7));
  const { theta, cov } = fitBT(truth.length, games);
  const order = [...theta.keys()].sort((a, b) => theta[b] - theta[a]);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  const sum = summarize(theta, cov, truth.length);
  assert.equal(sum[0].rank, 1);
  assert.equal(sum[5].rank, 6);
  for (const s of sum) assert.ok(s.lo <= s.score && s.score <= s.hi);
});

test('intervals shrink as data grows', () => {
  const truth = [0.5, 0, -0.5];
  const width = (n) => {
    const { theta, cov } = fitBT(3, simulate(truth, n, mulberry32(3)));
    const s = summarize(theta, cov, 3);
    return s[1].hi - s[1].lo;
  };
  assert.ok(width(4000) < width(100));
});

test('items with no wins stay finite and empty data is neutral', () => {
  const { theta } = fitBT(2, [{ i: 0, j: 1, si: 20, sj: 0 }]);
  assert.ok(Number.isFinite(theta[0]) && Number.isFinite(theta[1]));
  assert.ok(theta[0] > theta[1]);
  const empty = fitBT(3, []);
  assert.deepEqual([...empty.theta], [0, 0, 0]);
});

test('ties pull two items together', () => {
  const decisive = fitBT(2, [{ i: 0, j: 1, si: 10, sj: 0 }]).theta;
  const tied = fitBT(2, [{ i: 0, j: 1, si: 5, sj: 5 }]).theta;
  assert.ok(Math.abs(tied[0] - tied[1]) < 1e-9);
  assert.ok(decisive[0] - decisive[1] > 1);
});
