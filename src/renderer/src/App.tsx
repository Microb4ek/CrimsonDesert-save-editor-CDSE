import { useCallback, useEffect, useState } from 'react';
import { openSave, sealSave } from '@shared/cdcrypto';
import type { SaveContainer } from '@shared/cdcrypto';
import { parseParc, serializeParc } from '@shared/parc';
import { Model } from '@shared/cdmodel';
import type { SlotInfo } from '@shared/ipc';
import { loadGameData } from './gamedata';
import type { GameDb } from './gamedata';
import { TitleBar } from './components/TitleBar';
import { Welcome } from './screens/Welcome';
import { Overview } from './screens/Overview';
import { Inventory } from './screens/Inventory';
import { Equipment } from './screens/Equipment';
import { Companions } from './screens/Companions';
import { Knowledge } from './screens/Knowledge';
import { Progress } from './screens/Progress';
import { Explorer } from './screens/Explorer';
import { character, maxItemNo, moneyLines, validate } from './lib/editor';
import { slotTitle } from './lib/slots';
import { fmt } from './gamedata';

type Screen = 'overview' | 'inventory' | 'equipment' | 'companions' | 'knowledge' | 'progress' | 'explorer';

interface Toast {
  id: number;
  msg: string;
  detail?: string;
  kind: 'ok' | 'err' | 'info';
}

export interface Session {
  path: string;
  info: SlotInfo | null;
  container: SaveContainer;
  model: Model;
  /** lobby.save next to the save: carries the item-number counter (_generateNo) that must stay >= every _itemNo */
  lobby: { path: string; container: SaveContainer; model: Model } | null;
}

export interface EditorProps {
  db: GameDb;
  session: Session;
  /** Mutate the model in place, then re-render everything. */
  mutate: (fn: (m: Model) => void) => void;
  notify: (msg: string, kind?: 'ok' | 'err' | 'info', detail?: string) => void;
  /** re-render counter; screens can use it as a dependency */
  tick: number;
}

const NAV: Array<{ id: Screen; label: string; icon: number }> = [
  { id: 'overview', label: 'Character & wallet', icon: 1 },
  { id: 'inventory', label: 'Inventory', icon: 6005 },
  { id: 'equipment', label: 'Equipment', icon: 1000057 },
  { id: 'companions', label: 'Companions', icon: 1513009 },
  { id: 'knowledge', label: 'Knowledge', icon: 1002086 },
  { id: 'progress', label: 'Quests', icon: 802286 },
  { id: 'explorer', label: 'Raw data', icon: 1000389 },
];

