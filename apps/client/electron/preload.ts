import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopInfo } from '../types/desktop'

const fs = {
  list: (path: string, recursive = false) => ipcRenderer.invoke('fs:list', path, recursive),
  read: (path: string) => ipcRenderer.invoke('fs:read', path),
  write: (path: string, content: string, create = true) =>
    ipcRenderer.invoke('fs:write', path, content, create),
  rename: (path: string, newPath: string) => ipcRenderer.invoke('fs:rename', path, newPath),
  remove: (path: string, recursive = false) => ipcRenderer.invoke('fs:remove', path, recursive),
  mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
  stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
}

const shellBridge = {
  installedApps: (names: string[]) => ipcRenderer.invoke('shell:installed-apps', names),
  openWithApp: (appName: string, path: string) =>
    ipcRenderer.invoke('shell:open-with-app', appName, path),
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item-in-folder', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  githubUrl: (root: string) => ipcRenderer.invoke('git:github-url', root),
}

const desktop: DesktopInfo = {
  platform: process.platform,
  electronVersion: process.versions.electron,
  selectDirectory: () => ipcRenderer.invoke('workspace:select-directory'),
  fs,
  shell: shellBridge,
  captureWebview: (webContentsId: number) =>
    ipcRenderer.invoke('webview:capture', webContentsId),
  onWebviewNewWindow: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { senderId: number; url: string },
    ) => callback(payload)
    ipcRenderer.on('webview:new-window', listener)
    return () => ipcRenderer.removeListener('webview:new-window', listener)
  },
}

contextBridge.exposeInMainWorld('desktop', Object.freeze(desktop))
