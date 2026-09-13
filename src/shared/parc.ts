/**
 * Pearl Abyss "Reflect" container as found inside Crimson Desert saves (after decryption/LZ4).
 *
 * Layout:
 *   u16 0xFFFF, u32 4, u64 0                       (14-byte head, kept verbatim)
 *   u32 formatVersion (15), u16 typeCount
 *   types[]: str name, u16 fieldCount, fields[]: str name, str type, u16 kind, u16 size, u32 aux
 *   u32 0, u32 entryCount, u32 streamSize
 *   toc[]: u32 typeIndex, u64 id (0xFF..FF), u32 offset, u32 size
 *   blocks[]: u16 maskBytes, mask, u32 ctx, fields…
 *
 * Field kinds: 0/2 scalar (size bytes), 1 string (u32 len + bytes), 3 vector<scalar>,
 * 4 inline object, 5 object pointer, 6 vector<object>, 7 vector<object pointer>.
 * A field's mask bit is set when it is written; vectors are always written
 * (`01` = empty, `00` + u32 count [+ 13-byte header for objects] + elements).
 * Inline object = u16 maskBytes, mask, u16 type, u8 0, u64 id, u32 payloadOffset (absolute),
 * then u32 0, fields…, u32 payloadSize.
 */

export interface FieldDef { name: string; type: string; mk: number; ms: number; aux: number }
export interface TypeDef { index: number; name: string; fields: FieldDef[] }

export type Scalar = number | bigint | number[] | Uint8Array;
export interface ObjList { items: ObjNode[]; nextId: number }
export type Value = Scalar | string | ObjNode | null | Scalar[] | ObjList;
export interface Slot { present: boolean; value: Value }
export interface ObjNode {
  type: number;
  /** element id for pointer-vector elements, 0xFF..FF for inline objects */
  id: bigint;
  fields: Slot[];
}
export interface RootEntry { type: number; id: bigint; ctx: number; obj: ObjNode }
export interface ParcDoc {
  head: Uint8Array;
  formatVersion: number;
  types: TypeDef[];
  roots: RootEntry[];
}

export class ParcError extends Error {}

const FF64 = 0xffffffffffffffffn;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const enc = new TextEncoder();

// ---------------------------------------------------------------- reader
class R {
  pos = 0;
  readonly dv: DataView;
  constructor(readonly d: Uint8Array) {
    this.dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  }
  u8(): number { return this.d[this.pos++]; }
  u16(): number { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  u64(): bigint { const v = this.dv.getBigUint64(this.pos, true); this.pos += 8; return v; }
  bytes(n: number): Uint8Array { const v = this.d.slice(this.pos, this.pos + n); this.pos += n; return v; }
  str(): string { const n = this.u32(); return utf8.decode(this.bytes(n)); }
}

function readScalar(r: R, f: FieldDef): Scalar {
  const { ms, type } = f;
  const p = r.pos;
  r.pos += ms;
  const dv = r.dv;
  switch (ms) {
    case 1: return type === 'int8' ? dv.getInt8(p) : r.d[p];
    case 2: return type === 'int16' ? dv.getInt16(p, true) : dv.getUint16(p, true);
    case 4:
      if (type === 'float') return dv.getFloat32(p, true);
      return type === 'int32' || type === 'int' ? dv.getInt32(p, true) : dv.getUint32(p, true);
    case 8:
      if (type === 'double') return dv.getFloat64(p, true);
      return type === 'int64' ? dv.getBigInt64(p, true) : dv.getBigUint64(p, true);
    case 12: return [dv.getFloat32(p, true), dv.getFloat32(p + 4, true), dv.getFloat32(p + 8, true)];
    case 16:
      if (type === 'quaternion') return [0, 4, 8, 12].map((o) => dv.getFloat32(p + o, true));
      return r.d.slice(p, p + 16);
    case 40: {
      const out: number[] = [];
      for (let o = 0; o < 40; o += 4) out.push(dv.getFloat32(p + o, true));
      return out;
    }
    default: return r.d.slice(p, p + ms);
  }
}

function writeScalar(w: W, f: FieldDef, v: Scalar): void {
  const { ms, type } = f;
  const p = w.reserve(ms);
  const dv = w.dv; // after reserve: the buffer may have been reallocated
  if (v instanceof Uint8Array) { w.buf.set(v.subarray(0, ms), p); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => dv.setFloat32(p + i * 4, x, true)); return; }
  switch (ms) {
    case 1: dv.setUint8(p, Number(v) & 0xff); return;
    case 2: dv.setUint16(p, Number(v) & 0xffff, true); return;
    case 4:
      if (type === 'float') dv.setFloat32(p, Number(v), true);
      else if (type === 'int32' || type === 'int') dv.setInt32(p, Number(v), true);
      else dv.setUint32(p, Number(v) >>> 0, true);
      return;
    case 8:
      if (type === 'double') dv.setFloat64(p, Number(v), true);
      else dv.setBigUint64(p, BigInt.asUintN(64, BigInt(v as number | bigint)), true);
      return;
    default: throw new ParcError(`cannot write scalar of size ${ms} for ${f.name}`);
  }
}

