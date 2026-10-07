import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  question    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  min_votes   INTEGER NOT NULL DEFAULT 10,
  footnote    TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id       INTEGER PRIMARY KEY,
  poll_id  INTEGER NOT NULL REFERENCES polls(id),
  key      TEXT NOT NULL,
  name     TEXT NOT NULL,
  short    TEXT NOT NULL DEFAULT '',
  native   TEXT NOT NULL DEFAULT '',
  color    TEXT NOT NULL DEFAULT '#888888',
  image    TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (poll_id, key)
);
CREATE TABLE IF NOT EXISTS voters (
  id         TEXT PRIMARY KEY,
  ip_hash    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- One row per answered matchup. item_a < item_b; result is relative to that order:
-- 'a' = item_a won, 'b' = item_b won, 'tie' = known both, can't separate them.
CREATE TABLE IF NOT EXISTS votes (
  id         INTEGER PRIMARY KEY,
  poll_id    INTEGER NOT NULL REFERENCES polls(id),
  voter_id   TEXT NOT NULL REFERENCES voters(id),
  item_a     INTEGER NOT NULL REFERENCES items(id),
  item_b     INTEGER NOT NULL REFERENCES items(id),
  result     TEXT NOT NULL CHECK (result IN ('a','b','tie')),
  created_at INTEGER NOT NULL,
  UNIQUE (poll_id, voter_id, item_a, item_b)
);
CREATE INDEX IF NOT EXISTS votes_poll ON votes (poll_id);
-- "I don't know this one": a familiarity signal, never a preference signal.
CREATE TABLE IF NOT EXISTS unknowns (
  poll_id    INTEGER NOT NULL REFERENCES polls(id),
  voter_id   TEXT NOT NULL REFERENCES voters(id),
  item_id    INTEGER NOT NULL REFERENCES items(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, voter_id, item_id)
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  // Databases created before these columns existed.
  addColumn(db, 'polls', 'footnote', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'polls', 'sort', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'items', 'image', "TEXT NOT NULL DEFAULT ''");
  return db;
}

function addColumn(db, table, column, ddl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

// Poll definitions live in polls/*.json and are upserted at startup.
// Items are matched by key, never deleted, so existing votes stay valid.
export function seedPolls(db, dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  db.exec('BEGIN');
  try {
    for (const file of files) {
      const p = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      db.prepare(
        `INSERT INTO polls (slug, title, question, description, min_votes, footnote, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (slug) DO UPDATE SET title = excluded.title, question = excluded.question,
           description = excluded.description, min_votes = excluded.min_votes,
           footnote = excluded.footnote, sort = excluded.sort`,
      ).run(p.slug, p.title, p.question, p.description ?? '', p.min_votes ?? 10, p.footnote ?? '', p.sort ?? 0, Date.now());
      const { id } = db.prepare('SELECT id FROM polls WHERE slug = ?').get(p.slug);
      p.items.forEach((it, position) => {
        db.prepare(
          `INSERT INTO items (poll_id, key, name, short, native, color, image, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (poll_id, key) DO UPDATE SET name = excluded.name, short = excluded.short,
             native = excluded.native, color = excluded.color, image = excluded.image,
             position = excluded.position`,
        ).run(id, it.key, it.name, it.short ?? '', it.native ?? '', it.color ?? '#888888', it.image ?? '', position);
      });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
