/**
 * Account records: the part of an identity that lives off the device.
 *
 * A record holds an account's name, its public keys, and its private keys
 * encrypted with the account's password. It is signed with the account's own
 * key.
 *
 * Version 2 (post-quantum): the account has ML-DSA-65 and ML-KEM-768 keys
 * (qpub, kpub) next to its P-256 ones, the record carries a hybrid
 * ECDSA + ML-DSA signature (unsea 3), and the keys are sealed with Argon2id.
 * Version 1 (P-256 only, PBKDF2) records still verify and open. An account
 * moves to version 2 by publishing a version 2 record with the same pub,
 * signed by both keys (upgradeAccountRecord); from then on its name only
 * takes version 2 records with that same qpub, so it cannot be downgraded or
 * handed to another post-quantum key. Anyone holding a record can check it, and a store
 * (a relay, see relay.js) keeps a name for the key that registered it first:
 * an update is accepted only when it is signed by that same key and carries a
 * higher sequence number. So a name cannot be taken over by registering it
 * again, and a record cannot be forged or rolled back.
 *
 * Works in browsers and in Node (Web Crypto and UnSEA).
 */

import {
  decryptWithPassword,
  encryptWithPassword,
  hasPostQuantumKeys,
  signMessage,
  upgradePair,
  verifyMessage,
} from 'unsea';

export const RECORD_VERSION = 2;
const LEGACY_RECORD_VERSION = 1;
const PBKDF2_ITERATIONS = 100_000;
const MAX_ALIAS_LENGTH = 64;
const MAX_NAMESPACE_LENGTH = 64;
export const MAX_RECORD_BYTES = 16 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const b64 = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = '';
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(text);
};
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The form a name is looked up by: trimmed and lower-case, so "Dan" and "dan" are one account. */
export function aliasKey(alias) {
  return String(alias ?? '').trim().toLowerCase();
}

export function validAlias(alias) {
  const key = aliasKey(alias);
  return key.length > 0 && key.length <= MAX_ALIAS_LENGTH && !/[\u0000-\u001f]/.test(key);
}

function validNamespace(namespace) {
  const text = String(namespace ?? '');
  return text.length > 0 && text.length <= MAX_NAMESPACE_LENGTH && !/[\u0000-\u001f]/.test(text);
}

/** The exact bytes that are signed: every field but the signature, in a fixed order. */
export function signedText(record) {
  const keys = record.keys || {};
  if (record.v === RECORD_VERSION) {
    return JSON.stringify([
      'pigeonidp-account',
      record.v,
      record.namespace,
      aliasKey(record.alias),
      record.alias,
      record.pub,
      record.qpub,
      record.epub,
      record.kpub,
      [keys.kdf, keys.m, keys.t, keys.p, keys.salt, keys.iv, keys.data],
      record.created,
      record.updated,
      record.seq,
    ]);
  }
  return JSON.stringify([
    'pigeonidp-account',
    record.v,
    record.namespace,
    aliasKey(record.alias),
    record.alias,
    record.pub,
    record.epub,
    [keys.salt, keys.iv, keys.data],
    record.created,
    record.updated,
    record.seq,
  ]);
}

async function passwordKey(password, salt, usage) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Encrypt a key pair with a password, in the form chess.peer.ooo has always stored. */
export async function encryptKeys(keys, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, 'encrypt');
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(keys)));
  return { encrypted: true, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

/** The key pair inside an encrypted blob; throws on a wrong password. */
export async function decryptKeys(blob, password) {
  const key = await passwordKey(password, unb64(blob.salt), 'decrypt');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.data));
  return JSON.parse(decoder.decode(plain));
}

async function sign(record, keys) {
  // Version 2 records are signed with the whole pair (a hybrid signature).
  return { ...record, sig: await signMessage(signedText(record), record.v === RECORD_VERSION ? keys : keys.priv) };
}

// What is sealed: the private keys and seeds. The public keys are in the
// record itself, and the post-quantum ones are rebuilt from their seeds.
function secretPart(keys) {
  return { pub: keys.pub, priv: keys.priv, epub: keys.epub ?? null, epriv: keys.epriv ?? null, qpriv: keys.qpriv, kpriv: keys.kpriv };
}

function sealedFields(sealed) {
  return { kdf: sealed.kdf, m: sealed.m, t: sealed.t, p: sealed.p, salt: sealed.salt, iv: sealed.iv, data: sealed.data };
}

/**
 * A new account record for a key pair. A pair with post-quantum keys (unsea 3)
 * gives a version 2 record; `{ legacy: true }` with a P-256-only pair gives a
 * version 1 record (for tests and old data only).
 */