export default function App(): JSX.Element {
  const [db, setDb] = useState<GameDb | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tick, setTick] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [screen, setScreen] = useState<Screen>('overview');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadGameData()
      .then(setDb)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const notify = useCallback((msg: string, kind: 'ok' | 'err' | 'info' = 'info', detail?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, detail, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 9000 : 4500);
  }, []);

  const mutate = useCallback(
    (fn: (m: Model) => void) => {
      if (!session) return;
      try {
        fn(session.model);
        setDirty(true);
      } catch (e) {
        notify('Edit failed', 'err', e instanceof Error ? e.message : String(e));
      }
      setTick((t) => t + 1);
    },
    [session, notify],
  );

  const open = useCallback(
    async (path: string) => {
      try {
        const info = await window.api.describePath(path);
        const savePath = info?.path ?? path;
        const raw = await window.api.readFile(savePath);
        const container = openSave(raw);
        const model = new Model(parseParc(container.blob));
        let lobby: Session['lobby'] = null;
        const lobbyPath = info?.lobbyPath ?? savePath.replace(/save\.save$/i, 'lobby.save');
        try {
          const lraw = await window.api.readFile(lobbyPath);
          const lc = openSave(lraw);
          lobby = { path: lobbyPath, container: lc, model: new Model(parseParc(lc.blob)) };
        } catch {
          lobby = null;
        }
        setSession({ path: savePath, info, container, model, lobby });
        setDirty(false);
        setScreen('overview');
        if (!container.hmacOk) notify('Integrity check failed', 'err', 'The HMAC of this save does not match. It may have been edited by another tool or damaged; saving will re-sign it.');
      } catch (e) {
        notify('Could not open save', 'err', e instanceof Error ? e.message : String(e));
      }
    },
    [notify],
  );

  const save = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      if (db) {
        const problems = validate(session.model, db);
        if (problems.length) throw new Error(`The game would crash on this save:\n${problems.slice(0, 6).join('\n')}${problems.length > 6 ? `\n… ${problems.length - 6} more` : ''}`);
      }
      const blob = serializeParc(session.model.doc);
      parseParc(blob); // must round-trip before touching the disk
      const bytes = sealSave(session.container, blob);
      const check = openSave(bytes);
      if (!check.hmacOk || check.blob.length !== blob.length) throw new Error('self-check of the sealed file failed');
      const res = await window.api.writeSave(session.path, bytes);
      if (res.ok) {
        setDirty(false);
        notify('Save written', 'ok', res.backupPath ? `Backup: ${res.backupPath}` : undefined);
        // keep the lobby's item counter ahead of every item number we may have created
        if (session.lobby) {
          const l = session.lobby;
          const lobbyObj = l.model.root('LobbySaveData');
          const maxNo = maxItemNo(session.model);
          if (lobbyObj && l.model.big(lobbyObj, '_generateNo') < maxNo) {
            l.model.set(lobbyObj, '_generateNo', maxNo);
            const lres = await window.api.writeSave(l.path, sealSave(l.container, serializeParc(l.model.doc)));
            if (!lres.ok) notify('lobby.save could not be updated', 'err', lres.error);
          }
        }
      } else notify('Save failed - file left untouched', 'err', res.error);
    } catch (e) {
      notify('Save failed - file left untouched', 'err', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [session, notify, db]);

  const close = useCallback(() => {
    if (dirty && !window.confirm('You have unsaved changes. Close this save anyway?')) return;
    setSession(null);
    setDirty(false);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __cdse: unknown }).__cdse = { open, session: () => session };
  }, [open, session]);

  if (loadError) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Game data could not be loaded: {loadError}</div>
      </div>
    );
  }
  if (!db) {
    return (
      <div className="app">
        <TitleBar />
        <div className="loading">Loading game data…</div>
      </div>
    );
  }

  const props: EditorProps | null = session ? { db, session, mutate, notify, tick } : null;
  const ch = session ? character(session.model) : null;
  const money = session ? moneyLines(session.model) : null;
  const slotLabel = session ? slotTitle(session.info) : '';

  return (
    <div className="app">
      <TitleBar fileName={session ? `${slotLabel} · save.save` : undefined} dirty={dirty} />
      {!session || !props ? (
        <div className="content">
          <Welcome db={db} onOpen={open} notify={(m, k) => notify(m, k ?? 'info')} />
        </div>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="save-card">
              <div className="title">{slotLabel}</div>
              <div className="sub" title={session.path}>
                {session.info?.summary?.customName || (session.info?.summary ? db.missionName(session.info.summary.missionKey) : session.path)}
              </div>
              <div className="stats">
                <span className="pill" title="Copper">
                  <img src={db.iconUrl(1) ?? ''} alt="" />
                  {fmt(money?.copper.count ?? 0)}
                </span>
                {ch && <span className="pill">{db.characterName(ch.characterKey)}</span>}
              </div>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <button key={n.id} className={screen === n.id ? 'active' : ''} onClick={() => setScreen(n.id)}>
                  <span className="ico">
                    <img src={db.iconUrl(n.icon) ?? ''} alt="" />
                  </span>
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="bottom">
              <button className="btn primary block" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
              </button>
              <button className="btn ghost block" onClick={close}>
                Close save
              </button>
              <div className="hint">
                Ctrl+S saves. A copy of the original goes to <b>CDSE-backups</b> inside the slot folder before every write. Close the game first.
              </div>
            </div>
          </aside>
          {screen === 'inventory' ? (
            <div className="content no-pad">
              <Inventory {...props} />
            </div>
          ) : (
            <div className="content">
              {screen === 'overview' && <Overview {...props} />}
              {screen === 'equipment' && <Equipment {...props} />}
              {screen === 'companions' && <Companions {...props} />}
              {screen === 'knowledge' && <Knowledge {...props} />}
              {screen === 'progress' && <Progress {...props} />}
              {screen === 'explorer' && <Explorer {...props} />}
            </div>
          )}
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <b>{t.msg}</b>
            {t.detail && <small>{t.detail}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
