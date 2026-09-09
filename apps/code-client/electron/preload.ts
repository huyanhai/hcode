import { contextBridge } from 'electron'
import type { DesktopInfo } from '../types/desktop'

const desktop: DesktopInfo = {
  platform: process.platform,
  electronVersion: process.versions.electron,
}

contextBridge.exposeInMainWorld('desktop', Object.freeze(desktop))
