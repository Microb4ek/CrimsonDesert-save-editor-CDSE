import { useMemo, useState } from 'react';
import { useEscape } from './common';

export interface KeyOption { key: number; name: string; sub?: string }

/** Generic searchable list of (key, name) pairs, for knowledge / missions / quests. */
export function KeyPicker({ title, options, exclude, onPick, onClose }: { title: string; options: KeyOption[]; exclude?: Set<number>; onPick: (key: number) => void; onClose: () => void }): JSX.Element {
  const [q, setQ] = useState('');
  useEscape(onClose);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options.filter((o) => !exclude?.has(o.key)).filter((o) => !needle || o.name.toLowerCase().includes(needle) || (o.sub ?? '').toLowerCase().includes(needle) || String(o.key).includes(needle)).slice(0, 500);
  }, [options, exclude, q]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" style={{ height: 'min(700px, 90vh)' }}>
        <div className="head">
          <h2>{title}</h2>
          <div className="search">
            <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="row-list" style={{ overflow: 'auto', padding: '0 18px 18px', minHeight: 0 }}>
          {list.map((o) => (
            <button key={o.key} className="row click" onClick={() => onPick(o.key)} style={{ textAlign: 'left' }}>
              <span className="t">
                {o.name}
                <small>
                  {o.sub ? `${o.sub} · ` : ''}#{o.key}
                </small>
              </span>
            </button>
          ))}
          {!list.length && <div className="empty">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
