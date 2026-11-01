import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateRandomPair } from 'unsea';

import {
  createAccountRecord,
  openAccountRecord,
  updateAccountRecord,
  verifyAccountRecord,
} from '../records.js';
import { createRelayIdentityStore } from '../relay.js';

const NS = 'pigeon-chess';

test('an account record verifies, opens with its password, and not with another', async () => {
  const keys = await generateRandomPair();
  const record = await createAccountRecord({ alias: 'Dan', namespace: NS, keys, password: 'Correct-Horse-9' });
  assert.equal(await verifyAccountRecord(record), true);
  assert.equal((await openAccountRecord(record, 'Correct-Horse-9')).pub, keys.pub);
  await assert.rejects(openAccountRecord(record, 'Wrong-Horse-9'));
});

test('a changed record no longer verifies', async () => {
  const keys = await generateRandomPair();
  const record = await createAccountRecord({ alias: 'dan', namespace: NS, keys, password: 'pw' });
  const other = await generateRandomPair();
  assert.equal(await verifyAccountRecord({ ...record, alias: 'mallory' }), false);
  assert.equal(await verifyAccountRecord({ ...record, seq: 9 }), false);
  assert.equal(await verifyAccountRecord({ ...record, pub: other.pub }), false, 'someone else\'s key cannot claim it');
});

test('a relay keeps a name for the key that registered it, and keeps it across restarts', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pigeonidp-'));
  const store = await createRelayIdentityStore({ dataDir });
  const owner = await generateRandomPair();
  const first = await createAccountRecord({ alias: 'Dan', namespace: NS, keys: owner, password: 'pw-1' });
  assert.deepEqual(await store.handle({ action: 'idp-put', record: first }), { ok: true, stored: true });

  const thief = await generateRandomPair();
  const stolen = await createAccountRecord({ alias: 'dan', namespace: NS, keys: thief, password: 'mine' });
  assert.deepEqual(await store.handle({ action: 'idp-put', record: stolen }), { ok: false, error: 'taken' });
  assert.deepEqual(await store.handle({ action: 'idp-put', record: { ...first, alias: 'Dan2' } }), { ok: false, error: 'invalid' });

  const changed = await updateAccountRecord(first, { keys: owner, password: 'pw-2' });
  assert.deepEqual(await store.handle({ action: 'idp-put', record: changed }), { ok: true, stored: true });
  assert.deepEqual(await store.handle({ action: 'idp-put', record: first }), { ok: true, stored: false }, 'an older version does not roll it back');
  await store.flush();

  // A new store on the same folder is the relay after a restart.
  const restarted = await createRelayIdentityStore({ dataDir });
  const { record } = await restarted.handle({ action: 'idp-get', namespace: NS, alias: 'DAN' });
  assert.equal(record.seq, 2);
  assert.equal((await openAccountRecord(record, 'pw-2')).pub, owner.pub);
  assert.deepEqual(await restarted.handle({ action: 'idp-get', namespace: 'other-app', alias: 'dan' }), { ok: true, record: null });
  assert.equal(await restarted.handle({ action: 'something-else' }), null, 'requests for others are left alone');
});

// Stores wired to each other the way local relays are: POST /api/v1/idp.
async function federatedStores(count) {
  const stores = [];
  const fetchFor = (self) => async (url, init) => {
    const target = stores[Number(new URL(url).hostname.slice(1))];
    if (!target || target === self) throw new Error('unreachable');
    const answer = await target.store.handle(JSON.parse(init.body));
    return new Response(JSON.stringify(answer));
  };
  for (let i = 0; i < count; i++) {
    const entry = { up: true };
    entry.store = await createRelayIdentityStore({
      dataDir: await mkdtemp(path.join(os.tmpdir(), 'pigeonidp-fed-')),
      otherRelays: () => stores.map((s, j) => (s !== entry && s.up ? `http://r${j}` : null)).filter(Boolean),
      fetch: fetchFor(entry),
    });
    stores.push(entry);
  }
  return stores;
}

test('local relays share accounts: sent on when stored, found when missing, taken everywhere', async () => {
  const [a, b, c] = await federatedStores(3);
  c.up = false; // c is offline when the account is made
  const owner = await generateRandomPair();
  const record = await createAccountRecord({ alias: 'Dan', namespace: NS, keys: owner, password: 'pw' });
  assert.deepEqual(await a.store.handle({ action: 'idp-put', record }), { ok: true, stored: true });
  await a.store.flush();
  assert.equal((await b.store.handle({ action: 'idp-get', namespace: NS, alias: 'dan', from_relay: true })).record.pub, owner.pub, 'b was sent it');
  assert.equal((await c.store.handle({ action: 'idp-get', namespace: NS, alias: 'dan', from_relay: true })).record, null, 'c was offline');

  c.up = true;
  assert.equal((await c.store.handle({ action: 'idp-get', namespace: NS, alias: 'DAN' })).record.pub, owner.pub, 'c asks the others');
  assert.equal(c.store.size(), 1, 'and keeps it');

  const thief = await generateRandomPair();
  const [d] = await federatedStores(1);
  const stolen = await createAccountRecord({ alias: 'dan', namespace: NS, keys: thief, password: 'x' });
  assert.deepEqual(await c.store.handle({ action: 'idp-put', record: stolen }), { ok: false, error: 'taken' });
  assert.deepEqual(await d.store.handle({ action: 'idp-put', record: stolen }), { ok: true, stored: true }, 'a relay not federated with them knows nothing of it');
});

test('a name new here is checked with the other relays before it is taken here', async () => {
  const [a, b] = await federatedStores(2);
  b.up = false;
  const owner = await generateRandomPair();
  await a.store.handle({ action: 'idp-put', record: await createAccountRecord({ alias: 'eve', namespace: NS, keys: owner, password: 'pw' }) });
  await a.store.flush();
  b.up = true;
  const thief = await generateRandomPair();
  const stolen = await createAccountRecord({ alias: 'Eve', namespace: NS, keys: thief, password: 'x' });
  assert.deepEqual(await b.store.handle({ action: 'idp-put', record: stolen }), { ok: false, error: 'taken' });
  assert.equal((await b.store.handle({ action: 'idp-get', namespace: NS, alias: 'eve', from_relay: true })).record.pub, owner.pub);
});
