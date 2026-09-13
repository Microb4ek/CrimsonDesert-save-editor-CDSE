import { useState } from 'react';
import type { ObjList, ObjNode } from '@shared/parc';
import type { Model } from '@shared/cdmodel';
import type { EditorProps } from '../App';
import { Field, ItemIcon, NumberField, PageHead, Toggle } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import type { GameDb } from '../gamedata';
import { anyItemTemplate, createItem, itemView, MAX_ENDURANCE, mercenaries, setSocket } from '../lib/editor';
import type { MercenaryView } from '../lib/editor';
import { ItemPanel } from './Inventory';

export function Companions({ db, session, mutate }: EditorProps): JSX.Element {
  const m = session.model;
  const list = mercenaries(m);
  const [selNo, setSelNo] = useState<bigint | null>(list[0]?.no ?? null);
  const merc = list.find((x) => x.no === selNo) ?? list[0];

  return (
    <>
      <PageHead title="Companions" sub={`${list.length} in the clan`} subtitle="Mercenaries, mounts and pets recruited to the camp: level, vitals, gear and their own inventories." />
      {!list.length && <div className="notice info">No companions in this save yet.</div>}
      <div className="equip" style={{ gridTemplateColumns: '280px 1fr' }}>
        <div className="row-list">
          {list.map((x) => (
            <button key={String(x.no)} className={`row click ${merc?.no === x.no ? 'on' : ''}`} onClick={() => setSelNo(x.no)} style={{ textAlign: 'left' }}>
              <span className="t">
                <b>{x.name || db.characterName(x.characterKey)}</b>
                <small>
                  {db.characterName(x.characterKey)} · Lv {x.level} · #{String(x.no)}
                  {x.dead ? ' · dead' : ''}
                  {x.main ? ' · main' : ''}
                </small>
              </span>
            </button>
          ))}
        </div>
        {merc && <MercPanel key={String(merc.no)} db={db} m={m} merc={merc} mutate={mutate} />}
      </div>
    </>
  );
}

