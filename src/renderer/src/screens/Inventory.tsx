import { useEffect, useMemo, useState } from 'react';
import type { ObjNode } from '@shared/parc';
import type { EditorProps } from '../App';
import { Field, ItemIcon, NumberField, TierTag, Toggle } from '../components/common';
import { ItemPicker } from '../components/ItemPicker';
import { fmt } from '../gamedata';
import type { GameDb } from '../gamedata';
import { addItem, bags, createItem, freeSlot, itemView, MAX_ENDURANCE, removeItem, setSocket, setStack } from '../lib/editor';
import type { Bag, ItemView } from '../lib/editor';

const BAG_ORDER = [2, 5, 8, 9, 10, 13, 18, 1, 14, 6, 7, 11, 12, 3, 4, 15, 16, 17, 19, 20];

export function Inventory({ db, session, mutate, notify, tick }: EditorProps): JSX.Element {
  const m = session.model;
  const all = bags(m);
  const ordered = [...all].sort((a, b) => (BAG_ORDER.indexOf(a.key) === -1 ? 99 : BAG_ORDER.indexOf(a.key)) - (BAG_ORDER.indexOf(b.key) === -1 ? 99 : BAG_ORDER.indexOf(b.key)));
  const [bagKey, setBagKey] = useState<number>(ordered[0]?.key ?? 2);
  const [sel, setSel] = useState<ObjNode | null>(null);
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; node: ObjNode } | { mode: 'socket'; node: ObjNode; index: number }>(null);
  const [addCount, setAddCount] = useState(1);

  const bag = ordered.find((b) => b.key === bagKey) ?? ordered[0];
  const items = useMemo(() => {
    if (!bag) return [];
    const needle = q.trim().toLowerCase();
    return bag.items.items
      .map((n) => itemView(m, n))
      .filter((it) => !needle || db.itemName(it.key).toLowerCase().includes(needle) || (db.item(it.key)?.i ?? '').toLowerCase().includes(needle) || String(it.key).includes(needle))
      .sort((a, b) => a.slot - b.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bag, m, q, db, tick]);

  useEffect(() => {
    if (sel && bag && !bag.items.items.includes(sel)) setSel(null);
  }, [sel, bag]);

  const selected = sel && bag?.items.items.includes(sel) ? itemView(m, sel) : null;

  const onPick = (key: number): void => {
    if (!picker || !bag) return;
    if (picker.mode === 'add') {
      mutate((mm) => {
        const n = addItem(mm, db, bag.key, key, addCount);
        setSel(n);
      });
      notify(`Added ${addCount > 1 ? `${addCount}× ` : ''}${db.itemName(key)}`, 'ok');
    } else if (picker.mode === 'replace') {
      mutate((mm) => {
        const old = itemView(mm, picker.node);
        const fresh = createItem(mm, key, old.count, picker.node, db);
        mm.set(fresh, '_slotNo', old.slot);
        const i = bag.items.items.indexOf(picker.node);
        if (i >= 0) bag.items.items[i] = fresh;
        setSel(fresh);
      });
    } else if (picker.mode === 'socket') {
      mutate((mm) => setSocket(mm, picker.node, picker.index, key));
    }
    setPicker(null);
  };

  return (
    <div className="inv">
      <div className="list">
        <div className="group">Bags</div>
        {ordered.map((b) => (
          <button key={b.key} className={`cont-btn ${bag?.key === b.key ? 'active' : ''}`} onClick={() => { setBagKey(b.key); setSel(null); }}>
            {db.bagName(b.key)}
            <span className="n">{b.items.items.length}</span>
          </button>
        ))}
        <div className="hint" style={{ margin: '14px 6px' }}>
          Bags are the game's inventory containers. The main inventory, quest items, warehouses and the bank vault all live here; the money bag holds camp resources and contribution tokens.
        </div>
      </div>

      <div className="stage">
        {bag ? (
          <>
            <div className="stage-head">
              <h2>{db.bagName(bag.key)}</h2>
              <span className="hint">
                {bag.items.items.length} stacks{bag.expand ? ` · ${bag.expand} extra slots` : ''} · bag {bag.key}
              </span>
              <div className="actions">
                <div className="search">
                  <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <NumberField value={addCount} min={1} max={999_999} onChange={setAddCount} className="w-count" />
                <button className="btn gold" onClick={() => setPicker({ mode: 'add' })}>
                  + Add item
                </button>
              </div>
            </div>
            <div className="tiles">
              {items.map((it) => (
                <Tile key={String(it.no) + ':' + it.slot} db={db} it={it} selected={selected?.node === it.node} onClick={() => setSel(it.node)} />
              ))}
              <button className="tile add" onClick={() => setPicker({ mode: 'add' })} title="Add an item">
                <span className="item-ic" style={{ width: 64, height: 64, borderRadius: 6 }}>+</span>
              </button>
            </div>
            {bag.key === 2 && bag.expand > 0 && <div className="hint">Inventory expansion: {bag.expand} bonus slots have been unlocked in game.</div>}
          </>
        ) : (
          <div className="empty">This save has no inventory block.</div>
        )}
      </div>

      <div className="side">
        {selected && bag ? (
          <ItemPanel db={db} bag={bag} it={selected} mutate={mutate} onRemove={() => { mutate((mm) => removeItem(mm, bag, selected.node)); setSel(null); }} onReplace={() => setPicker({ mode: 'replace', node: selected.node })} onSocket={(i) => setPicker({ mode: 'socket', node: selected.node, index: i })} onDuplicate={() => mutate((mm) => { const c = createItem(mm, selected.key, selected.count, selected.node, db); mm.set(c, '_enchantLevel', selected.enchant); mm.set(c, '_slotNo', freeSlot(mm, bag)); bag.items.items.push(c); setSel(c); })} allBags={ordered} onMove={(to) => mutate((mm) => { const target = ordered.find((b) => b.key === to)!; removeItem(mm, bag, selected.node); mm.set(selected.node, '_slotNo', freeSlot(mm, target)); target.items.items.push(selected.node); setSel(null); })} />
        ) : (
          <div className="empty">
            Select a stack to edit it.
            <div className="hint" style={{ marginTop: 10 }}>Stack size, enchant level, durability, sharpness and socket gems can be changed; any of the 6,000 game items can be added.</div>
          </div>
        )}
      </div>

      {picker && (
        <ItemPicker
          db={db}
          title={picker.mode === 'add' ? `Add to ${db.bagName(bag?.key ?? 0)}` : picker.mode === 'replace' ? 'Replace with…' : `Socket ${picker.index + 1}: choose a gem`}
          selected={picker.mode === 'replace' ? itemView(m, picker.node).key : null}
          filter={picker.mode === 'socket' ? (it) => it.g === 'gem' : undefined}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function Tile({ db, it, selected, onClick }: { db: GameDb; it: ItemView; selected: boolean; onClick: () => void }): JSX.Element {
  const info = db.item(it.key);
  const showDura = it.endurance > 0 && it.endurance < MAX_ENDURANCE && (info?.e || info?.g === 'weapon' || info?.g === 'armor');
  return (
    <button className={`tile ${selected ? 'selected' : ''}`} onClick={onClick} title={`${db.itemName(it.key)}\nslot ${it.slot} · #${it.no}`}>
      <ItemIcon db={db} itemKey={it.key} size={64} radius={6} count={it.count} enchant={it.enchant} />
      {showDura && (
        <span className="dura">
          <i style={{ width: `${(it.endurance / MAX_ENDURANCE) * 100}%` }} />
        </span>
      )}
    </button>
  );
}

export function ItemPanel({
  db,
  bag,
  it,
  mutate,
  onRemove,
  onReplace,
  onSocket,
  onDuplicate,
  allBags,
  onMove,
}: {
  db: GameDb;
  bag?: Bag;
  it: ItemView;
  mutate: EditorProps['mutate'];
  onRemove: () => void;
  onReplace: () => void;
  onSocket: (index: number) => void;
  onDuplicate?: () => void;
  allBags?: Bag[];
  onMove?: (bagKey: number) => void;
}): JSX.Element {
  const info = db.item(it.key);
  const gear = !!info?.e;
  const maxEnchant = info?.me ?? 0;
  return (
    <>
      <div className="item-head">
        <ItemIcon db={db} itemKey={it.key} size={64} radius={8} />
        <div style={{ minWidth: 0 }}>
          <h2>{db.itemName(it.key)}</h2>
          <small>
            {info?.i ?? 'unknown item'} · key {it.key} · #{String(it.no)}
          </small>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            {info && <TierTag tier={info.t} />}
            <span className="hint">{info?.e ?? db.groupLabel(info?.g)}</span>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: 10 }}>
        <Field label="Stack" hint={info?.s ? `game max ${fmt(info.s)}` : undefined}>
          <NumberField value={it.count} min={0} max={9_000_000_000} onChange={(v) => mutate((mm) => setStack(mm, it.node, v))} />
        </Field>
        <Field label="Slot no.">
          <NumberField value={it.slot} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(it.node, '_slotNo', v))} />
        </Field>
        <Field label="Enchant level" hint={maxEnchant ? `game max +${maxEnchant}` : gear ? 'no enchant data for this item' : undefined}>
          <NumberField value={it.enchant} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(it.node, '_enchantLevel', v))} />
        </Field>
        <Field label="Durability" hint={`${MAX_ENDURANCE} = full`}>
          <NumberField value={it.endurance} min={0} max={MAX_ENDURANCE} step={1000} onChange={(v) => mutate((mm) => mm.set(it.node, '_endurance', v))} />
        </Field>
        <Field label="Sharpness" hint={info?.ms ? `game max ${info.ms}` : undefined}>
          <NumberField value={it.sharpness} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(it.node, '_sharpness', v))} />
        </Field>
        <Field label="Average price">
          <NumberField value={it.averagePrice} min={0} max={9_000_000_000} onChange={(v) => mutate((mm) => mm.set(it.node, '_averagePrice', BigInt(v)))} />
        </Field>
      </div>
      <div className="quick">
        <button className="chip" onClick={() => mutate((mm) => mm.set(it.node, '_endurance', MAX_ENDURANCE))}>
          Repair
        </button>
        {maxEnchant > 0 && (
          <button className="chip" onClick={() => mutate((mm) => mm.set(it.node, '_enchantLevel', maxEnchant))}>
            Max enchant +{maxEnchant}
          </button>
        )}
        {info?.ms ? (
          <button className="chip" onClick={() => mutate((mm) => mm.set(it.node, '_sharpness', info.ms!))}>
            Sharpen
          </button>
        ) : null}
        {info?.s && info.s > 1 ? (
          <button className="chip" onClick={() => mutate((mm) => setStack(mm, it.node, info.s))}>
            Full stack ({fmt(info.s)})
          </button>
        ) : null}
      </div>

      <div className="section-title">
        Sockets <span className="count">{it.validSockets} of {it.maxSockets} unlocked</span>
      </div>
      <div className="sockets">
        {Array.from({ length: Math.max(it.maxSockets, it.sockets.length, 1) }).map((_, i) => {
          const s = it.sockets[i];
          const open = i < it.validSockets;
          return (
            <button key={i} className={`socket ${s?.key ? 'filled' : ''} ${open || s?.key ? '' : 'off'}`} onClick={() => onSocket(i)} title={s?.key ? `${db.itemName(s.key)} — click to change, right-click to clear` : open ? 'Empty socket — click to add a gem' : 'Locked socket — click to add a gem anyway'} onContextMenu={(e) => { e.preventDefault(); if (s?.key) mutate((mm) => setSocket(mm, it.node, i, 0)); }}>
              {s?.key ? <img src={db.iconUrl(s.key) ?? ''} alt="" /> : <span className="hint">{i + 1}</span>}
            </button>
          );
        })}
      </div>
      <div className="grid cols-2" style={{ gap: 10 }}>
        <Field label="Unlocked sockets">
          <NumberField value={it.validSockets} min={0} max={it.maxSockets || 5} onChange={(v) => mutate((mm) => mm.set(it.node, '_validSocketCount', v))} />
        </Field>
        <Field label="Max sockets">
          <NumberField value={it.maxSockets} min={0} max={5} onChange={(v) => mutate((mm) => mm.set(it.node, '_maxSocketCount', v))} />
        </Field>
      </div>

      <div className="section-title">Flags</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Toggle on={it.locked} onChange={(v) => mutate((mm) => mm.set(it.node, '_isLocked', v ? 1 : 0))} label="Locked" />
        <Toggle on={it.newMark} onChange={(v) => mutate((mm) => mm.set(it.node, '_isNewMark', v ? 1 : 0))} label="New" />
      </div>

      <div className="section-title">Actions</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={onReplace}>
          Replace item…
        </button>
        {onDuplicate && (
          <button className="btn small" onClick={onDuplicate}>
            Duplicate
          </button>
        )}
        {allBags && onMove && bag && (
          <select className="text-input" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && onMove(Number(e.target.value))}>
            <option value="">Move to…</option>
            {allBags.filter((b) => b.key !== bag.key).map((b) => (
              <option key={b.key} value={b.key}>
                {db.bagName(b.key)}
              </option>
            ))}
          </select>
        )}
        <button className="btn small danger" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="hint">Durability {fmt(MAX_ENDURANCE)} means the item is intact. Enchant is the "+N" upgrade level shown in game.</div>
    </>
  );
}
