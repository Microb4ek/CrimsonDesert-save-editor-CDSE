import { useMemo, useState } from 'react';
import type { FieldDef, ObjList, ObjNode, Scalar, Value } from '@shared/parc';
import type { Model } from '@shared/cdmodel';
import type { EditorProps } from '../App';
import { PageHead } from '../components/common';
import { valueToDisplay } from '../lib/editor';

/** Raw tree of every root block in the save with inline editing of scalars and strings. */
export function Explorer({ session, mutate }: EditorProps): JSX.Element {
  const m = session.model;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const groups = useMemo(() => {
    const g = new Map<string, number[]>();
    m.doc.roots.forEach((r, i) => {
      const n = m.doc.types[r.type].name;
      if (!g.has(n)) g.set(n, []);
      g.get(n)!.push(i);
    });
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [m]);

  const toggle = (id: string): void =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const needle = q.trim().toLowerCase();
  const visibleGroups = groups.filter(([name]) => !needle || name.toLowerCase().includes(needle));

  const commit = (node: ObjNode, f: FieldDef, idx: number, text: string): void => {
    mutate((mm) => {
      const slot = node.fields[idx];
      if (f.mk === 1) {
        slot.value = text;
        slot.present = true;
        return;
      }
      const cur = slot.value as Scalar;
      let v: Scalar;
      if (Array.isArray(cur)) v = text.split(/[\s,]+/).filter(Boolean).map(Number);
      else if (cur instanceof Uint8Array) v = new Uint8Array(text.replace(/[^0-9a-f]/gi, '').match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
      else if (typeof cur === 'bigint') v = BigInt(text.trim() || '0');
      else v = f.type === 'float' || f.type === 'double' ? Number(text) : Math.trunc(Number(text));
      if (typeof v === 'number' && Number.isNaN(v)) throw new Error(`"${text}" is not a number`);
      mm.set(node, f.name, v);
    });
  };

  const renderObj = (node: ObjNode, id: string, depth: number): JSX.Element[] => {
    const t = m.doc.types[node.type];
    const out: JSX.Element[] = [];
    t.fields.forEach((f, i) => {
      const slot = node.fields[i];
      const fid = `${id}/${f.name}`;
      const pad = { paddingLeft: 8 + depth * 16 };
      const v = slot.value;
      if (f.mk === 4 || f.mk === 5) {
        const o = v as ObjNode | null;
        out.push(
          <div key={fid} className="node" style={pad}>
            <span className="tw" onClick={() => o && toggle(fid)}>{o ? (open.has(fid) ? '▾' : '▸') : '·'}</span>
            <span className="k">{f.name}</span>
            <span className="ty">{o ? m.className(o) : f.type}{f.mk === 5 ? '*' : ''}</span>
            {!o && <span className="v absent">{slot.present ? 'null' : 'absent'}</span>}
          </div>,
        );
        if (o && open.has(fid)) out.push(...renderObj(o, fid, depth + 1));
      } else if (f.mk === 6 || f.mk === 7) {
        const l = v as ObjList;
        out.push(
          <div key={fid} className="node" style={pad}>
            <span className="tw" onClick={() => l.items.length && toggle(fid)}>{l.items.length ? (open.has(fid) ? '▾' : '▸') : '·'}</span>
            <span className="k">{f.name}</span>
            <span className="ty">{f.mk === 7 ? 'ptr list' : 'list'} · {l.items.length}</span>
          </div>,
        );
        if (open.has(fid)) {
          l.items.slice(0, 2000).forEach((o, k) => {
            const oid = `${fid}[${k}]`;
            out.push(
              <div key={oid} className="node" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
                <span className="tw" onClick={() => toggle(oid)}>{open.has(oid) ? '▾' : '▸'}</span>
                <span className="k">[{k}]</span>
                <span className="ty">{m.className(o)}</span>
                <span className="v">{summary(m, o)}</span>
                <button className="chip small" style={{ marginLeft: 6 }} onClick={() => mutate((mm) => mm.remove(l, o))} title="Delete this element">
                  ✕
                </button>
              </div>,
            );
            if (open.has(oid)) out.push(...renderObj(o, oid, depth + 2));
          });
          if (l.items.length > 2000) out.push(<div key={fid + '/more'} className="node hint" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>… {l.items.length - 2000} more</div>);
        }
      } else if (f.mk === 3) {
        const arr = v as Scalar[];
        out.push(
          <div key={fid} className="node" style={pad}>
            <span className="tw">·</span>
            <span className="k">{f.name}</span>
            <span className="ty">{f.type}[{arr.length}]</span>
            {editing === fid ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { mutate((mm) => mm.set(node, f.name, draft.split(/[\s,]+/).filter(Boolean).map((x) => (typeof arr[0] === 'bigint' || f.ms === 8 ? BigInt(x) : Number(x))) as Scalar[])); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            ) : (
              <span className={`v ${f.ms <= 8 ? 'editable' : ''}`} onClick={() => { if (f.ms <= 8) { setEditing(fid); setDraft(arr.map((x) => valueToDisplay(x as Value)).join(', ')); } }} title={f.ms <= 8 ? 'Click to edit (comma separated)' : undefined}>
                {arr.length ? arr.slice(0, 40).map((x) => valueToDisplay(x as Value)).join(', ') + (arr.length > 40 ? ' …' : '') : 'empty'}
              </span>
            )}
          </div>,
        );
      } else {
        const isStr = f.mk === 1;
        out.push(
          <div key={fid} className="node" style={pad}>
            <span className="tw">·</span>
            <span className="k">{f.name}</span>
            <span className="ty">{f.type}</span>
            {editing === fid ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { try { commit(node, f, i, draft); } catch { /* invalid: keep old */ } setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            ) : (
              <span className={`v editable ${isStr ? 'str' : ''} ${slot.present ? '' : 'absent'}`} onClick={() => { setEditing(fid); setDraft(isStr ? String(v ?? '') : valueToDisplay(v)); }} title={slot.present ? 'Click to edit' : 'Not written in the save (default). Click to set'}>
                {slot.present ? valueToDisplay(v) : `(${valueToDisplay(v)})`}
              </span>
            )}
          </div>,
        );
      }
    });
    return out;
  };

  return (
    <>
      <PageHead
        title="Raw data"
        sub={`${m.doc.roots.length} blocks · ${m.doc.types.length} types`}
        subtitle="Every value in the save. Click a value to edit it; values in parentheses are defaults that are not written to the file."
        actions={
          <div className="search" style={{ width: 260 }}>
            <input placeholder="Filter blocks by class name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      <div className="tree" style={{ height: 'calc(100vh - 190px)' }}>
        {visibleGroups.map(([name, idxs]) => {
          const gid = `g:${name}`;
          return (
            <div key={name}>
              <div className="node" style={{ paddingLeft: 4 }}>
                <span className="tw" onClick={() => toggle(gid)}>{open.has(gid) ? '▾' : '▸'}</span>
                <span className="k" style={{ color: 'var(--gold-2)' }}>{name}</span>
                <span className="ty">{idxs.length} block{idxs.length > 1 ? 's' : ''}</span>
              </div>
              {open.has(gid) &&
                idxs.slice(0, 1500).map((i) => {
                  const r = m.doc.roots[i];
                  const rid = `r:${i}`;
                  return (
                    <div key={i}>
                      <div className="node" style={{ paddingLeft: 20 }}>
                        <span className="tw" onClick={() => toggle(rid)}>{open.has(rid) ? '▾' : '▸'}</span>
                        <span className="k">block #{i}</span>
                        <span className="ty">ctx {r.ctx}</span>
                        <span className="v">{summary(m, r.obj)}</span>
                      </div>
                      {open.has(rid) && renderObj(r.obj, rid, 2)}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </>
  );
}

function summary(m: Model, o: ObjNode): string {
  const t = m.doc.types[o.type];
  const parts: string[] = [];
  for (let i = 0; i < t.fields.length && parts.length < 3; i++) {
    const f = t.fields[i];
    const s = o.fields[i];
    if (!s.present || f.mk > 2) continue;
    parts.push(`${f.name.replace(/^_/, '')}=${valueToDisplay(s.value)}`);
  }
  return parts.join(' ');
}
