/**
 * The account store a relay keeps (Node only).
 *
 * A freertc node relay loads this to be a PigeonIdP server for the browsers
 * connected to it. It keeps account records (records.js) in a file in the
 * relay's data folder, so they survive restarts, and answers two requests:
 *
 *   { action: 'idp-get', namespace, alias }  -> { ok: true, record: <record or null> }
 *   { action: 'idp-put', record }            -> { ok: true } | { ok: false, error }
 *
 * A put is stored only when the record verifies and the name is free or
 * already belongs to the record's key (with a higher sequence number). The
 * relay never sees a password or a private key: records carry the keys
 * encrypted with the account's password.
 *
 * Other relays (optional): give `otherRelays`, a function returning the HTTP
 * base URLs of the other local relays this one federates with, and the store
 * shares accounts with them through their POST /api/v1/idp:
 *   - a record stored here is sent on to each of them;
 *   - a name nobody here has registered is checked with them first, so a name
 *     taken on another relay is taken here too;
 *   - a name not found here is asked of them, and kept here once found.
 * Requests that came from another relay carry from_relay: true and are
 * answered from this store alone, so nothing is passed along twice.
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { aliasKey, compareAccountRecords, isPostQuantumRecord, verifyAccountRecord } from './records.js';

const FILE_NAME = 'identities.json';
const DEFAULT_MAX_RECORDS = 50_000;
const ASK_TIMEOUT_MS = 3000;

export const RELAY_IDP_PATH = '/api/v1/idp';

export async function createRelayIdentityStore({
  dataDir,
  maxRecords = DEFAULT_MAX_RECORDS,
  log = () => {},
  otherRelays = null,
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
  askTimeoutMs = ASK_TIMEOUT_MS,
} = {}) {
  if (!dataDir) throw new Error('dataDir is required');
  const file = path.join(dataDir, FILE_NAME);
  const records = new Map(); // `${namespace}\0${aliasKey}` -> record

  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    for (const record of Array.isArray(saved?.records) ? saved.records : []) {
      // Checked again on load: a file edited by hand is not trusted either.
      if (await verifyAccountRecord(record)) records.set(keyOf(record.namespace, record.alias), record);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') log(`could not read ${file}: ${error?.message || error}`);
  }

  // Writes are serialized and atomic (a temporary file renamed over the old
  // one), so a crash mid-write leaves the previous file intact.
  let writing = Promise.resolve();
  const save = () => {
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(dataDir, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, records: [...records.values()] }));
      await rename(temporary, file);
    });
    return writing;
  };

  // Sends to other relays still under way (flush waits for them too).
  const sending = new Set();
  const track = (work) => {
    const done = work.catch(() => {}).finally(() => sending.delete(done));
    sending.add(done);
    return done;
  };

  async function relayBases() {
    if (typeof otherRelays !== 'function') return [];
    try {
      const bases = await otherRelays();
      return [...new Set((Array.isArray(bases) ? bases : []).filter((b) => typeof b === 'string' && b))];
    } catch {
      return [];
    }
  }

  async function ask(base, body) {
    const response = await fetchImpl(`${base.replace(/\/$/, '')}${RELAY_IDP_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, from_relay: true }),
      signal: AbortSignal.timeout(askTimeoutMs),
    });
    const text = await response.text();
    return response.ok ? JSON.parse(text) : null;
  }

  /**
   * What the other relays hold for a name:
   *   record  the post-quantum (version 2) record to adopt, when they agree on
   *           one owner (one pub and qpub); its newest version
   *   owners  the distinct keys holding it there (any version), so a new
   *           name is refused when anyone holds it elsewhere
   * Version 1 records are never adopted from another relay: their P-256
   * signature is all that vouches for them, so they would let someone who can
   * forge it plant an older record over an upgraded one. And when relays
   * disagree on a post-quantum owner, none is adopted: nothing in the records
   * says which came first that the author could not have set.
   */
  async function askOthers(namespace, alias) {
    const bases = await relayBases();
    if (bases.length === 0) return { record: null, owners: [] };
    const answers = await Promise.allSettled(bases.map((base) => ask(base, { action: 'idp-get', namespace, alias })));
    const owners = new Map(); // `${pub}|${qpub}` -> newest record of that owner
    for (const answer of answers) {
      const record = answer.status === 'fulfilled' ? answer.value?.record : null;
      if (!record || record.namespace !== namespace || aliasKey(record.alias) !== aliasKey(alias)) continue;
      if (!await verifyAccountRecord(record)) continue;
      const owner = `${record.pub}|${isPostQuantumRecord(record) ? record.qpub : ''}`;
      const held = owners.get(owner);
      if (!held || record.seq > held.seq) owners.set(owner, record);
    }
    const quantum = [...owners.values()].filter(isPostQuantumRecord);
    return { record: quantum.length === 1 ? quantum[0] : null, owners: [...owners.values()] };
  }

  async function keep(record) {
    const key = keyOf(record.namespace, record.alias);
    if (compareAccountRecords(records.get(key), record) !== 'accept') return false;
    if (!records.has(key) && records.size >= maxRecords) return false;
    records.set(key, record);
    await save();
    return true;
  }

  function sendOn(record) {
    track(relayBases().then((bases) => Promise.allSettled(bases.map((base) => ask(base, { action: 'idp-put', record })))));
  }

  async function handle(body) {
    const fromRelay = body?.from_relay === true;
    switch (body?.action) {
      case 'idp-get': {
        const namespace = String(body.namespace ?? '');
        const alias = String(body.alias ?? '');
        if (!namespace || !aliasKey(alias)) return { ok: false, error: 'namespace and alias are required' };
        let record = records.get(keyOf(namespace, alias)) ?? null;
        if (!record && !fromRelay) {
          record = (await askOthers(namespace, alias)).record;
          if (record) await keep(record);
        }
        return { ok: true, record };
      }
      case 'idp-put': {
        const record = body.record;
        if (!await verifyAccountRecord(record)) return { ok: false, error: 'invalid' };
        const key = keyOf(record.namespace, record.alias);
        // New names are post-quantum from the start, from browsers and other
        // relays alike (anyone can claim to be a relay); version 1 records stay
        // only where they were already kept, until their accounts upgrade.
        if (!records.has(key) && !isPostQuantumRecord(record)) return { ok: false, error: 'upgrade' };
        // A name new to this relay may be registered on another one already:
        // checked whoever sends it. Requests between relays never ask
        // further, so this does not go round.
        if (!records.has(key)) {
          const elsewhere = await askOthers(record.namespace, record.alias);
          if (elsewhere.owners.some((other) => other.pub !== record.pub
            || (isPostQuantumRecord(other) && other.qpub !== record.qpub))) {
            if (elsewhere.record) await keep(elsewhere.record);
            return { ok: false, error: 'taken' };
          }
          // The same owner elsewhere: keep its newest post-quantum version too.
          if (elsewhere.record) await keep(elsewhere.record);
        }
        const verdict = compareAccountRecords(records.get(key), record);
        if (verdict === 'taken') return { ok: false, error: 'taken' };
        if (verdict === 'stale') return { ok: true, stored: false };
        if (!records.has(key) && records.size >= maxRecords) return { ok: false, error: 'full' };
        records.set(key, record);
        await save();
        if (!fromRelay) sendOn(record);
        return { ok: true, stored: true };
      }
      default:
        return null; // not ours
    }
  }

  return {
    file,
    handle,
    size: () => records.size,
    /** Let pending writes finish (for a clean shutdown). */
    flush: async () => { await Promise.all([...sending]); await writing; },
  };
}

function keyOf(namespace, alias) {
  return `${namespace}\u0000${aliasKey(alias)}`;
}