export async function createAccountRecord({ alias, namespace, keys, password, encryptedKeys = null, now = Date.now(), legacy = false }) {
  if (!validAlias(alias)) throw new Error('invalid alias');
  if (!validNamespace(namespace)) throw new Error('invalid namespace');
  if (!keys?.pub || !keys?.priv) throw new Error('a key pair is required');
  if (!legacy) {
    if (!hasPostQuantumKeys(keys) || !keys.qpriv || !keys.kpriv) throw new Error('a key pair with post-quantum keys is required (unsea upgradePair)');
    const sealed = await encryptWithPassword(secretPart(keys), password);
    return sign({
      v: RECORD_VERSION,
      namespace: String(namespace),
      alias: String(alias).trim(),
      pub: keys.pub,
      qpub: keys.qpub,
      epub: keys.epub ?? null,
      kpub: keys.kpub,
      keys: sealedFields(sealed),
      created: now,
      updated: now,
      seq: 1,
    }, keys);
  }
  const blob = encryptedKeys || await encryptKeys(keys, password);
  return sign({
    v: LEGACY_RECORD_VERSION,
    namespace: String(namespace),
    alias: String(alias).trim(),
    pub: keys.pub,
    epub: keys.epub ?? null,
    keys: { salt: blob.salt, iv: blob.iv, data: blob.data },
    created: now,
    updated: now,
    seq: 1,
  }, keys);
}

/**
 * The next version of a record (a new password, say), signed by the same
 * keys. Always version 2: a version 1 record's keys get post-quantum keys
 * added (see upgradeAccountRecord). A version 2 record keeps its qpub.
 */
export async function updateAccountRecord(previous, { keys, password, now = Date.now() }) {
  if (!keys?.priv || keys.pub !== previous.pub) throw new Error('only the account key can update its record');
  const pair = hasPostQuantumKeys(keys) && keys.qpriv && keys.kpriv ? keys : upgradePair(keys);
  if (previous.v === RECORD_VERSION && (pair.qpub !== previous.qpub || pair.kpub !== previous.kpub)) {
    throw new Error('only the account\'s post-quantum keys can update its record');
  }
  const sealed = await encryptWithPassword(secretPart(pair), password);
  const { sig: _sig, ...rest } = previous;
  return sign({
    ...rest,
    v: RECORD_VERSION,
    qpub: pair.qpub,
    epub: previous.epub ?? pair.epub ?? null,
    kpub: pair.kpub,
    keys: sealedFields(sealed),
    updated: Math.max(now, previous.updated + 1),
    seq: previous.seq + 1,
  }, pair);
}

/**
 * Move a version 1 account to version 2: open it with its password, add
 * post-quantum keys to its key pair, and sign the new record with both.
 * Returns { keys, record }: the upgraded pair (keep it) and the record to
 * publish. A version 2 record comes back as it is, with its keys.
 */
export async function upgradeAccountRecord(record, password, { now = Date.now() } = {}) {
  const keys = await openAccountRecord(record, password);
  if (record.v === RECORD_VERSION) return { keys, record };
  const pair = upgradePair(keys);
  return { keys: pair, record: await updateAccountRecord(record, { keys: pair, password, now }) };
}

/** Whether a record is well formed and signed by the key it names. */
export async function verifyAccountRecord(record) {
  try {
    if (!record || typeof record !== 'object') return false;
    if (JSON.stringify(record).length > MAX_RECORD_BYTES) return false;
    if (record.v !== RECORD_VERSION && record.v !== LEGACY_RECORD_VERSION) return false;
    if (!validAlias(record.alias) || !validNamespace(record.namespace)) return false;
    if (typeof record.pub !== 'string' || !record.pub || typeof record.sig !== 'string') return false;
    const k = record.keys;
    if (!k || typeof k.salt !== 'string' || typeof k.iv !== 'string' || typeof k.data !== 'string') return false;
    if (!Number.isSafeInteger(record.seq) || record.seq < 1) return false;
    if (!Number.isFinite(record.created) || !Number.isFinite(record.updated)) return false;
    if (record.v === RECORD_VERSION) {
      if (typeof record.qpub !== 'string' || typeof record.kpub !== 'string' || k.kdf !== 'argon2id') return false;
      return await verifyMessage(signedText(record), record.sig, { pub: record.pub, qpub: record.qpub });
    }
    return await verifyMessage(signedText(record), record.sig, record.pub);
  } catch {
    return false;
  }
}

/**
 * Whether a store holding `existing` should take `incoming` in its place:
 * nothing there yet, or a newer version by the same key. Both are assumed
 * verified. Returns 'accept', 'taken' (another key has the name) or 'stale'.
 */
export function compareAccountRecords(existing, incoming) {
  if (!existing) return 'accept';
  if (existing.pub !== incoming.pub) return 'taken';
  // Once an account has post-quantum keys, only records signed with those
  // same keys replace it: no downgrade to version 1, no other qpub.
  if (existing.v === RECORD_VERSION && (incoming.v !== RECORD_VERSION || incoming.qpub !== existing.qpub)) return 'taken';
  return incoming.seq > existing.seq ? 'accept' : 'stale';
}

/** Whether a record is a version 2 (post-quantum) one. */
export function isPostQuantumRecord(record) {
  return record?.v === RECORD_VERSION;
}

/** Open a record with its password: the key pair, checked against the record's public key. */
export async function openAccountRecord(record, password) {
  if (record.v === RECORD_VERSION) {
    const keys = upgradePair(await decryptWithPassword({ encrypted: true, v: 3, ...record.keys }, password));
    if (keys?.pub !== record.pub || keys?.qpub !== record.qpub || keys?.kpub !== record.kpub) {
      throw new Error('record keys do not match its public keys');
    }
    return keys;
  }
  const keys = await decryptKeys(record.keys, password);
  if (keys?.pub !== record.pub) throw new Error('record keys do not match its public key');
  return keys;
}
