import type { SlotSummary } from './summary';

export interface SlotInfo {
  /** save.save */
  path: string;
  lobbyPath: string;
  folder: string;
  account: string;
  slot: number;
  size: number;
  modifiedMs: number;
  summary: SlotSummary | null;
  error: string | null;
}

export interface SaveFolderScan {
  root: string;
  roots: string[];
  exists: boolean;
  slots: SlotInfo[];
  platform: NodeJS.Platform;
}

export interface WriteResult {
  ok: boolean;
  backupPath?: string;
  error?: string;
}

export interface Api {
  scanDefaultFolder(): Promise<SaveFolderScan>;
  openDialog(): Promise<string | null>;
  describePath(path: string): Promise<SlotInfo | null>;
  readFile(path: string): Promise<Uint8Array>;
  /** Backs up the original next to it, then writes atomically. */
  writeSave(path: string, data: Uint8Array): Promise<WriteResult>;
  revealInFolder(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  gameDataUrl(): Promise<string>;
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(cb: (isMax: boolean) => void): () => void;
  };
}

export const IPC = {
  scanDefaultFolder: 'save:scanDefaultFolder',
  openDialog: 'save:openDialog',
  describePath: 'save:describe',
  readFile: 'save:read',
  writeSave: 'save:write',
  revealInFolder: 'shell:reveal',
  openPath: 'shell:openPath',
  gameDataUrl: 'game:dataUrl',
  winMinimize: 'win:minimize',
  winMaximize: 'win:maximize',
  winClose: 'win:close',
  winIsMaximized: 'win:isMaximized',
  winMaximizedChanged: 'win:maximizedChanged',
} as const;
