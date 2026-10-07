// Turns raw vote rows into the numbers the UI and scheduler need.

import { fitBT, summarize, orderConfidence } from './rating.js';
import { personalModel } from './personal.js';
import { pairKey } from './scheduler.js';

// A voter's influence is capped so someone voting 300 times cannot outweigh
// many people who each voted the baseline amount.
const WEIGHT_CAP_VOTES = 20;
const voterWeight = (n) => Math.min(1, Math.sqrt(WEIGHT_CAP_VOTES / n));

const SIG_MIN_N = 10;
const SIG_Z = 1.96;

function significantlyBeats(wins, ties, n) {
  if (n < SIG_MIN_N) return false;
  const share = (wins + ties / 2) / n;
  return share - 0.5 > SIG_Z * Math.sqrt(0.25 / n);
}

// Rock-paper-scissors triples: A beats B, B beats C, C beats A, all significant.
function findCycles(itemIds, pairs) {
  const beats = new Set();
  for (const p of pairs) {
    if (significantlyBeats(p.aWins, p.ties, p.n)) beats.add(`${p.a}>${p.b}`);
    if (significantlyBeats(p.bWins, p.ties, p.n)) beats.add(`${p.b}>${p.a}`);
  }
  const out = [];
  for (let x = 0; x < itemIds.length; x++)
    for (let y = x + 1; y < itemIds.length; y++)
      for (let z = y + 1; z < itemIds.length; z++) {
        const [a, b, c] = [itemIds[x], itemIds[y], itemIds[z]];
        if (beats.has(`${a}>${b}`) && beats.has(`${b}>${c}`) && beats.has(`${c}>${a}`)) out.push([a, b, c]);
        else if (beats.has(`${a}>${c}`) && beats.has(`${c}>${b}`) && beats.has(`${b}>${a}`)) out.push([a, c, b]);
      }
  return out;
}

