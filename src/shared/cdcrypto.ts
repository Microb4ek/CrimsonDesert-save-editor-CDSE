/**
 * Crimson Desert save container: "SAVE" header, ChaCha20-encrypted, LZ4-compressed payload,
 * HMAC-SHA256 over the compressed bytes. Key material as documented by the community
 * (NattKh / CrimsonSaveEditor, MPL-2.0).
 */
import { lz4Compress, lz4Decompress } from './lz4';

const BASE_KEY = hexToBytes('C41B8E730DF259A637CC04E9B12F9668DA107A853E61F9224DB80AD75C13EF90').subarray(0, 31);
const VERSION_PREFIX: Record<number, Uint8Array> = {
  1: ascii('^Qgbrm/.#@`zsr]\\@rvfal#"'),
  2: ascii('^Pearl--#Abyss__@!!'),
};
const SUFFIX = ascii('PRIVATE_HMAC_SECRET_CHECK');

export const HEADER_SIZE = 0x80;

export interface SaveContainer {
  version: number;
  /** the original 128-byte header (nonce/hmac/sizes are rewritten on save) */
  header: Uint8Array;
  blob: Uint8Array;
  hmacOk: boolean;
}

export class SaveFormatError extends Error {}

function ascii(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export function saveKey(version: number): Uint8Array {
  const prefix = VERSION_PREFIX[version];
  if (!prefix) throw new SaveFormatError(`Unsupported save version ${version}`);
  const material = new Uint8Array(prefix.length + SUFFIX.length);
  material.set(prefix);
  material.set(SUFFIX, prefix.length);
  const key = new Uint8Array(32);
  for (let i = 0; i < 31; i++) key[i] = BASE_KEY[i] ^ material[i];
  return key;
}

// ---------------------------------------------------------------- ChaCha20 (RFC 7539, 32-bit counter taken from nonce[0..4])
function rotl(v: number, n: number): number {
  return ((v << n) | (v >>> (32 - n))) >>> 0;
}
function qr(s: Uint32Array, a: number, b: number, c: number, d: number): void {
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 16);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 12);
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl(s[d] ^ s[a], 8);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl(s[b] ^ s[c], 7);
}

export function chacha20(data: Uint8Array, nonce16: Uint8Array, key: Uint8Array): Uint8Array {
  const kv = new DataView(key.buffer, key.byteOffset);
  const nv = new DataView(nonce16.buffer, nonce16.byteOffset);
  const state = new Uint32Array(16);
  state[0] = 0x61707865; state[1] = 0x3320646e; state[2] = 0x79622d32; state[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) state[4 + i] = kv.getUint32(i * 4, true);
  let counter = nv.getUint32(0, true);
  state[13] = nv.getUint32(4, true); state[14] = nv.getUint32(8, true); state[15] = nv.getUint32(12, true);
  const out = new Uint8Array(data.length);
  const w = new Uint32Array(16);
  const block = new Uint8Array(64);
  const bv = new DataView(block.buffer);
  for (let pos = 0; pos < data.length; pos += 64) {
    state[12] = counter >>> 0;
    w.set(state);
    for (let r = 0; r < 10; r++) {
      qr(w, 0, 4, 8, 12); qr(w, 1, 5, 9, 13); qr(w, 2, 6, 10, 14); qr(w, 3, 7, 11, 15);
      qr(w, 0, 5, 10, 15); qr(w, 1, 6, 11, 12); qr(w, 2, 7, 8, 13); qr(w, 3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) bv.setUint32(i * 4, (w[i] + state[i]) >>> 0, true);
    const end = Math.min(pos + 64, data.length);
    for (let i = pos; i < end; i++) out[i] = data[i] ^ block[i - pos];
    counter = (counter + 1) >>> 0;
  }
  return out;
}

// ---------------------------------------------------------------- SHA-256 / HMAC
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(msg: Uint8Array): Uint8Array {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = msg.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, (len * 8) >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000), false);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
  return out;
}
function rotr(v: number, n: number): number {
  return ((v >>> n) | (v << (32 - n))) >>> 0;
}

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = new Uint8Array(64);
  k.set(key.length > 64 ? sha256(key) : key);
  const ipad = new Uint8Array(64 + msg.length);
  const opad = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  ipad.set(msg, 64);
  opad.set(sha256(ipad), 64);
  return sha256(opad);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------------------------------------------------------------- container
export function openSave(file: Uint8Array): SaveContainer {
  if (file.length < HEADER_SIZE + 16) throw new SaveFormatError('File is too small to be a Crimson Desert save.');
  if (!(file[0] === 0x53 && file[1] === 0x41 && file[2] === 0x56 && file[3] === 0x45)) throw new SaveFormatError('Not a Crimson Desert save (missing SAVE signature).');
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const version = dv.getUint16(4, true);
  const uncompressed = dv.getUint32(0x12, true);
  const payloadSize = dv.getUint32(0x16, true);
  if (HEADER_SIZE + payloadSize > file.length) throw new SaveFormatError('Save file is truncated.');
  const nonce = file.subarray(0x1a, 0x2a);
  const mac = file.subarray(0x2a, 0x4a);
  const key = saveKey(version);
  const compressed = chacha20(file.subarray(HEADER_SIZE, HEADER_SIZE + payloadSize), nonce, key);
  const hmacOk = equalBytes(hmacSha256(key, compressed), mac);
  const blob = lz4Decompress(compressed, uncompressed);
  return { version, header: file.slice(0, HEADER_SIZE), blob, hmacOk };
}

export function sealSave(container: SaveContainer, blob: Uint8Array): Uint8Array {
  const version = container.version;
  const key = saveKey(version);
  const compressed = lz4Compress(blob);
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const mac = hmacSha256(key, compressed);
  const encrypted = chacha20(compressed, nonce, key);
  const out = new Uint8Array(HEADER_SIZE + encrypted.length);
  out.set(container.header.subarray(0, HEADER_SIZE));
  const dv = new DataView(out.buffer);
  dv.setUint16(4, version, true);
  dv.setUint16(6, 0x80, true);
  dv.setUint32(0x12, blob.length, true);
  dv.setUint32(0x16, compressed.length, true);
  out.set(nonce, 0x1a);
  out.set(mac, 0x2a);
  out.set(encrypted, HEADER_SIZE);
  return out;
}
