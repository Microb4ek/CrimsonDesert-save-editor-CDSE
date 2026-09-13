/** Convenience layer over the reflect document: name-based field access, object factories. */
import { cloneObj, fieldIndex, newObj, ParcError, type FieldDef, type ObjList, type ObjNode, type ParcDoc, type RootEntry, type Scalar, type Slot, type TypeDef, type Value } from './parc';

export class Model {
  private byName = new Map<string, TypeDef>();
  constructor(readonly doc: ParcDoc) {
    for (const t of doc.types) this.byName.set(t.name, t);
  }

  type(name: string): TypeDef | undefined {
    return this.byName.get(name);
  }
  typeOf(o: ObjNode): TypeDef {
    return this.doc.types[o.type];
  }
  className(o: ObjNode): string {
    return this.doc.types[o.type]?.name ?? `type#${o.type}`;
  }
  roots(className: string): RootEntry[] {
    return this.doc.roots.filter((r) => this.doc.types[r.type].name === className);
  }
  root(className: string): ObjNode | undefined {
    return this.roots(className)[0]?.obj;
  }

  field(o: ObjNode, name: string): FieldDef {
    const t = this.typeOf(o);
    return t.fields[fieldIndex(t, name)];
  }
  slot(o: ObjNode, name: string): Slot {
    return o.fields[fieldIndex(this.typeOf(o), name)];
  }
  has(o: ObjNode, name: string): boolean {
    const t = this.typeOf(o);
    return t.fields.some((f) => f.name === name);
  }
  /** Value of a field, or null when this save's schema lacks the field. */
  get(o: ObjNode, name: string): Value {
    const t = this.typeOf(o);
    const i = t.fields.findIndex((f) => f.name === name);
    return i < 0 ? null : o.fields[i].value;
  }
  num(o: ObjNode, name: string): number {
    const v = this.get(o, name);
    return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0;
  }
  big(o: ObjNode, name: string): bigint {
    const v = this.get(o, name);
    return typeof v === 'bigint' ? v : typeof v === 'number' ? BigInt(Math.trunc(v)) : 0n;
  }
  str(o: ObjNode, name: string): string {
    const v = this.get(o, name);
    return typeof v === 'string' ? v : '';
  }
  obj(o: ObjNode, name: string): ObjNode | null {
    const v = this.get(o, name);
    return v && typeof v === 'object' && 'fields' in v ? (v as ObjNode) : null;
  }
  list(o: ObjNode, name: string): ObjList {
    const v = this.get(o, name);
    if (!v || typeof v !== 'object' || !('items' in v)) throw new ParcError(`${this.className(o)}.${name} is not an object list`);
    return v as ObjList;
  }
  vec(o: ObjNode, name: string): Scalar[] {
    const v = this.get(o, name);
    if (!Array.isArray(v)) throw new ParcError(`${this.className(o)}.${name} is not a vector`);
    return v as Scalar[];
  }
  /** Sets a value and marks the field as written. */
  set(o: ObjNode, name: string, value: Value): void {
    const f = this.field(o, name);
    const s = this.slot(o, name);
    if ((f.mk === 0 || f.mk === 2) && f.ms === 8 && f.type !== 'double' && typeof value === 'number') value = BigInt(Math.trunc(value));
    s.value = value;
    s.present = true;
  }
  /** Sets a number-like field; keeps bigint for 64-bit fields. */
  setNum(o: ObjNode, name: string, value: number | bigint): void {
    this.set(o, name, value);
  }
  clear(o: ObjNode, name: string): void {
    const s = this.slot(o, name);
    s.present = false;
  }

  create(className: string): ObjNode {
    const t = this.type(className);
    if (!t) throw new ParcError(`Save has no type ${className}`);
    return newObj(this.doc, t);
  }
  clone(o: ObjNode): ObjNode {
    return cloneObj(o);
  }
  /** Appends an object to an object list, assigning a pointer id when the list is a pointer list. */
  push(list: ObjList, o: ObjNode, pointerList = false): ObjNode {
    if (pointerList) {
      o.id = BigInt(list.nextId + (list.items.length ? 1 : 0));
      list.nextId = Number(o.id);
    }
    list.items.push(o);
    return o;
  }
  remove(list: ObjList, o: ObjNode): void {
    const i = list.items.indexOf(o);
    if (i >= 0) list.items.splice(i, 1);
  }
}

export function toNumber(v: Value): number {
  return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0;
}
