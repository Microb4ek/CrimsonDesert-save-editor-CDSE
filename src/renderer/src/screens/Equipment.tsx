import { useState } from 'react';
import type { EditorProps } from '../App';
import { ItemIcon, PageHead } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import type { EquipSlotDef } from '../gamedata';
import { character, equipItem, equipment, itemView, MAX_ENDURANCE, setSocket, unequip } from '../lib/editor';
import { ItemPanel } from './Inventory';

export function Equipment({ db, session, mutate, notify }: EditorProps): JSX.Element {
  const m = session.model;
  const ch = character(m);
  const defs = db.equipSlots(ch?.characterKey ?? 1);
  const eq = equipment(m);
  const [selSlot, setSelSlot] = useState<number | null>(null);
  const [picker, setPicker] = useState<null | { slot: number; def?: EquipSlotDef } | { socket: number; slot: number }>(null);

  const bySlot = new Map((eq?.slots ?? []).map((e) => [e.slot, e]));
  const known = new Set(defs.map((d) => d.slot));
  const extra = (eq?.slots ?? []).filter((e) => !known.has(e.slot)).map((e) => ({ slot: e.slot, label: `Slot ${e.slot}`, types: [], hashes: [] as number[] }));
  const allDefs = [...defs, ...extra];
  const selected = selSlot !== null ? bySlot.get(selSlot) : undefined;

  const filterFor = (def?: EquipSlotDef) => (def && def.hashes.length ? (it: { eh?: number }) => !!it.eh && def.hashes.includes(it.eh) : undefined);

  return (
    <>
      <PageHead
        title="Equipment"
        sub={ch ? db.characterName(ch.characterKey) : undefined}
        subtitle="Every equip slot of the player character. Click a slot to change the item, its upgrade level, durability and gems."
        actions={
          <>
            <button className="btn small" onClick={() => mutate((mm) => { for (const e of equipment(mm)?.slots ?? []) mm.set(e.item.node, '_endurance', MAX_ENDURANCE); })}>
              Repair all
            </button>
            <button
              className="btn small"
              onClick={() =>
                mutate((mm) => {
                  let n = 0;
                  for (const e of equipment(mm)?.slots ?? []) {
                    const me = db.item(e.item.key)?.me ?? 0;
                    if (me > e.item.enchant) { mm.set(e.item.node, '_enchantLevel', me); n++; }
                  }
                  notify(n ? `${n} items set to their maximum enchant` : 'Everything is already at max enchant', 'ok');
                })
              }
            >
              Max enchant all
            </button>
          </>
        }
      />
      {!eq && <div className="notice warn">This save has no equipment block.</div>}
      <div className="equip">
        <div className="equip-grid">
          {allDefs.map((d) => {
            const e = bySlot.get(d.slot);
            const info = e ? db.item(e.item.key) : undefined;
            return (
              <button key={d.slot} className={`equip-slot ${selSlot === d.slot ? 'selected' : ''}`} onClick={() => { setSelSlot(d.slot); if (!e) setPicker({ slot: d.slot, def: d }); }} title={d.types.join(', ')}>
                {e ? <ItemIcon db={db} itemKey={e.item.key} size={52} radius={7} enchant={e.item.enchant} /> : <span className="item-ic empty" style={{ width: 52, height: 52, borderRadius: 7 }}>{d.types[0]?.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ').slice(-1)[0] ?? 'empty'}</span>}
                <span className="t">
                  <span className="slotname">{d.label}</span>
                  <span className="nm">{e ? db.itemName(e.item.key) : 'Empty'}</span>
                  <span className="hp">
                    {e ? `${info?.e ?? ''}${e.item.enchant ? ` · +${e.item.enchant}` : ''} · ${Math.round((e.item.endurance / MAX_ENDURANCE) * 100)}%` : d.types.slice(0, 3).join(' / ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
          {selected ? (
            <ItemPanel db={db} it={selected.item} mutate={mutate} onRemove={() => { mutate((mm) => unequip(mm, selected.slot)); setSelSlot(null); }} onReplace={() => setPicker({ slot: selected.slot, def: defs.find((d) => d.slot === selected.slot) })} onSocket={(i) => setPicker({ socket: i, slot: selected.slot })} />
          ) : selSlot !== null ? (
            <div className="empty">
              Empty slot.
              <div style={{ marginTop: 10 }}>
                <button className="btn gold" onClick={() => setPicker({ slot: selSlot, def: defs.find((d) => d.slot === selSlot) })}>
                  Equip an item…
                </button>
              </div>
            </div>
          ) : (
            <div className="empty">Select a slot.</div>
          )}
        </div>
      </div>

      {picker && 'def' in picker && (
        <ItemPicker
          db={db}
          title={`${picker.def?.label ?? `Slot ${picker.slot}`}: choose an item`}
          selected={bySlot.get(picker.slot)?.item.key ?? null}
          filter={filterFor(picker.def)}
          onPick={(key) => {
            mutate((mm) => equipItem(mm, db, picker.slot, key));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker && 'socket' in picker && (
        <ItemPicker
          db={db}
          title={`Socket ${picker.socket + 1}: choose a gem`}
          filter={(it) => it.g === 'gem'}
          onPick={(key) => {
            mutate((mm) => {
              const e = equipment(mm)?.slots.find((x) => x.slot === picker.slot);
              if (e) setSocket(mm, itemView(mm, e.item.node).node, picker.socket, key);
            });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
