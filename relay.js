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
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { aliasKey, compareAccountRecords, verifyAccountRecord } from './records.js';

const FILE_NAME = 'identities.json';
const DEFAULT_MAX_RECORDS = 50_000;

export async function createRelayIdentityStore({ dataDir, maxRecords = DEFAULT_MAX_RECORDS, log = () => {} } = {}) {
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

  async function handle(body) {
    switch (body?.action) {
      case 'idp-get': {
        const namespace = String(body.namespace ?? '');
        const alias = String(body.alias ?? '');
        if (!namespace || !aliasKey(alias)) return { ok: false, error: 'namespace and alias are required' };
        return { ok: true, record: records.get(keyOf(namespace, alias)) ?? null };
      }
      case 'idp-put': {
        const record = body.record;
        if (!await verifyAccountRecord(record)) return { ok: false, error: 'invalid' };
        const key = keyOf(record.namespace, record.alias);
        const verdict = compareAccountRecords(records.get(key), record);
        if (verdict === 'taken') return { ok: false, error: 'taken' };
        if (verdict === 'stale') return { ok: true, stored: false };
        if (!records.has(key) && records.size >= maxRecords) return { ok: false, error: 'full' };
        records.set(key, record);
        await save();
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
    flush: () => writing,
  };
}

function keyOf(namespace, alias) {
  return `${namespace}\u0000${aliasKey(alias)}`;
}
