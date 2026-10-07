# Mass Poll

League-style mass polling. Instead of picking one favourite, each voter answers a run of quick
head-to-head questions. Every answer feeds a Bradley-Terry model that ranks the options with
honest uncertainty, so you get tiers and "too close to call" instead of one noisy winner.

v1: public polls defined in `polls/*.json`, anonymous voters (cookie), results for everyone and
for you. No npm dependencies; needs Node >= 22.13 (uses the built-in `node:sqlite`).

## Run

```bash
npm start            # http://127.0.0.1:3000, data in data/mass-poll.db
npm test
npm run fake-votes -- 400   # fill a DB with synthetic voters (uses DB_PATH, default data/mass-poll.db)
```

For local development with throwaway data, put `DB_PATH=data/dev.db` in `.env.dev` and use
`node --env-file=.env.dev server/index.js` (this is what `.claude/launch.json` does).

## How it works

- **Voting:** pair, "tie" (known both, can't separate) or "don't know" (per item; never a preference
  signal, and the item stops appearing for that voter). 10 votes unlock results (`min_votes`).
- **Scheduler** (`server/scheduler.js`): each voter never sees a pair twice and meets every item evenly;
  globally, under-sampled pairs first, then pairs the model thinks are close.
- **Rating** (`server/rating.js`): Bradley-Terry with a weak prior, Newton fit; ties are half a win each.
  Score = average chance to beat another option; 90% intervals for score and rank come from posterior draws.
  A voter's weight is capped (`1/sqrt(n)` beyond 20 votes) so heavy voters can't dominate.
- **Confidence** (`server/personal.js`, `server/rating.js`): each voter's own answers are fitted separately.
  Confidence = the average chance that a pair of options is in the right order, rescaled so 0% means coin flips
  and 100% means every pair is certain. It is shown live while voting, with a live table of your ranking so far.
  After the first answers, the scheduler asks the pairs that are most unsettled in *your own* ranking.
  `scripts/simulate-confidence.js` checks the number against synthetic voters with a known true order: the
  claimed confidence stays at or below the real accuracy, and the curve flattens at about n·log2(n) answers
  (8 options ~24, 12 ~43, 16 ~64, 24 ~110). A ranking is called "settled" when the last 8 answers added under 3 points.
- **Results** (`server/stats.js`): ranking, head-to-head matrix, rock-paper-scissors cycles, per-item
  "don't know" rate, and each voter's own ranking.

## Polls and images

Polls live in `polls/*.json` (`sort` orders the home page). An item has `key`, `name`, `short` (initials or an
emoji), `native` (subtitle), `color`, and an optional `image` (path under `public/`, shown as a logo tile; items
without one get a colour tile). A poll can carry a `footnote` (used for image credits).

Only use images you have the rights to. The Swedish party logos are public domain on Wikimedia Commons (Social
Democrats and Greens aren't freely licensed, so they use colour tiles). Character art from TV shows is copyrighted,
so the Breaking Bad poll uses colour tiles; drop your own licensed files in `public/img/<poll>/` and set `image`.

## Add a poll

Drop a JSON file in `polls/` (see `sweden-parties.json`) and restart. Items are matched by `key` and
never deleted, so existing votes stay valid; use stable keys.

## Going live (poll.ogun.se)

Same setup as the other projects on the VPS: one Docker container behind the shared Caddy proxy in `~/proxy`
(HTTPS is automatic; the app declares its domain with labels in `docker-compose.yml`).

1. **DNS:** an `A` record `poll.ogun.se` pointing at the VPS.
2. **On the VPS** (`ssh debian@<vps>`):
   ```bash
   git clone https://github.com/oguneg/mass-poll.git ~/mass-poll && cd ~/mass-poll
   cp .env.example .env     # set DOMAIN=poll.ogun.se and IP_SALT=<output of: openssl rand -hex 32>
   docker compose up -d --build
   docker compose logs -f app
   ```
3. **Check:** `https://poll.ogun.se/healthz` prints `ok`.

- **Update:** `~/mass-poll/deploy/update.sh` pulls, rebuilds, swaps the container and waits until it is healthy. New polls in `polls/` go live with the same update.
- **Data:** the SQLite database lives in the `poll-data` Docker volume and survives rebuilds.
- **Backup:** `mkdir -p ~/backups && docker run --rm -v mass-poll_poll-data:/data:ro -v ~/backups:/out node:22-bookworm-slim sh -c 'cp /data/mass-poll.db* /out/'` copies the database (and its WAL files). `npm run backup` (`scripts/backup.js`) makes a consistent snapshot when run where the code and database live.
- `IP_SALT` is required in production: the server refuses to start without it.

## Not yet (planned)

Creator flow, groups and scoped results, best-of-4 and best/worst formats for big lists,
LLM commentary on the results, accounts.
