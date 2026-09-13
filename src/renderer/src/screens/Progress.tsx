import { useMemo, useState } from 'react';
import type { EditorProps } from '../App';
import { PageHead } from '../components/common';
import { KeyPicker } from '../components/KeyPicker';
import { missions, QUEST_STATE, quests } from '../lib/editor';

type Tab = 'missions' | 'quests';

export function Progress({ db, session, mutate, notify }: EditorProps): JSX.Element {
  const m = session.model;
  const [tab, setTab] = useState<Tab>('missions');
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<number>(-1);
  const [picker, setPicker] = useState(false);
  const ms = missions(m);
  const qs = quests(m);
  const needle = q.trim().toLowerCase();

  const missionOptions = useMemo(() => Object.entries(db.data.missions).map(([k, v]) => ({ key: Number(k), name: v.n, sub: v.i })), [db]);
  const questOptions = useMemo(() => Object.entries(db.data.quests).map(([k, v]) => ({ key: Number(k), name: v.n, sub: v.i })), [db]);

  const rows =
    tab === 'missions'
      ? (ms?.items ?? []).filter((x) => (stateFilter < 0 || x.state === stateFilter) && (!needle || db.missionName(x.key).toLowerCase().includes(needle) || (db.data.missions[String(x.key)]?.i ?? '').toLowerCase().includes(needle) || String(x.key).includes(needle)))
      : (qs?.items ?? []).filter((x) => (stateFilter < 0 || x.state === stateFilter) && (!needle || db.questName(x.key).toLowerCase().includes(needle) || (db.data.quests[String(x.key)]?.i ?? '').toLowerCase().includes(needle) || String(x.key).includes(needle)));

  const nameOf = (key: number): string => (tab === 'missions' ? db.missionName(key) : db.questName(key));
  const internalOf = (key: number): string => (tab === 'missions' ? db.data.missions[String(key)]?.i : db.data.quests[String(key)]?.i) ?? '';
  const have = new Set(rows.map((r) => r.key));

  return (
    <>
      <PageHead
        title="Quests"
        subtitle="Mission and quest states as the game tracks them. Setting a state to Completed skips it; be careful with main-story entries, the game expects its stages in order."
        actions={
          <>
            <div className="search" style={{ width: 240 }}>
              <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="text-input" style={{ width: 'auto' }} value={stateFilter} onChange={(e) => setStateFilter(Number(e.target.value))}>
              <option value={-1}>Any state</option>
              {QUEST_STATE.map((s, i) => (
                <option key={i} value={i}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn gold" onClick={() => setPicker(true)}>
              + Add entry…
            </button>
          </>
        }
      />
      <div className="tabs">
        <button className={tab === 'missions' ? 'active' : ''} onClick={() => setTab('missions')}>
          Missions <span className="n">{ms?.items.length ?? 0}</span>
        </button>
        <button className={tab === 'quests' ? 'active' : ''} onClick={() => setTab('quests')}>
          Quests <span className="n">{qs?.items.length ?? 0}</span>
        </button>
      </div>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Internal</th>
              <th>State</th>
              <th>Completed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 600).map((x) => (
              <tr key={x.key}>
                <td className="name">{nameOf(x.key)}</td>
                <td className="mono">{internalOf(x.key) || `#${x.key}`}</td>
                <td>
                  <select className="text-input" style={{ width: 170 }} value={x.state} onChange={(e) => mutate((mm) => mm.set(x.node, '_state', Number(e.target.value)))}>
                    {QUEST_STATE.map((s, i) => (
                      <option key={i} value={i}>
                        {s}
                      </option>
                    ))}
                    {x.state >= QUEST_STATE.length && <option value={x.state}>State {x.state}</option>}
                  </select>
                </td>
                <td className="mono">{x.completed ? 'yes' : '—'}</td>
                <td>
                  <button className="btn small danger" onClick={() => mutate((mm) => { const l = tab === 'missions' ? missions(mm)?.list : quests(mm)?.list; if (l) mm.remove(l, x.node); })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="hint">Nothing matches.</td>
              </tr>
            )}
            {rows.length > 600 && (
              <tr>
                <td colSpan={5} className="hint">{rows.length - 600} more — narrow the filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {picker && (
        <KeyPicker
          title={tab === 'missions' ? 'Add mission entry' : 'Add quest entry'}
          options={tab === 'missions' ? missionOptions : questOptions}
          exclude={have}
          onPick={(key) => {
            mutate((mm) => {
              if (tab === 'missions') {
                const l = missions(mm);
                if (!l) return;
                const n = mm.create('MissionStateData');
                mm.set(n, '_key', key);
                mm.set(n, '_state', 5);
                mm.set(n, '_completedTime', BigInt(Math.floor(Date.now() / 1000)));
                mm.set(n, '_completeCount', 1);
                l.list.items.push(n);
              } else {
                const l = quests(mm);
                if (!l) return;
                const n = mm.create('QuestStateData');
                mm.set(n, '_questKey', key);
                mm.set(n, '_state', 5);
                mm.set(n, '_completedTime', BigInt(Math.floor(Date.now() / 1000)));
                l.list.items.push(n);
              }
            });
            notify(`Added ${nameOf(key)} as completed`, 'ok');
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
