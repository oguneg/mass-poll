// Dev tool: fill a database with synthetic voters so the results page has something to show.
//   npm run fake-votes -- [voters=300] [slug=sweden-parties]
// Voters get noisy personal tastes around a shared "true" ordering, use the real scheduler,
// sometimes tie, and sometimes mark an item unknown.

import { openDb, seedPolls } from '../server/db.js';
import { createStats } from '../server/stats.js';
import { choosePair, pairKey } from '../server/scheduler.js';
import { mulberry32, sigmoid } from '../server/rating.js';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nVoters = Number(process.argv[2] || 300);
const slug = process.argv[3] || 'sweden-parties';
const db = openDb(process.env.DB_PATH || join(root, 'data', 'mass-poll.db'));
seedPolls(db, join(root, 'polls'));
const stats = createStats(db, { maxAgeMs: 0 });
const poll = db.prepare('SELECT * FROM polls WHERE slug = ?').get(slug);
const items = db.prepare('SELECT * FROM items WHERE poll_id = ? ORDER BY position').all(poll.id);
const rng = mulberry32(42);
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
const shared = items.map(() => gauss() * 0.6);

let castVotes = 0;
for (let v = 0; v < nVoters; v++) {
  const voterId = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO voters (id, ip_hash, created_at) VALUES (?, ?, ?)').run(voterId, 'fake', Date.now());
  const taste = shared.map((s) => s + gauss() * 0.8);
  const unknown = new Set();
  const seen = new Set();
  const itemCounts = new Map();
  const quota = 10 + Math.floor(rng() * rng() * 18);
  for (let k = 0; k < quota; k++) {
    const snap = stats.snapshot(poll.id);
    const pair = choosePair({
      itemIds: items.map((i) => i.id), theta: snap.thetaById, pairCounts: snap.pairCounts,
      seen, itemCounts, unknown, totalVotes: snap.totals.votes, rng,
    });
    if (!pair) break;
    const idx = pair.map((id) => items.findIndex((i) => i.id === id));
    if (rng() < 0.05) {
      const pick = pair[Math.floor(rng() * 2)];
      unknown.add(pick);
      db.prepare('INSERT OR IGNORE INTO unknowns VALUES (?, ?, ?, ?)').run(poll.id, voterId, pick, Date.now());
      k--;
      continue;
    }
    const d = taste[idx[0]] - taste[idx[1]];
    const tie = rng() < 0.12 * (1 - Math.min(1, Math.abs(d)));
    const firstWins = rng() < sigmoid(d);
    const [lo, hi] = pair[0] < pair[1] ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const winnerId = firstWins ? pair[0] : pair[1];
    const result = tie ? 'tie' : winnerId === lo ? 'a' : 'b';
    db.prepare('INSERT INTO votes (poll_id, voter_id, item_a, item_b, result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(poll.id, voterId, lo, hi, result, Date.now());
    seen.add(pairKey(lo, hi));
    for (const id of pair) itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
    castVotes++;
  }
}
console.log(`inserted ${castVotes} votes from ${nVoters} fake voters into "${slug}"`);
console.log('true order (shared taste):', items.map((it, i) => [it.short, shared[i]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]).join(' > '));
console.log('fitted order:             ', stats.snapshot(poll.id).ranking.map((r) => r.short).join(' > '));
