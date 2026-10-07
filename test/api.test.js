import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';

let app;
let base;

before(async () => {
  app = createApp({ dbPath: ':memory:' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => app.close());

// A tiny cookie-aware client: each instance is one voter.
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

const SLUG = '/api/polls/sweden-parties';

test('the Sweden poll is seeded with eight parties', async () => {
  const c = client();
  const list = await c('GET', '/api/polls');
  assert.equal(list.body.polls[0].slug, 'sweden-parties');
  const poll = await c('GET', SLUG);
  assert.equal(poll.body.poll.items.length, 8);
  assert.ok(poll.body.poll.items.find((i) => i.key === 'sd').image.endsWith('sd.svg'));
  assert.equal(poll.body.poll.items.find((i) => i.key === 's').image, '');
  assert.deepEqual(list.body.polls.map((p) => p.slug), ['sweden-parties', 'breaking-bad-universe', 'pizza-toppings', 'programming-languages', 'pokemon-gen1', 'aoe2-civilizations', 'lol-champions']);
  assert.equal(list.body.polls[1].items, 16);
  assert.equal(list.body.polls[0].preview.length, 6);
  assert.deepEqual(poll.body.progress, { votes: 0, min: 10, unlocked: false, confidence: 0, target: 24, settled: false, ranking: poll.body.progress.ranking });
});

test('voting flow: ten votes unlock results, duplicates and unknowns are rejected', async () => {
  const c = client();
  await c('GET', SLUG);
  const first = (await c('GET', `${SLUG}/next`)).body.pair;
  assert.equal(first.length, 2);

  // Mark one party as unknown: it must never be served again and cannot be voted on.
  const unknownKey = first[0].key;
  await c('POST', `${SLUG}/unknown`, { item: unknownKey });
  const bad = await c('POST', `${SLUG}/votes`, { a: first[0].key, b: first[1].key, winner: first[1].key });
  assert.equal(bad.status, 409);

  assert.equal((await c('GET', `${SLUG}/results`)).status, 403);

  let last;
  for (let k = 0; k < 10; k++) {
    const { pair } = (await c('GET', `${SLUG}/next`)).body;
    assert.ok(pair.every((p) => p.key !== unknownKey));
    const winner = k % 4 === 3 ? 'tie' : pair[0].key;
    last = await c('POST', `${SLUG}/votes`, { a: pair[0].key, b: pair[1].key, winner });
    assert.equal(last.status, 201);
    if (k === 0) {
      const dup = await c('POST', `${SLUG}/votes`, { a: pair[1].key, b: pair[0].key, winner });
      assert.equal(dup.status, 409);
    }
  }
  assert.equal(last.body.progress.unlocked, true);

  const all = await c('GET', `${SLUG}/results`);
  assert.equal(all.status, 200);
  assert.equal(all.body.ranking.length, 8);
  assert.equal(all.body.totals.votes, 10);
  assert.deepEqual(all.body.ranking.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8]);

  const me = await c('GET', `${SLUG}/results?scope=me`);
  assert.equal(me.body.votes, 10);
  assert.ok(me.body.ranking.find((r) => r.key === unknownKey).unknown);
});

test('rejects malformed votes', async () => {
  const c = client();
  assert.equal((await c('POST', `${SLUG}/votes`, { a: 'x', b: 's', winner: 's' })).status, 400);
  assert.equal((await c('POST', `${SLUG}/votes`, { a: 's', b: 'sd', winner: 'm' })).status, 400);
  assert.equal((await c('GET', '/api/polls/nope')).status, 404);
  assert.equal((await c('GET', '/..%2f..%2fpackage.json')).status, 403);
});

test('votes only count toward the crowd ranking once a voter reaches the baseline', async () => {
  const insider = client();
  await insider('GET', SLUG);
  for (let k = 0; k < 10; k++) {
    const { pair } = (await insider('GET', `${SLUG}/next`)).body;
    await insider('POST', `${SLUG}/votes`, { a: pair[0].key, b: pair[1].key, winner: pair[0].key });
  }
  const before = (await insider('GET', `${SLUG}/results`)).body.totals;

  const newcomer = client();
  await newcomer('GET', SLUG);
  for (let k = 0; k < 3; k++) {
    const { pair } = (await newcomer('GET', `${SLUG}/next`)).body;
    await newcomer('POST', `${SLUG}/votes`, { a: pair[0].key, b: pair[1].key, winner: pair[1].key });
  }
  assert.deepEqual((await insider('GET', `${SLUG}/results`)).body.totals, before);
});

test('every poll image referenced in polls/ exists in public/', async () => {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  for (const f of readdirSync('polls').filter((n) => n.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(`polls/${f}`, 'utf8'));
    for (const it of p.items) if (it.image) assert.ok(existsSync(`public${it.image}`), `${p.slug}/${it.key}: ${it.image}`);
  }
});

test('a voter can undo their last vote and a "don\'t know"', async () => {
  const c = client();
  await c('GET', SLUG);
  const { pair } = (await c('GET', `${SLUG}/next`)).body;
  const body = { a: pair[0].key, b: pair[1].key, winner: pair[0].key };
  assert.equal((await c('POST', `${SLUG}/votes`, body)).body.progress.votes, 1);
  assert.equal((await c('DELETE', `${SLUG}/votes`, { a: pair[1].key, b: pair[0].key })).body.progress.votes, 0);
  assert.equal((await c('DELETE', `${SLUG}/votes`, { a: pair[0].key, b: pair[1].key })).status, 404);
  // the same pair can be answered again after undoing
  assert.equal((await c('POST', `${SLUG}/votes`, { ...body, winner: pair[1].key })).status, 201);

  await c('POST', `${SLUG}/unknown`, { item: pair[0].key });
  assert.deepEqual((await c('GET', SLUG)).body.unknown, [pair[0].key]);
  await c('DELETE', `${SLUG}/unknown`, { item: pair[0].key });
  assert.deepEqual((await c('GET', SLUG)).body.unknown, []);
});

test('a voter can reset their own votes without touching anyone else\'s', async () => {
  const me = client();
  const other = client();
  for (const c of [me, other]) {
    await c('GET', SLUG);
    for (let k = 0; k < 3; k++) {
      const { pair } = (await c('GET', `${SLUG}/next`)).body;
      await c('POST', `${SLUG}/votes`, { a: pair[0].key, b: pair[1].key, winner: pair[0].key });
    }
  }
  const { pair } = (await me('GET', `${SLUG}/next`)).body;
  await me('POST', `${SLUG}/unknown`, { item: pair[0].key });

  const res = await me('POST', `${SLUG}/reset`);
  assert.equal(res.status, 200);
  assert.equal(res.body.progress.votes, 0);
  assert.deepEqual((await me('GET', SLUG)).body.unknown, []);
  assert.equal((await other('GET', SLUG)).body.progress.votes, 3);
});