export function parseParc(d: Uint8Array): ParcDoc {
  const r = new R(d);
  if (r.u16() !== 0xffff) throw new ParcError('Bad reflect container magic');
  r.pos = 0;
  const head = r.bytes(14);
  const formatVersion = r.u32();
  const ntypes = r.u16();
  const types: TypeDef[] = [];
  for (let i = 0; i < ntypes; i++) {
    const name = r.str();
    const fc = r.u16();
    const fields: FieldDef[] = [];
    for (let j = 0; j < fc; j++) {
      const fname = r.str();
      const ftype = r.str();
      fields.push({ name: fname, type: ftype, mk: r.u16(), ms: r.u16(), aux: r.u32() });
    }
    types.push({ index: i, name, fields });
  }
  r.u32(); // reserved
  const count = r.u32();
  r.u32(); // stream size
  const toc: { type: number; id: bigint; off: number; size: number }[] = [];
  for (let i = 0; i < count; i++) toc.push({ type: r.u32(), id: r.u64(), off: r.u32(), size: r.u32() });
  const roots: RootEntry[] = [];
  for (const e of toc) {
    r.pos = e.off;
    const end = e.off + e.size;
    const t = types[e.type];
    if (!t) throw new ParcError(`TOC references unknown type ${e.type}`);
    const mbc = r.u16();
    const mask = r.bytes(mbc);
    const ctx = r.u32();
    const fields = readFields(r, types, t, mask);
    if (r.pos !== end) throw new ParcError(`Block ${t.name}: parsed ${r.pos - e.off} of ${e.size} bytes`);
    roots.push({ type: e.type, id: e.id, ctx, obj: { type: e.type, id: e.id, fields } });
  }
  return { head, formatVersion, types, roots };
}

function bit(mask: Uint8Array, i: number): boolean {
  return i < mask.length * 8 && (mask[i >> 3] & (1 << (i & 7))) !== 0;
}

function readFields(r: R, types: TypeDef[], t: TypeDef, mask: Uint8Array): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < t.fields.length; i++) {
    const f = t.fields[i];
    const present = bit(mask, i);
    switch (f.mk) {
      case 0:
      case 2:
        out.push(present ? { present, value: readScalar(r, f) } : { present, value: defaultScalar(f) });
        break;
      case 1: {
        if (!present) { out.push({ present, value: '' }); break; }
        const n = r.u32() * f.ms;
        const b = r.bytes(n);
        let v: string | Uint8Array;
        try { v = utf8.decode(b); } catch { v = b; }
        out.push({ present, value: v });
        break;
      }
      case 3: {
        const flag = r.u8();
        if (flag === 1) { out.push({ present: false, value: [] }); break; }
        if (flag !== 0) throw new ParcError(`Bad vector flag ${flag} for ${t.name}.${f.name} at ${r.pos - 1}`);
        const n = r.u32();
        const items: Scalar[] = [];
        for (let k = 0; k < n; k++) items.push(readScalar(r, f));
        out.push({ present: true, value: items });
        break;
      }
      case 4:
        out.push(present ? { present, value: readObj(r, types) } : { present, value: null });
        break;
      case 5: {
        if (!present) { out.push({ present, value: null }); break; }
        const flag = r.u8();
        out.push({ present, value: flag ? readObj(r, types) : null });
        break;
      }
      case 6:
      case 7: {
        const flag = r.u8();
        if (flag === 1) { out.push({ present: false, value: { items: [], nextId: 0 } }); break; }
        if (flag !== 0) throw new ParcError(`Bad vector flag ${flag} for ${t.name}.${f.name} at ${r.pos - 1}`);
        const n = r.u32();
        r.u8();
        const nextId = r.u32();
        r.u64();
        const items: ObjNode[] = [];
        for (let k = 0; k < n; k++) items.push(readObj(r, types));
        out.push({ present: true, value: { items, nextId } });
        break;
      }
      default:
        throw new ParcError(`Unknown field kind ${f.mk} (${t.name}.${f.name})`);
    }
  }
  return out;
}