export function createStats(db, { maxAgeMs = 3000 } = {}) {
  const cache = new Map();

  const signature = (pollId) =>
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM votes WHERE poll_id = ?) || ':' ||
                (SELECT COUNT(*) FROM unknowns WHERE poll_id = ?) AS s`,
      )
      .get(pollId, pollId).s;

  function compute(pollId) {
    const items = db.prepare('SELECT * FROM items WHERE poll_id = ? ORDER BY position').all(pollId);
    const index = new Map(items.map((it, i) => [it.id, i]));
    const { min_votes: minVotes } = db.prepare('SELECT min_votes FROM polls WHERE id = ?').get(pollId);
    const allVotes = db.prepare('SELECT voter_id, item_a, item_b, result FROM votes WHERE poll_id = ?').all(pollId);

    // Only voters who answered the baseline contribute to the crowd ranking.
    const perVoter = new Map();
    for (const v of allVotes) perVoter.set(v.voter_id, (perVoter.get(v.voter_id) || 0) + 1);
    const contributors = new Set([...perVoter].filter(([, n]) => n >= minVotes).map(([id]) => id));
    const votes = allVotes.filter((v) => contributors.has(v.voter_id));

    const pairMap = new Map();
    let ties = 0;
    for (const v of votes) {
      const key = pairKey(v.item_a, v.item_b);
      let p = pairMap.get(key);
      if (!p) {
        p = { a: v.item_a, b: v.item_b, aWins: 0, bWins: 0, ties: 0, n: 0, sa: 0, sb: 0 };
        pairMap.set(key, p);
      }
      const w = voterWeight(perVoter.get(v.voter_id));
      p.n++;
      if (v.result === 'a') (p.aWins++, (p.sa += w));
      else if (v.result === 'b') (p.bWins++, (p.sb += w));
      else (p.ties++, (p.sa += w / 2), (p.sb += w / 2), ties++);
    }
    const pairs = [...pairMap.values()];

    const games = pairs.map((p) => ({ i: index.get(p.a), j: index.get(p.b), si: p.sa, sj: p.sb }));
    const { theta, cov } = fitBT(items.length, games);
    const summary = summarize(theta, cov, items.length);

    const unknownCount = new Map();
    for (const r of db.prepare('SELECT voter_id, item_id FROM unknowns WHERE poll_id = ?').all(pollId))
      if (contributors.has(r.voter_id)) unknownCount.set(r.item_id, (unknownCount.get(r.item_id) || 0) + 1);
    const voters = contributors.size;

    const thetaById = new Map(items.map((it, i) => [it.id, theta[i]]));
    const pairCounts = new Map(pairs.map((p) => [pairKey(p.a, p.b), p.n]));
    const keyOf = new Map(items.map((it) => [it.id, it.key]));

    const rows = items
      .map((it, i) => ({
        key: it.key,
        name: it.name,
        short: it.short,
        native: it.native,
        color: it.color,
        image: it.image,
        ...summary[i],
        unknownRate: voters ? (unknownCount.get(it.id) || 0) / voters : 0,
        games: pairs.reduce((s, p) => s + (p.a === it.id || p.b === it.id ? p.n : 0), 0),
      }))
      .sort((x, y) => x.rank - y.rank);

    return {
      at: Date.now(),
      signature: signature(pollId),
      items,
      thetaById,
      pairCounts,
      totals: {
        votes: votes.length, voters, tieRate: votes.length ? ties / votes.length : 0,
        confidence: orderConfidence(theta, cov, items.length),
      },
      ranking: rows,
      pairs: pairs.map((p) => ({
        a: keyOf.get(p.a), b: keyOf.get(p.b), n: p.n, aWins: p.aWins, bWins: p.bWins, ties: p.ties,
      })),
      cycles: findCycles(items.map((it) => it.id), pairs).map((c) => c.map((id) => keyOf.get(id))),
    };
  }

  // The scheduler tolerates a slightly stale fit. Pass { fresh: true } (results pages) to
  // refit whenever a vote or "don't know" has landed since the cached one.
  function snapshot(pollId, { fresh = false } = {}) {
    const hit = cache.get(pollId);
    if (hit) {
      if (!fresh && Date.now() - hit.at < maxAgeMs) return hit;
      if (fresh && hit.signature === signature(pollId)) return hit;
    }
    const snap = compute(pollId);
    cache.set(pollId, snap);
    return snap;
  }

  // One voter's own model: their ranking, how sure we are of it, and when more answers stop helping.
  // Options they marked "don't know" are left out, so they can't drag the confidence down.
  const SETTLE_WINDOW = 8; // answers
  const SETTLE_GAIN = 0.03; // less than 3 points of confidence gained over the window
  function personalState(pollId, voterId) {
    const items = db.prepare('SELECT * FROM items WHERE poll_id = ? ORDER BY position').all(pollId);
    const rows = db
      .prepare('SELECT item_a AS a, item_b AS b, result FROM votes WHERE poll_id = ? AND voter_id = ? ORDER BY id')
      .all(pollId, voterId);
    const unknown = new Set(
      db.prepare('SELECT item_id FROM unknowns WHERE poll_id = ? AND voter_id = ?').all(pollId, voterId).map((r) => r.item_id),
    );
    const known = items.filter((it) => !unknown.has(it.id)).map((it) => it.id);
    const model = personalModel(known, rows);
    // A sorting-style estimate of the answers needed for a settled ranking: n * log2(n).
    // Measured in scripts/simulate-confidence.js: 8 items ~24, 12 ~43, 16 ~64, 24 ~110.
    const target = known.length > 1 ? Math.ceil(known.length * Math.log2(known.length)) : 0;
    let gain = null;
    if (rows.length >= SETTLE_WINDOW * 2) {
      gain = model.confidence - personalModel(known, rows.slice(0, -SETTLE_WINDOW)).confidence;
    }
    const settled = gain !== null && gain < SETTLE_GAIN && model.confidence >= 0.4;
    return { items, rows, unknown, known: known.length, model, votes: rows.length, confidence: model.confidence, target, settled };
  }

  // The voter's ranking as the model sees it (not a plain win count: beating strong options counts more).
  function personal(pollId, voterId, state = personalState(pollId, voterId)) {
    const ranking = state.items.map((it) => {
      const games = state.model.played.get(it.id) || 0;
      return {
        key: it.key, name: it.name, short: it.short, native: it.native, color: it.color, image: it.image,
        score: games ? (state.model.scores.get(it.id) ?? null) : null,
        games,
        unknown: state.unknown.has(it.id),
      };
    });
    ranking.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || y.games - x.games);
    return { votes: state.votes, confidence: state.confidence, target: state.target, settled: state.settled, ranking };
  }

  return { snapshot, personal, personalState };
}

