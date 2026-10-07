import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, seedPolls } from './db.js';
import { createStats } from './stats.js';
import { choosePair, pairKey } from './scheduler.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COOKIE = 'mp_voter';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 240;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

// Same-origin only: no third-party scripts, styles, fonts or frames.
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 4096) throw new HttpError(413, 'body_too_large');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export function createApp({
  dbPath = process.env.DB_PATH || join(ROOT, 'data', 'mass-poll.db'),
  pollsDir = join(ROOT, 'polls'),
  publicDir = join(ROOT, 'public'),
  salt = process.env.IP_SALT || 'mass-poll',
  trustProxy = process.env.TRUST_PROXY === '1',
} = {}) {
  const db = openDb(dbPath);
  seedPolls(db, pollsDir);
  const stats = createStats(db);
  const rate = new Map();

  const clientIp = (req) =>
    (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '';
  const ipHash = (req) => createHash('sha256').update(salt + clientIp(req)).digest('hex').slice(0, 24);

  function limited(hash) {
    const now = Date.now();
    const r = rate.get(hash);
    if (!r || now - r.start > RATE_WINDOW_MS) {
      rate.set(hash, { start: now, count: 1 });
      return false;
    }
    return ++r.count > RATE_MAX;
  }

  function voterFor(req, res) {
    const cookies = Object.fromEntries(
      (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2),
    );
    let id = cookies[COOKIE];
    if (!/^[0-9a-f]{32}$/.test(id || '') || !db.prepare('SELECT 1 FROM voters WHERE id = ?').get(id)) {
      id = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO voters (id, ip_hash, created_at) VALUES (?, ?, ?)').run(id, ipHash(req), Date.now());
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('set-cookie', `${COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
    }
    return id;
  }

  const publicItem = (it) => ({ key: it.key, name: it.name, short: it.short, native: it.native, color: it.color, image: it.image });

  function getPoll(slug) {
    const poll = db.prepare('SELECT * FROM polls WHERE slug = ?').get(slug);
    if (!poll) throw new HttpError(404, 'poll_not_found');
    poll.items = db.prepare('SELECT * FROM items WHERE poll_id = ? ORDER BY position').all(poll.id);
    return poll;
  }

  // How far along this voter is: votes, whether they count yet, and how sure we are of their own
  // ranking (confidence 0..1, the answers worth aiming for, and whether more answers stopped helping).
  function progress(poll, voterId, state = stats.personalState(poll.id, voterId)) {
    return {
      votes: state.votes,
      min: poll.min_votes,
      unlocked: state.votes >= poll.min_votes,
      confidence: state.confidence,
      target: state.target,
      settled: state.settled,
      // The voter's ranking so far, for the live table on the voting screen.
      ranking: stats
        .personal(poll.id, voterId, state)
        .ranking.map((r) => ({ key: r.key, score: r.score, games: r.games, unknown: r.unknown })),
    };
  }

  function unknownKeys(poll, voterId) {
    return db
      .prepare(
        `SELECT i.key FROM unknowns u JOIN items i ON i.id = u.item_id
         WHERE u.poll_id = ? AND u.voter_id = ? ORDER BY i.position`,
      )
      .all(poll.id, voterId)
      .map((r) => r.key);
  }

  function nextPair(poll, voterId, state) {
    const rows = db.prepare('SELECT item_a, item_b FROM votes WHERE poll_id = ? AND voter_id = ?').all(poll.id, voterId);
    const seen = new Set();
    const itemCounts = new Map();
    for (const r of rows) {
      seen.add(pairKey(r.item_a, r.item_b));
      itemCounts.set(r.item_a, (itemCounts.get(r.item_a) || 0) + 1);
      itemCounts.set(r.item_b, (itemCounts.get(r.item_b) || 0) + 1);
    }
    const unknown = new Set(
      db.prepare('SELECT item_id FROM unknowns WHERE poll_id = ? AND voter_id = ?').all(poll.id, voterId).map((r) => r.item_id),
    );
    const snap = stats.snapshot(poll.id);
    const pair = choosePair({
      itemIds: poll.items.map((i) => i.id),
      theta: snap.thetaById,
      pairCounts: snap.pairCounts,
      seen,
      itemCounts,
      unknown,
      totalVotes: snap.totals.votes,
      // Once they have met every option, ask what is least settled in THEIR OWN ranking.
      personal: state.votes >= Math.ceil(state.known / 2) ? { prob: state.model.prob } : null,
    });
    if (!pair) return null;
    const byId = new Map(poll.items.map((i) => [i.id, i]));
    return pair.map((id) => publicItem(byId.get(id)));
  }

  function recordVote(poll, voterId, body) {
    const byKey = new Map(poll.items.map((i) => [i.key, i]));
    const a = byKey.get(body.a);
    const b = byKey.get(body.b);
    if (!a || !b || a === b) throw new HttpError(400, 'bad_pair');
    if (body.winner !== 'tie' && body.winner !== body.a && body.winner !== body.b) throw new HttpError(400, 'bad_winner');
    const known = new Set(unknownKeys(poll, voterId));
    if (known.has(a.key) || known.has(b.key)) throw new HttpError(409, 'item_marked_unknown');
    const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
    const result = body.winner === 'tie' ? 'tie' : body.winner === lo.key ? 'a' : 'b';
    try {
      db.prepare(
        'INSERT INTO votes (poll_id, voter_id, item_a, item_b, result, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(poll.id, voterId, lo.id, hi.id, result, Date.now());
    } catch (e) {
      if (/UNIQUE/.test(String(e.message))) throw new HttpError(409, 'duplicate_vote');
      throw e;
    }
  }

  async function api(req, res, url) {
    if (limited(ipHash(req))) throw new HttpError(429, 'rate_limited');
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const method = req.method;

    if (parts[0] === 'polls' && parts.length === 1 && method === 'GET') {
      const polls = db.prepare('SELECT * FROM polls ORDER BY sort, id').all();
      return json(res, 200, {
        polls: polls.map((p) => ({
          slug: p.slug, title: p.title, question: p.question, description: p.description,
          items: db.prepare('SELECT COUNT(*) AS c FROM items WHERE poll_id = ?').get(p.id).c,
          preview: db
            .prepare('SELECT short, color, image FROM items WHERE poll_id = ? ORDER BY position LIMIT 6')
            .all(p.id),
          votes: db.prepare('SELECT COUNT(*) AS c FROM votes WHERE poll_id = ?').get(p.id).c,
        })),
      });
    }

    if (parts[0] !== 'polls' || !parts[1]) throw new HttpError(404, 'not_found');
    const poll = getPoll(parts[1]);
    const action = parts[2];

    if (!action && method === 'GET') {
      const voterId = voterFor(req, res);
      return json(res, 200, {
        poll: {
          slug: poll.slug, title: poll.title, question: poll.question, description: poll.description,
          footnote: poll.footnote, min: poll.min_votes,
          items: poll.items.map(publicItem),
        },
        progress: progress(poll, voterId),
        unknown: unknownKeys(poll, voterId),
      });
    }

    if (action === 'next' && method === 'GET') {
      const voterId = voterFor(req, res);
      const state = stats.personalState(poll.id, voterId);
      return json(res, 200, { pair: nextPair(poll, voterId, state), progress: progress(poll, voterId, state) });
    }

    if (action === 'votes' && method === 'POST') {
      const voterId = voterFor(req, res);
      recordVote(poll, voterId, await readJson(req));
      return json(res, 201, { progress: progress(poll, voterId) });
    }

    if (action === 'votes' && method === 'DELETE') {
      const voterId = voterFor(req, res);
      const body = await readJson(req);
      const a = poll.items.find((i) => i.key === body.a);
      const b = poll.items.find((i) => i.key === body.b);
      if (!a || !b || a === b) throw new HttpError(400, 'bad_pair');
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
      const { changes } = db
        .prepare('DELETE FROM votes WHERE poll_id = ? AND voter_id = ? AND item_a = ? AND item_b = ?')
        .run(poll.id, voterId, lo.id, hi.id);
      if (!changes) throw new HttpError(404, 'no_such_vote');
      return json(res, 200, { progress: progress(poll, voterId) });
    }

    // Wipe this voter's answers (and "don't know" marks) in this poll, and only theirs.
    if (action === 'reset' && method === 'POST') {
      const voterId = voterFor(req, res);
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM votes WHERE poll_id = ? AND voter_id = ?').run(poll.id, voterId);
        db.prepare('DELETE FROM unknowns WHERE poll_id = ? AND voter_id = ?').run(poll.id, voterId);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return json(res, 200, { progress: progress(poll, voterId) });
    }

    if (action === 'unknown' && method === 'DELETE') {
      const voterId = voterFor(req, res);
      const body = await readJson(req);
      const item = poll.items.find((i) => i.key === body.item);
      if (!item) throw new HttpError(400, 'bad_item');
      db.prepare('DELETE FROM unknowns WHERE poll_id = ? AND voter_id = ? AND item_id = ?').run(poll.id, voterId, item.id);
      return json(res, 200, { unknown: unknownKeys(poll, voterId) });
    }

    if (action === 'unknown' && method === 'POST') {
      const voterId = voterFor(req, res);
      const body = await readJson(req);
      const item = poll.items.find((i) => i.key === body.item);
      if (!item) throw new HttpError(400, 'bad_item');
      db.prepare('INSERT OR IGNORE INTO unknowns (poll_id, voter_id, item_id, created_at) VALUES (?, ?, ?, ?)').run(
        poll.id, voterId, item.id, Date.now(),
      );
      return json(res, 200, { unknown: unknownKeys(poll, voterId) });
    }

    if (action === 'results' && method === 'GET') {
      const voterId = voterFor(req, res);
      const state = stats.personalState(poll.id, voterId);
      const prog = progress(poll, voterId, state);
      if (!prog.unlocked) throw new HttpError(403, 'locked', { progress: prog });
      if (url.searchParams.get('scope') === 'me') {
        return json(res, 200, { scope: 'me', progress: prog, ...stats.personal(poll.id, voterId, state) });
      }
      const s = stats.snapshot(poll.id, { fresh: true });
      return json(res, 200, {
        scope: 'all',
        progress: prog,
        totals: s.totals,
        ranking: s.ranking,
        pairs: s.pairs,
        cycles: s.cycles,
      });
    }

    throw new HttpError(404, 'not_found');
  }

  async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = normalize(join(publicDir, rel));
    if (file !== publicDir && !file.startsWith(publicDir + sep)) throw new HttpError(403, 'forbidden');
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': url.pathname.startsWith('/img/') ? 'public, max-age=86400' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      throw new HttpError(404, 'not_found');
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') {
        db.prepare('SELECT 1').get();
        res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
        return res.end('ok');
      }
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) json(res, e.status, { error: e.code, ...e.extra });
      else {
        console.error(e);
        json(res, 500, { error: 'server_error' });
      }
    }
  });

  return { server, db, stats, close: () => new Promise((r) => server.close(() => (db.close(), r()))) };
}
