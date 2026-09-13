import { useMemo, useState } from 'react';
import type { GameDb, GameItem } from '../gamedata';
import { TIER_COLOR, TIER_LABEL } from '../gamedata';
import { ItemIcon, useEscape } from './common';

const PAGE = 400;

export function ItemPicker({
  db,
  title,
  selected,
  filter,
  onPick,
  onClose,
}: {
  db: GameDb;
  title: string;
  selected?: number | null;
  /** optional predicate to narrow the list (e.g. equip slot compatibility) */
  filter?: (it: GameItem) => boolean;
  onPick: (key: number) => void;
  onClose: () => void;
}): JSX.Element {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [tier, setTier] = useState<number>(-1);
  const [showHidden, setShowHidden] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useEscape(onClose);

  const base = useMemo(() => db.data.items.filter((it) => !filter || filter(it)), [db, filter]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((it) => showHidden || (it.ic && !it.blocked && !/^(test|dev_|wolf_test)/i.test(it.i) && !/\btest\b/i.test(it.n)))
      .filter((it) => group === 'all' || it.g === group)
      .filter((it) => tier < 0 || it.t === tier)
      .filter((it) => !needle || it.n.toLowerCase().includes(needle) || it.i.toLowerCase().includes(needle) || String(it.k).includes(needle) || (it.e ?? '').toLowerCase().includes(needle));
  }, [base, q, group, tier, showHidden]);

  const groupsPresent = new Set(base.map((it) => it.g));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="head">
          <h2>{title}</h2>
          <div className="search">
            <input autoFocus placeholder="Search items… (name, internal name, key or type)" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          </div>
          <label className={`toggle ${showHidden ? 'on' : ''}`} onClick={() => setShowHidden(!showHidden)}>
            <span className="sw" /> Hidden / test items
          </label>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="cats">
          <button className={`chip ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>
            All
          </button>
          {db.data.groups.filter((g) => groupsPresent.has(g.id)).map((g) => (
            <button key={g.id} className={`chip ${group === g.id ? 'active' : ''}`} onClick={() => { setGroup(g.id); setLimit(PAGE); }} style={{ borderColor: group === g.id ? g.color : undefined }}>
              <span className="dot" style={{ background: g.color }} />
              {g.label}
            </button>
          ))}
          <span className="tiers">
            {[-1, 0, 1, 2, 3, 4, 5].map((t) => (
              <button key={t} className={`chip small ${tier === t ? 'active' : ''}`} onClick={() => setTier(t)} style={{ color: t >= 0 ? TIER_COLOR[t] : undefined }}>
                {t < 0 ? 'Any tier' : TIER_LABEL[t]}
              </button>
            ))}
          </span>
          <span className="hint" style={{ marginLeft: 'auto' }}>
            {list.length} items
          </span>
        </div>
        <div className="items">
          {list.slice(0, limit).map((it) => (
            <button key={it.k} className={`pick ${selected === it.k ? 'selected' : ''}`} onClick={() => onPick(it.k)} title={`${it.i}\nkey ${it.k}${it.e ? `\n${it.e}` : ''}`}>
              <ItemIcon db={db} itemKey={it.k} size={60} />
              <span>{it.n}</span>
              <span className="sz">
                {it.e ?? db.groupLabel(it.g)}
                {it.s > 1 ? ` · ×${it.s}` : ''}
              </span>
            </button>
          ))}
          {list.length > limit && (
            <button className="btn ghost block" style={{ gridColumn: '1 / -1' }} onClick={() => setLimit(limit + PAGE)}>
              Show more ({list.length - limit} left)
            </button>
          )}
          {!list.length && <div className="empty">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
