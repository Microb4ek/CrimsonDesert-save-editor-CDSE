import { useCallback, useEffect, useState } from 'react';
import type { SaveFolderScan, SlotInfo } from '@shared/ipc';
import type { GameDb } from '../gamedata';
import { slotTitle } from '../lib/slots';

export function Welcome({ db, onOpen, notify }: { db: GameDb; onOpen: (path: string) => void; notify: (msg: string, kind?: 'ok' | 'err' | 'info') => void }): JSX.Element {
  const [scan, setScan] = useState<SaveFolderScan | null>(null);
  const [busy, setBusy] = useState(false);

  const rescan = useCallback(async () => {
    setBusy(true);
    try {
      setScan(await window.api.scanDefaultFolder());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void rescan();
  }, [rescan]);

  const browse = async (): Promise<void> => {
    const p = await window.api.openDialog();
    if (p) onOpen(p);
  };

  const isWin = scan?.platform === 'win32';
  const isLinux = scan?.platform === 'linux';
  const winPath = 'C:\\Users\\<you>\\AppData\\Local\\Pearl Abyss\\CD\\save\\<steam id>\\slot0\\save.save';
  const linuxPath = '~/.steam/steam/steamapps/compatdata/<app id>/pfx/drive_c/users/steamuser/AppData/Local/Pearl Abyss/CD/save/<steam id>/slot0/save.save';
  const manual = scan?.slots.filter((s) => s.slot < 100) ?? [];
  const autos = scan?.slots.filter((s) => s.slot >= 100) ?? [];

  return (
    <div className="welcome">
      <div className="hero">
        <div className="logo">
          <img src={db.iconUrl(1000578) ?? ''} alt="" />
        </div>
        <div>
          <h1>Crimson Desert Save Editor</h1>
          <p>Copper and bank, inventory, weapon and armour levels, sockets, companions, knowledge and quests — with the game's own icons.</p>
        </div>
      </div>

      <div className="welcome-grid">
        <div className="card">
          <h3>Where the save is</h3>
          <div className="steps">
            <div className="step">
              <span className="n">1</span>
              <div className="body">
                <b>Close the game</b>
                <p>Crimson Desert rewrites the slot when you exit; edits made while it runs will be lost. Save in game, quit to desktop, then edit.</p>
              </div>
            </div>
            <div className="step">
              <span className="n">2</span>
              <div className="body">
                <b>Find the slot folder</b>
                <p>
                  Each slot is a folder with <kbd>save.save</kbd> (the game) and <kbd>lobby.save</kbd> (what the load screen shows). Slots 1–3 are manual saves; slot folders numbered 100 and up are the game's rolling autosaves.
                </p>
                <div className="path-box">
                  <span>{isLinux ? linuxPath : winPath}</span>
                  {scan?.exists && (
                    <button className="btn small" onClick={() => window.api.openPath(scan.root)}>
                      Open folder
                    </button>
                  )}
                </div>
                <div className="crumbs">
                  {(isLinux ? ['~', '.steam', 'steam', 'steamapps', 'compatdata', '<app id>', 'pfx', 'drive_c', 'users', 'steamuser'] : ['C:', 'Users', '<you>']).map((c) => (
                    <span key={c} className="crumb">{c}</span>
                  ))}
                  <span className="crumb-sep">›</span>
                  <span className="crumb">AppData</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb">Local</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb">Pearl Abyss</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb">CD</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb">save</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb">{'<steam id>'}</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb hl">slot0</span>
                  <span className="crumb-sep">›</span>
                  <span className="crumb hl">save.save</span>
                </div>
                {isWin && <p style={{ marginTop: 8 }}>AppData is hidden by default: paste <kbd>%LOCALAPPDATA%\Pearl Abyss\CD\save</kbd> into the Explorer address bar.</p>}
              </div>
            </div>
            <div className="step">
              <span className="n">3</span>
              <div className="body">
                <b>Pick a slot on the right</b>
                <p>
                  Or use <b>Open file…</b> and choose <kbd>save.save</kbd>. Before every write the untouched original is copied to <kbd>CDSE-backups</kbd> inside the slot folder. If the game refuses to load a slot, copy the newest backup back over <kbd>save.save</kbd>.
                </p>
              </div>
            </div>
          </div>
          <div className="notice info" style={{ marginTop: 14 }}>
            Steam Cloud: if Steam shows a sync conflict after editing, choose to keep the <b>local</b> files. Turn cloud saves off for the game while experimenting if it keeps happening.
          </div>
        </div>

        <div className="card">
          <h3>
            Save slots
            <span className="right">
              <button className="btn small" onClick={rescan} disabled={busy}>
                {busy ? 'Scanning…' : 'Rescan'}
              </button>
              <button className="btn small gold" onClick={browse}>
                Open file…
              </button>
            </span>
          </h3>
          {!scan && <div className="empty">Looking for saves…</div>}
          {scan && !scan.exists && (
            <div className="notice">
              No save folder found at <b>{scan.root}</b>. Start the game once so it creates a slot, or open a save file manually.
            </div>
          )}
          {scan && scan.exists && !scan.slots.length && <div className="empty">The save folder exists but holds no slots yet.</div>}
          {scan && scan.slots.length > 0 && (
            <div className="saves-list">
              {manual.map((s) => (
                <SlotRow key={s.path} s={s} db={db} onOpen={onOpen} notify={notify} />
              ))}
              {autos.length > 0 && <div className="section-title">Autosaves <span className="count">{autos.length}</span></div>}
              {autos.map((s) => (
                <SlotRow key={s.path} s={s} db={db} onOpen={onOpen} notify={notify} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotRow({ s, db, onOpen, notify }: { s: SlotInfo; db: GameDb; onOpen: (p: string) => void; notify: (m: string, k?: 'ok' | 'err' | 'info') => void }): JSX.Element {
  const sum = s.summary;
  const when = sum?.generatedTime ? new Date(sum.generatedTime * 1000) : new Date(s.modifiedMs);
  const title = sum?.customName || (sum ? db.missionName(sum.missionKey) : 'Unreadable slot');
  return (
    <button
      className={`save-row ${s.error ? 'broken' : ''}`}
      onClick={() => {
        if (s.error) notify(s.error, 'err');
        else onOpen(s.path);
      }}
      title={s.path}
    >
      <span className={`slot ${s.slot >= 100 ? 'auto' : ''}`}>
        <small>{s.slot >= 100 ? 'AUTO' : 'SLOT'}</small>
        {s.slot >= 100 ? s.slot - 99 : s.slot + 1}
      </span>
      <span className="info">
        <span className="name">
          {title}
          {sum && <span className="tag">{db.characterName(sum.characterKey)}</span>}
          {s.error && <span className="tag warn">error</span>}
        </span>
        <span className="meta">
          <span>{when.toLocaleString()}</span>
          <span>{(s.size / 1024 / 1024).toFixed(1)} MB</span>
          {sum && <span>quest: {db.questName(sum.questKey)}</span>}
        </span>
      </span>
      <span className="right">
        <span>{slotTitle(s)}</span>
        {sum && <span style={{ color: 'var(--text-3)' }}>v{sum.gameSaveVersion} · #{sum.generateNo}</span>}
      </span>
    </button>
  );
}