function readObj(r: R, types: TypeDef[]): ObjNode {
  const mbc = r.u16();
  const mask = r.bytes(mbc);
  const type = r.u16();
  r.u8();
  const id = r.u64();
  const po = r.u32();
  if (po !== r.pos) throw new ParcError(`Object payload offset ${po} != ${r.pos}`);
  const t = types[type];
  if (!t) throw new ParcError(`Object of unknown type ${type}`);
  r.u32();
  const fields = readFields(r, types, t, mask);
  const size = r.u32();
  if (size !== r.pos - 4 - po) throw new ParcError(`Object ${t.name}: size ${size} != ${r.pos - 4 - po}`);
  return { type, id, fields };
}

export function defaultScalar(f: FieldDef): Scalar {
  switch (f.ms) {
    case 8: return f.type === 'double' ? 0 : 0n;
    case 12: return [0, 0, 0];
    case 16: return f.type === 'quaternion' ? [0, 0, 0, 1] : new Uint8Array(16);
    case 40: return [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    case 1: case 2: case 4: return 0;
    default: return new Uint8Array(f.ms);
  }
}

// ---------------------------------------------------------------- writer
class W {
  buf = new Uint8Array(1 << 20);
  dv = new DataView(this.buf.buffer);
  len = 0;
  reserve(n: number): number {
    if (this.len + n > this.buf.length) {
      let cap = this.buf.length * 2;
      while (cap < this.len + n) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.buf.subarray(0, this.len));
      this.buf = nb;
      this.dv = new DataView(nb.buffer);
    }
    const p = this.len;
    this.len += n;
    return p;
  }
  u8(v: number): void { const p = this.reserve(1); this.buf[p] = v; }
  u16(v: number): void { const p = this.reserve(2); this.dv.setUint16(p, v, true); }
  u32(v: number): void { const p = this.reserve(4); this.dv.setUint32(p, v >>> 0, true); }
  u64(v: bigint): void { const p = this.reserve(8); this.dv.setBigUint64(p, BigInt.asUintN(64, v), true); }
  bytes(b: Uint8Array): void { const p = this.reserve(b.length); this.buf.set(b, p); }
  str(s: string): void { const b = enc.encode(s); this.u32(b.length); this.bytes(b); }
  out(): Uint8Array { return this.buf.slice(0, this.len); }
}

function maskBytes(n: number): number {
  return Math.max(1, (n + 7) >> 3);
}

export function serializeParc(doc: ParcDoc): Uint8Array {
  const w = new W();
  w.bytes(doc.head);
  w.u32(doc.formatVersion);
  w.u16(doc.types.length);
  for (const t of doc.types) {
    w.str(t.name);
    w.u16(t.fields.length);
    for (const f of t.fields) { w.str(f.name); w.str(f.type); w.u16(f.mk); w.u16(f.ms); w.u32(f.aux); }
  }
  const tocHeader = w.reserve(12);
  const tocPos = w.reserve(doc.roots.length * 20);
  const offsets: { off: number; size: number }[] = [];
  for (const root of doc.roots) {
    const t = doc.types[root.type];
    const start = w.len;
    const mask = new Uint8Array(maskBytes(t.fields.length));
    w.u16(mask.length);
    const maskPos = w.reserve(mask.length);
    w.u32(root.ctx);
    writeFields(w, doc.types, t, root.obj.fields, mask);
    w.buf.set(mask, maskPos);
    offsets.push({ off: start, size: w.len - start });
  }
  const dv = w.dv;
  dv.setUint32(tocHeader, 0, true);
  dv.setUint32(tocHeader + 4, doc.roots.length, true);
  dv.setUint32(tocHeader + 8, w.len, true);
  doc.roots.forEach((root, i) => {
    const p = tocPos + i * 20;
    dv.setUint32(p, root.type, true);
    dv.setBigUint64(p + 4, BigInt.asUintN(64, root.id), true);
    dv.setUint32(p + 12, offsets[i].off, true);
    dv.setUint32(p + 16, offsets[i].size, true);
  });
  return w.out();
}

