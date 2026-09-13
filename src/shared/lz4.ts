/** Minimal LZ4 block-format codec (what Pacific Drive uses for the GAME chunk). */

export function lz4Decompress(src: Uint8Array, dstSize: number): Uint8Array {
  const dst = new Uint8Array(dstSize);
  let s = 0;
  let d = 0;
  while (s < src.length) {
    const token = src[s++];
    let lit = token >> 4;
    if (lit === 15) {
      let x: number;
      do { x = src[s++]; lit += x; } while (x === 255);
    }
    dst.set(src.subarray(s, s + lit), d);
    s += lit;
    d += lit;
    if (s >= src.length) break;
    const off = src[s] | (src[s + 1] << 8);
    s += 2;
    let ml = token & 15;
    if (ml === 15) {
      let x: number;
      do { x = src[s++]; ml += x; } while (x === 255);
    }
    ml += 4;
    let ref = d - off;
    if (off === 0 || ref < 0) throw new Error(`corrupt LZ4 stream at ${s}`);
    for (let i = 0; i < ml; i++) dst[d++] = dst[ref++];
  }
  if (d !== dstSize) throw new Error(`LZ4: produced ${d} bytes, expected ${dstSize}`);
  return dst;
}

export function lz4Compress(src: Uint8Array): Uint8Array {
  const n = src.length;
  const out = new Uint8Array(n + Math.ceil(n / 255) + 64);
  const HBITS = 16;
  const hash = new Int32Array(1 << HBITS).fill(-1);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const rd = (p: number): number => dv.getUint32(p, true);
  const h = (p: number): number => Math.imul(rd(p), 2654435761) >>> (32 - HBITS);
  let o = 0;
  let anchor = 0;
  let p = 0;
  const limit = n - 12;
  const emit = (litStart: number, litEnd: number, off: number, ml: number): void => {
    const lit = litEnd - litStart;
    const tokPos = o++;
    let tok = 0;
    if (lit >= 15) {
      tok = 0xf0;
      let l = lit - 15;
      while (l >= 255) { out[o++] = 255; l -= 255; }
      out[o++] = l;
    } else tok = lit << 4;
    out.set(src.subarray(litStart, litEnd), o);
    o += lit;
    if (ml >= 0) {
      out[o++] = off & 255;
      out[o++] = off >> 8;
      const m = ml - 4;
      if (m >= 15) {
        tok |= 15;
        let l = m - 15;
        while (l >= 255) { out[o++] = 255; l -= 255; }
        out[o++] = l;
      } else tok |= m;
    }
    out[tokPos] = tok;
  };
  while (p < limit) {
    const hv = h(p);
    const ref = hash[hv];
    hash[hv] = p;
    if (ref >= 0 && p - ref <= 65535 && rd(ref) === rd(p)) {
      let ml = 4;
      while (p + ml < n - 5 && src[ref + ml] === src[p + ml]) ml++;
      emit(anchor, p, p - ref, ml);
      p += ml;
      anchor = p;
      if (p < limit) hash[h(p - 2)] = p - 2;
      continue;
    }
    p++;
  }
  emit(anchor, n, 0, -1);
  return out.slice(0, o);
}
