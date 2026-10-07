// Consistent online backup of the live database (safe while the server is running).
//   node --disable-warning=ExperimentalWarning scripts/backup.js [outDir]
// Run it from cron/systemd timer; it keeps the newest 14 backups.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dbPath = process.env.DB_PATH || 'data/mass-poll.db';
const outDir = process.argv[2] || process.env.BACKUP_DIR || 'backups';
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = join(outDir, `mass-poll-${stamp}.db`);
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();

const old = readdirSync(outDir).filter((f) => /^mass-poll-.*\.db$/.test(f)).sort().slice(0, -14);
for (const f of old) rmSync(join(outDir, f));
console.log(`backup written: ${target}${old.length ? ` (pruned ${old.length})` : ''}`);