function writeFields(w: W, types: TypeDef[], t: TypeDef, slots: Slot[], mask: Uint8Array): void {
  if (slots.length !== t.fields.length) throw new ParcError(`${t.name}: ${slots.length} slots for ${t.fields.length} fields`);
  for (let i = 0; i < t.fields.length; i++) {
    const f = t.fields[i];
    const s = slots[i];
    let present = s.present;
    switch (f.mk) {
      case 0:
      case 2:
        if (present) writeScalar(w, f, s.value as Scalar);
        break;
      case 1:
        if (present) {
          const b = typeof s.value === 'string' ? enc.encode(s.value) : (s.value as Uint8Array);
          w.u32(b.length / f.ms);
          w.bytes(b);
        }
        break;
      case 3: {
        const items = s.value as Scalar[];
        present = items.length > 0;
        if (!present) { w.u8(1); break; }
        w.u8(0);
        w.u32(items.length);
        for (const it of items) writeScalar(w, f, it);
        break;
      }
      case 4:
        if (present) writeObj(w, types, s.value as ObjNode, FF64);
        break;
      case 5:
        if (present) {
          if (s.value) { w.u8(1); writeObj(w, types, s.value as ObjNode, FF64); } else w.u8(0);
        }
        break;
      case 6:
      case 7: {
        const list = s.value as ObjList;
        present = list.items.length > 0;
        if (!present) { w.u8(1); break; }
        w.u8(0);
        w.u32(list.items.length);
        w.u8(0);
        w.u32(f.mk === 7 ? list.nextId : 0);
        w.u64(0n);
        for (const it of list.items) writeObj(w, types, it, f.mk === 7 ? it.id : FF64);
        break;
      }
      default:
        throw new ParcError(`Unknown field kind ${f.mk}`);
    }
    if (present) mask[i >> 3] |= 1 << (i & 7);
  }
}

function writeObj(w: W, types: TypeDef[], o: ObjNode, id: bigint): void {
  const t = types[o.type];
  if (!t) throw new ParcError(`Object of unknown type ${o.type}`);
  const mask = new Uint8Array(maskBytes(t.fields.length));
  w.u16(mask.length);
  const maskPos = w.reserve(mask.length);
  w.u16(o.type);
  w.u8(0);
  w.u64(id);
  const po = w.len + 4;
  w.u32(po);
  w.u32(0);
  writeFields(w, types, t, o.fields, mask);
  w.buf.set(mask, maskPos);
  w.u32(w.len - po);
}

// ---------------------------------------------------------------- helpers
export function typeByName(doc: ParcDoc, name: string): TypeDef | undefined {
  return doc.types.find((t) => t.name === name);
}

export function fieldIndex(t: TypeDef, name: string): number {
  const i = t.fields.findIndex((f) => f.name === name);
  if (i < 0) throw new ParcError(`${t.name} has no field ${name}`);
  return i;
}

/** New object with every field absent (defaults). */
export function newObj(doc: ParcDoc, t: TypeDef): ObjNode {
  return {
    type: t.index,
    id: FF64,
    fields: t.fields.map((f) => {
      switch (f.mk) {
        case 0: case 2: return { present: false, value: defaultScalar(f) };
        case 1: return { present: false, value: '' };
        case 3: return { present: false, value: [] as Scalar[] };
        case 6: case 7: return { present: false, value: { items: [], nextId: 0 } };
        default: return { present: false, value: null };
      }
    }),
  };
}

export function cloneObj(o: ObjNode): ObjNode {
  return {
    type: o.type,
    id: o.id,
    fields: o.fields.map((s) => ({ present: s.present, value: cloneValue(s.value) })),
  };
}
function cloneValue(v: Value): Value {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Uint8Array) return v.slice();
  if (Array.isArray(v)) return v.map((x) => cloneValue(x as Value) as Scalar);
  if ('items' in v) return { items: v.items.map(cloneObj), nextId: v.nextId };
  return cloneObj(v as ObjNode);
}
