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
