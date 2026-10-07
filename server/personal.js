// A single voter's own ranking model: fit Bradley-Terry on just their answers.
// Gives the ranking, how sure we are about it (confidence), and the chance that one option
// truly outranks another for THIS voter, which the scheduler uses to pick their next question.

import { fitBT, orderConfidence, orderProb, scoresOf } from './rating.js';

// A stronger prior than the crowd fit: one person's few answers should not look more certain than
// they are. Calibrated in scripts/simulate-confidence.js.
export const PERSONAL_LAMBDA = 0.5;

// votes: [{ a, b, result }] with a/b item ids and result 'a' | 'b' | 'tie' (relative to a, b).
export function personalModel(itemIds, votes, { lambda = PERSONAL_LAMBDA } = {}) {
  const n = itemIds.length;
  const index = new Map(itemIds.map((id, i) => [id, i]));
  const games = new Map();
  const played = new Map(itemIds.map((id) => [id, 0]));
  for (const v of votes) {
    const i = index.get(v.a);
    const j = index.get(v.b);
    if (i === undefined || j === undefined) continue;
    played.set(v.a, played.get(v.a) + 1);
    played.set(v.b, played.get(v.b) + 1);
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    const g = games.get(key) || { i: Math.min(i, j), j: Math.max(i, j), si: 0, sj: 0 };
    const aIsLow = i < j;
    const aPts = v.result === 'a' ? 1 : v.result === 'tie' ? 0.5 : 0;
    g.si += aIsLow ? aPts : 1 - aPts;
    g.sj += aIsLow ? 1 - aPts : aPts;
    games.set(key, g);
  }

  if (!games.size) {
    return { n: 0, confidence: 0, prob: () => 0.5, theta: new Map(itemIds.map((id) => [id, 0])), scores: new Map(), played };
  }
  const { theta, cov } = fitBT(n, [...games.values()], { lambda });
  const scores = scoresOf(theta, n);
  return {
    n: votes.length,
    confidence: orderConfidence(theta, cov, n),
    prob: (idA, idB) => orderProb(theta, cov, n, index.get(idA), index.get(idB)),
    theta: new Map(itemIds.map((id, i) => [id, theta[i]])),
    scores: new Map(itemIds.map((id, i) => [id, scores[i]])),
    played,
  };
}
