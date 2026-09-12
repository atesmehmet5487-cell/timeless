/**
 * Renderer ile main process arasındaki tek köprü.
 * Node API'leri sayfaya açılmaz; yalnızca buradaki işlevler görünür.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  db: {
    read: () => ipcRenderer.invoke('db:read'),
    write: (data: unknown) => ipcRenderer.invoke('db:write', data),
    patch: (patch: unknown) => ipcRenderer.invoke('db:patch', patch),
  },
  notify: {
    scheduleReminders: (reminders: unknown[]) => ipcRenderer.invoke('notify:schedule', reminders),
    cancelReminders: () => ipcRenderer.invoke('notify:cancel'),
    notifyNow: (title: string, body: string) => ipcRenderer.invoke('notify:now', title, body),
  },
  window: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('app:openPath', path),
    showItemInFolder: (path: string) => ipcRenderer.invoke('app:showItemInFolder', path),
  },
};

contextBridge.exposeInMainWorld('timeless', api);

export type TimelessApi = typeof api;
