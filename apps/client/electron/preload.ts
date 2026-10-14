import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopInfo } from '../types/desktop'

const desktop: DesktopInfo = {
  platform: process.platform,
  electronVersion: process.versions.electron,
  selectDirectory: () => ipcRenderer.invoke('workspace:select-directory'),
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
