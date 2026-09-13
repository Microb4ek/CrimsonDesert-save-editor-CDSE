import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { NumberField, PageHead } from '../components/common';
import { KeyPicker } from '../components/KeyPicker';
import { addKnowledge, knowledge } from '../lib/editor';

export function Knowledge({ db, session, mutate, notify }: EditorProps): JSX.Element {
  const m = session.model;
  const k = knowledge(m);
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState(false);
  const unlockMarks = (() => {
    const root = m.root('SkillUnlockMarkSaveData');
    return root ? (m.vec(root, '_skillUnlockMarkList') as number[]) : [];
  })();

  const options = useMemo(() => Object.entries(db.data.knowledge).map(([key, v]) => ({ key: Number(key), name: v.n, sub: v.i })), [db]);
  const have = new Set((k?.items ?? []).map((x) => x.key));
  const needle = q.trim().toLowerCase();
  const rows = (k?.items ?? []).filter((x) => !needle || db.knowledgeName(x.key).toLowerCase().includes(needle) || (db.data.knowledge[String(x.key)]?.i ?? '').toLowerCase().includes(needle) || String(x.key).includes(needle));

  return (
    <>
      <PageHead
        title="Knowledge"
        sub={`${k?.items.length ?? 0} learned`}
        subtitle="Everything the character has learned: skills, techniques, lore and crafting knowledge, each with its level."
        actions={
          <>
            <div className="search" style={{ width: 240 }}>
              <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn small" onClick={() => mutate((mm) => { for (const x of knowledge(mm)?.items ?? []) mm.set(x.node, '_isNewMark', 0); })}>
              Clear "new" marks
            </button>
            <button className="btn gold" onClick={() => setPicker(true)}>
              + Learn…
            </button>
          </>
        }
      />
      {!k && <div className="notice warn">This save has no knowledge block.</div>}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Knowledge</th>
              <th>Internal</th>
              <th>Level</th>
              <th>Learned</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((x) => (
              <tr key={x.key}>
                <td className="name">{db.knowledgeName(x.key)}</td>
                <td className="mono">{db.data.knowledge[String(x.key)]?.i ?? `#${x.key}`}</td>
                <td>
                  <NumberField value={x.level} min={0} max={999} onChange={(v) => mutate((mm) => mm.set(x.node, '_level', v))} />
                </td>
                <td className="mono">{x.learned ? 'yes' : '—'}{x.newMark ? ' · new' : ''}</td>
                <td>
                  <button className="btn small danger" onClick={() => mutate((mm) => { const kk = knowledge(mm); if (kk) mm.remove(kk.list, x.node); })}>
                    Forget
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="hint">Nothing matches.</td>
              </tr>
            )}
            {rows.length > 500 && (
              <tr>
                <td colSpan={5} className="hint">{rows.length - 500} more — narrow the filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {unlockMarks.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Skill unlock marks</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {unlockMarks.map((s, i) => (
              <span key={i} className="chip" title={`skill ${s}`}>
                {db.skillName(s)}
              </span>
            ))}
          </div>
        </div>
      )}
      {picker && (
        <KeyPicker
          title="Learn knowledge"
          options={options}
          exclude={have}
          onPick={(key) => {
            mutate((mm) => addKnowledge(mm, key, 1));
            notify(`Learned ${db.knowledgeName(key)}`, 'ok');
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
