import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopInfo } from '../types/desktop'

const desktop: DesktopInfo = {
  platform: process.platform,
  electronVersion: process.versions.electron,
  selectDirectory: () => ipcRenderer.invoke('workspace:select-directory'),
  captureWebview: (webContentsId: number) =>
    ipcRenderer.invoke('webview:capture', webContentsId),
}

contextBridge.exposeInMainWorld('desktop', Object.freeze(desktop))
