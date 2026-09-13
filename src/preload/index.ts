import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { Api } from '../shared/ipc';

const api: Api = {
  scanDefaultFolder: () => ipcRenderer.invoke(IPC.scanDefaultFolder),
  openDialog: () => ipcRenderer.invoke(IPC.openDialog),
  describePath: (path) => ipcRenderer.invoke(IPC.describePath, path),
  readFile: (path) => ipcRenderer.invoke(IPC.readFile, path),
  writeSave: (path, data) => ipcRenderer.invoke(IPC.writeSave, path, data),
  revealInFolder: (path) => ipcRenderer.invoke(IPC.revealInFolder, path),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  gameDataUrl: () => ipcRenderer.invoke(IPC.gameDataUrl),
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    maximize: () => ipcRenderer.send(IPC.winMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    isMaximized: () => ipcRenderer.invoke(IPC.winIsMaximized),
    onMaximizedChange: (cb) => {
      const handler = (_e: unknown, v: boolean): void => cb(v);
      ipcRenderer.on(IPC.winMaximizedChanged, handler);
      return () => ipcRenderer.removeListener(IPC.winMaximizedChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
