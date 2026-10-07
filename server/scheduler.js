// Picks the next matchup for a voter.
//
// Every candidate pair is scored on three things:
//   coverage  - pairs few people have judged yet score higher
//   closeness - pairs the model thinks are near 50/50 are the most informative
//   balance   - items this voter has already seen a lot score lower, so each
//               voter meets every item roughly evenly
// Until the poll has some data, coverage dominates; afterwards closeness takes over.
// A little random jitter keeps voters from all receiving identical sequences.
//
// Personal mode: once a voter has met every option, `personal.prob(a, b)` (the chance a is truly
// above b in THIS voter's own ranking) lets us ask the matchups they have not settled yet, which is
// the fastest way to firm up their own ranking. Pairs already implied by their answers are skipped.

import { sigmoid } from './rating.js';

export const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function choosePair({
  itemIds,
  theta = new Map(),
  pairCounts = new Map(),
  seen = new Set(),
  itemCounts = new Map(),
  unknown = new Set(),
  totalVotes = 0,
  personal = null,
  rng = Math.random,
}) {
  const warm = totalVotes < itemIds.length * 10;
  const wCover = warm ? 1 : 0.5;
  const wInfo = warm ? 0.3 : 1;
  let best = null;
  let bestScore = -Infinity;
  for (let x = 0; x < itemIds.length; x++) {
    const a = itemIds[x];
    if (unknown.has(a)) continue;
    for (let y = x + 1; y < itemIds.length; y++) {
      const b = itemIds[y];
      if (unknown.has(b)) continue;
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      const cover = 1 / Math.sqrt((pairCounts.get(key) || 0) + 1);
      const p = sigmoid((theta.get(a) || 0) - (theta.get(b) || 0));
      const info = 4 * p * (1 - p);
      const balance = 0.15 * ((itemCounts.get(a) || 0) + (itemCounts.get(b) || 0));
      let score;
      if (personal) {
        const q = personal.prob(a, b);
        const unsettled = 1 - Math.abs(2 * q - 1); // 1 when we cannot tell which they prefer
        score = unsettled + 0.2 * cover + 0.1 * info - 0.02 * ((itemCounts.get(a) || 0) + (itemCounts.get(b) || 0)) + rng() * 0.05;
      } else {
        score = wCover * cover + wInfo * info - balance + rng() * 0.15;
      }
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  if (!best) return null;
  return rng() < 0.5 ? best : [best[1], best[0]];
}