function MercPanel({ db, m, merc, mutate }: { db: GameDb; m: Model; merc: MercenaryView; mutate: EditorProps['mutate'] }): JSX.Element {
  const [sel, setSel] = useState<ObjNode | null>(null);
  const [picker, setPicker] = useState<null | { list: ObjList; mode: 'add' } | { node: ObjNode; mode: 'replace'; list: ObjList } | { node: ObjNode; mode: 'socket'; index: number }>(null);

  const listOf = (node: ObjNode): ObjList | null => (merc.equip?.items.includes(node) ? merc.equip : merc.inventory?.items.includes(node) ? merc.inventory : null);
  const selected = sel && listOf(sel) ? itemView(m, sel) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card">
        <h3>
          {merc.name || db.characterName(merc.characterKey)}
          <span className="right hint">{db.characterName(merc.characterKey)} · mercenary #{String(merc.no)}</span>
        </h3>
        <div className="grid cols-3" style={{ gap: 10 }}>
          <Field label="Level">
            <NumberField value={merc.level} min={1} max={9999} onChange={(v) => mutate((mm) => { const lv = mm.obj(merc.node, '_levelData'); if (lv) mm.set(lv, '_level', v); })} />
          </Field>
          <Field label="Experience">
            <NumberField value={Number(merc.exp)} min={0} max={9e15} onChange={(v) => mutate((mm) => { const lv = mm.obj(merc.node, '_levelData'); if (lv) mm.set(lv, '_exp', BigInt(v)); })} />
          </Field>
          <Field label="Unspent skill points">
            <NumberField value={merc.skillPoints} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(merc.node, '_remainSkillPoint', v))} />
          </Field>
          <Field label="Current HP" hint="0 = recalculated by the game">
            <NumberField value={merc.hp} min={0} max={999_999} onChange={(v) => mutate((mm) => mm.set(merc.node, '_currentHp', v))} />
          </Field>
          <Field label="Current MP">
            <NumberField value={merc.mp} min={0} max={999_999} onChange={(v) => mutate((mm) => mm.set(merc.node, '_currentMp', v))} />
          </Field>
          <Field label="Name">
            <input className="text-input" value={merc.name} placeholder={db.characterName(merc.characterKey)} onChange={(e) => mutate((mm) => mm.set(merc.node, '_mercenaryName', e.target.value))} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          <Toggle on={merc.dead} onChange={(v) => mutate((mm) => mm.set(merc.node, '_isDead', v ? 1 : 0))} label="Dead" />
          <Toggle on={merc.main} onChange={(v) => mutate((mm) => mm.set(merc.node, '_isMainMercenary', v ? 1 : 0))} label="Main companion" />
        </div>
      </div>

      <div className="equip" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {merc.equip && <ItemList db={db} m={m} title="Equipped" list={merc.equip} sel={sel} setSel={setSel} onAdd={() => setPicker({ list: merc.equip!, mode: 'add' })} />}
          {merc.inventory && <ItemList db={db} m={m} title="Inventory" list={merc.inventory} sel={sel} setSel={setSel} onAdd={() => setPicker({ list: merc.inventory!, mode: 'add' })} />}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {selected ? (
            <ItemPanel db={db} it={selected} mutate={mutate} onRemove={() => { mutate((mm) => { const l = listOf(selected.node); if (l) mm.remove(l, selected.node); }); setSel(null); }} onReplace={() => { const l = listOf(selected.node); if (l) setPicker({ node: selected.node, mode: 'replace', list: l }); }} onSocket={(i) => setPicker({ node: selected.node, mode: 'socket', index: i })} />
          ) : (
            <div className="empty">Select an item.</div>
          )}
        </div>
      </div>

      {picker && (
        <ItemPicker
          db={db}
          title={picker.mode === 'add' ? 'Add item' : picker.mode === 'replace' ? 'Replace with…' : `Socket ${picker.index + 1}: choose a gem`}
          filter={picker.mode === 'socket' ? (it) => it.g === 'gem' : undefined}
          onPick={(key) => {
            mutate((mm) => {
              if (picker.mode === 'add') {
                const it = createItem(mm, key, 1, picker.list.items[0] ?? anyItemTemplate(mm), db);
                const used = new Set(picker.list.items.map((x) => mm.num(x, '_slotNo')));
                let s = 0;
                while (used.has(s)) s++;
                mm.set(it, '_slotNo', s);
                picker.list.items.push(it);
                setSel(it);
              } else if (picker.mode === 'replace') {
                const old = itemView(mm, picker.node);
                const fresh = createItem(mm, key, old.count, picker.node, db);
                mm.set(fresh, '_slotNo', old.slot);
                const i = picker.list.items.indexOf(picker.node);
                if (i >= 0) picker.list.items[i] = fresh;
                setSel(fresh);
              } else setSocket(mm, picker.node, picker.index, key);
            });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function ItemList({ db, m, title, list, sel, setSel, onAdd }: { db: GameDb; m: Model; title: string; list: ObjList; sel: ObjNode | null; setSel: (n: ObjNode) => void; onAdd: () => void }): JSX.Element {
  return (
    <div className="card">
      <h3>
        {title}
        <span className="right">
          <span className="hint">{list.items.length} items</span>
          <button className="btn small gold" onClick={onAdd}>
            + Add
          </button>
        </span>
      </h3>
      <div className="tiles">
        {list.items.map((n) => {
          const it = itemView(m, n);
          return (
            <button key={String(it.no)} className={`tile ${sel === n ? 'selected' : ''}`} onClick={() => setSel(n)} title={`${db.itemName(it.key)} · slot ${it.slot}`}>
              <ItemIcon db={db} itemKey={it.key} size={64} radius={6} count={it.count} enchant={it.enchant} />
              {it.endurance < MAX_ENDURANCE && it.endurance > 0 && (
                <span className="dura">
                  <i style={{ width: `${(it.endurance / MAX_ENDURANCE) * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
        {!list.items.length && <div className="hint">Nothing here.</div>}
      </div>
    </div>
  );
}
