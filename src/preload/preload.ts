import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('asp', {
  api: (method: string, body?: unknown) => ipcRenderer.invoke('api', method, body),
  upload: (body: unknown) => ipcRenderer.invoke('upload', body),
  openFile: (kind: string) => ipcRenderer.invoke('file:open', kind),
  saveFile: (kind: string, suggested: string, content: string, existingPath?: string) => ipcRenderer.invoke('file:save', kind, suggested, content, existingPath),
  backup: (content: string) => ipcRenderer.invoke('backup', content),
  platform: process.platform,
});
