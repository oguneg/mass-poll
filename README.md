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

Needs a Linux VPS with Node >= 22.13, a DNS `A` record `poll.ogun.se` pointing at the VPS, and Caddy (or nginx).

```bash
# 1. user, code, database directory
sudo useradd --system --home /opt/mass-poll --shell /usr/sbin/nologin masspoll
sudo git clone <your-repo-url> /opt/mass-poll        # or rsync the project there
sudo mkdir -p /var/lib/mass-poll && sudo chown masspoll:masspoll /var/lib/mass-poll

# 2. config: IP_SALT must be a long random string (the server refuses to start in production without it)
sudo cp /opt/mass-poll/deploy/mass-poll.env.example /etc/mass-poll.env
sudo nano /etc/mass-poll.env        # set IP_SALT=$(openssl rand -hex 32)
sudo chmod 600 /etc/mass-poll.env

# 3. service
sudo cp /opt/mass-poll/deploy/mass-poll.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mass-poll
curl -s http://127.0.0.1:3000/healthz        # prints: ok

# 4. HTTPS + proxy (Caddy fetches the certificate itself)
sudo cp /opt/mass-poll/deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

- **Update:** `cd /opt/mass-poll && sudo git pull && sudo systemctl restart mass-poll` (new polls in `polls/` load on restart).
- **Backup:** `DB_PATH=/var/lib/mass-poll/mass-poll.db npm run backup -- /var/backups/mass-poll` from cron; keeps the newest 14.
- **nginx instead of Caddy:** see `deploy/nginx-poll.ogun.se.conf`. `TRUST_PROXY=1` trusts `X-Forwarded-For`, so only use it behind a proxy you control.

## Not yet (planned)

Creator flow, groups and scoped results, best-of-4 and best/worst formats for big lists,
LLM commentary on the results, accounts.
