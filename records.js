/**
 * Account records: the part of an identity that lives off the device.
 *
 * A record holds an account's name, its public keys, and its private keys
 * encrypted with the account's password (PBKDF2 + AES-GCM). It is signed with
 * the account's own key. Anyone holding a record can check it, and a store
 * (a relay, see relay.js) keeps a name for the key that registered it first:
 * an update is accepted only when it is signed by that same key and carries a
 * higher sequence number. So a name cannot be taken over by registering it
 * again, and a record cannot be forged or rolled back.
 *
 * Works in browsers and in Node (Web Crypto and UnSEA).
 */

import { signMessage, verifyMessage } from 'unsea';

export const RECORD_VERSION = 1;
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

async function sign(record, priv) {
  return { ...record, sig: await signMessage(signedText(record), priv) };
}

/**
 * A new account record for a key pair. `encryptedKeys` may be given (an
 * existing blob from encryptKeys) instead of a password.
 */
export async function createAccountRecord({ alias, namespace, keys, password, encryptedKeys = null, now = Date.now() }) {
  if (!validAlias(alias)) throw new Error('invalid alias');
  if (!validNamespace(namespace)) throw new Error('invalid namespace');
  if (!keys?.pub || !keys?.priv) throw new Error('a key pair is required');
  const blob = encryptedKeys || await encryptKeys(keys, password);
  return sign({
    v: RECORD_VERSION,
    namespace: String(namespace),
    alias: String(alias).trim(),
    pub: keys.pub,
    epub: keys.epub ?? null,
    keys: { salt: blob.salt, iv: blob.iv, data: blob.data },
    created: now,
    updated: now,
    seq: 1,
  }, keys.priv);
}

/** The next version of a record (a new password, say), signed by the same key. */
export async function updateAccountRecord(previous, { keys, password, now = Date.now() }) {
  if (!keys?.priv || keys.pub !== previous.pub) throw new Error('only the account key can update its record');
  const blob = await encryptKeys(keys, password);
  return sign({
    ...previous,
    sig: undefined,
    keys: { salt: blob.salt, iv: blob.iv, data: blob.data },
    updated: Math.max(now, previous.updated + 1),
    seq: previous.seq + 1,
  }, keys.priv);
}

/** Whether a record is well formed and signed by the key it names. */
export async function verifyAccountRecord(record) {
  try {
    if (!record || typeof record !== 'object') return false;
    if (JSON.stringify(record).length > MAX_RECORD_BYTES) return false;
    if (record.v !== RECORD_VERSION) return false;
    if (!validAlias(record.alias) || !validNamespace(record.namespace)) return false;
    if (typeof record.pub !== 'string' || !record.pub || typeof record.sig !== 'string') return false;
    const k = record.keys;
    if (!k || typeof k.salt !== 'string' || typeof k.iv !== 'string' || typeof k.data !== 'string') return false;
    if (!Number.isSafeInteger(record.seq) || record.seq < 1) return false;
    if (!Number.isFinite(record.created) || !Number.isFinite(record.updated)) return false;
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
  return incoming.seq > existing.seq ? 'accept' : 'stale';
}

/** Open a record with its password: the key pair, checked against the record's public key. */
export async function openAccountRecord(record, password) {
  const keys = await decryptKeys(record.keys, password);
  if (keys?.pub !== record.pub) throw new Error('record keys do not match its public key');
  return keys;
}
