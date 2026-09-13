import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SaveFolderScan, SlotInfo, WriteResult } from '../shared/ipc';
import { summarizeLobby } from '../shared/summary';

const STEAM_APP_ID = '3321460';
const SAVE_SUBDIR = ['AppData', 'Local', 'Pearl Abyss', 'CD', 'save'];
export const BACKUP_DIR = 'CDSE-backups';

function linuxSteamRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, '.steam', 'root'),
  ];
}

function steamLibraries(steamRoot: string): string[] {
  const libs = new Set<string>([steamRoot]);
  try {
    const text = fs.readFileSync(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
  } catch {
    /* no vdf */
  }
  return [...libs];
}

/**
 * Windows: %LOCALAPPDATA%\Pearl Abyss\CD\save\<steam account id>\slotN\{save,lobby}.save
 * Linux/SteamOS (Proton): <library>/steamapps/compatdata/<appid>/pfx/drive_c/users/steamuser/AppData/Local/Pearl Abyss/CD/save
 */
export function defaultSaveRoots(): string[] {
  if (process.platform === 'win32') return [path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Pearl Abyss', 'CD', 'save')];
  if (process.platform === 'linux') {
    const out: string[] = [];
    for (const root of linuxSteamRoots()) {
      if (!fs.existsSync(root)) continue;
      for (const lib of steamLibraries(root)) {
        const compat = path.join(lib, 'steamapps', 'compatdata');
        const ids = [STEAM_APP_ID];
        // the app id is not certain; also scan every prefix that contains the save folder
        try {
          for (const d of fs.readdirSync(compat)) if (!ids.includes(d) && fs.existsSync(path.join(compat, d, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR))) ids.push(d);
        } catch {
          /* no compatdata */
        }
        for (const id of ids) {
          const p = path.join(compat, id, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR);
          if (!out.includes(p)) out.push(p);
        }
      }
    }
    if (!out.length) out.push(path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata', STEAM_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', ...SAVE_SUBDIR));
    return out.sort((a, b) => Number(fs.existsSync(b)) - Number(fs.existsSync(a)));
  }
  return [path.join(os.homedir(), 'Library', 'Application Support', 'Pearl Abyss', 'CD', 'save')];
}

export function defaultSaveRoot(): string {
  return defaultSaveRoots()[0];
}

function describeSlot(dir: string, account: string): SlotInfo | null {
  const savePath = path.join(dir, 'save.save');
  const lobbyPath = path.join(dir, 'lobby.save');
  if (!fs.existsSync(savePath)) return null;
  const st = fs.statSync(savePath);
  const m = /slot(\d+)$/i.exec(path.basename(dir));
  const info: SlotInfo = {
    path: savePath,
    lobbyPath,
    folder: dir,
    account,
    slot: m ? Number(m[1]) : -1,
    size: st.size,
    modifiedMs: st.mtimeMs,
    summary: null,
    error: null,
  };
  try {
    if (fs.existsSync(lobbyPath)) info.summary = summarizeLobby(new Uint8Array(fs.readFileSync(lobbyPath)));
  } catch (e) {
    info.error = e instanceof Error ? e.message : String(e);
  }
  return info;
}

export function listSlots(roots: string[]): SlotInfo[] {
  const slots: SlotInfo[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const acct of fs.readdirSync(root, { withFileTypes: true })) {
      if (!acct.isDirectory()) continue;
      const acctDir = path.join(root, acct.name);
      for (const s of fs.readdirSync(acctDir, { withFileTypes: true })) {
        if (!s.isDirectory() || !/^slot\d+$/i.test(s.name)) continue;
        const info = describeSlot(path.join(acctDir, s.name), acct.name);
        if (info) slots.push(info);
      }
    }
  }
  slots.sort((a, b) => b.modifiedMs - a.modifiedMs);
  return slots;
}

export function scanFolders(roots: string[]): SaveFolderScan {
  const existing = roots.filter((r) => fs.existsSync(r));
  return { root: existing[0] ?? roots[0], roots, exists: existing.length > 0, slots: listSlots(roots), platform: process.platform };
}

export function readSave(file: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(file));
}

/** Slot folder -> info, or a bare save.save/lobby.save path -> its slot. */
export function describePath(p: string): SlotInfo | null {
  const dir = fs.statSync(p).isDirectory() ? p : path.dirname(p);
  return describeSlot(dir, path.basename(path.dirname(dir)));
}

function backupPathFor(filePath: string): string {
  const dir = path.join(path.dirname(filePath), BACKUP_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${path.basename(filePath, '.save')}.${stamp}.save`);
}

export function writeSave(filePath: string, data: Uint8Array): WriteResult {
  try {
    const backupPath = fs.existsSync(filePath) ? backupPathFor(filePath) : undefined;
    if (backupPath) fs.copyFileSync(filePath, backupPath);
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filePath);
    return { ok: true, backupPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
