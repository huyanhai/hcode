import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopInfo } from '../types/desktop'
import type { Command, RuntimeResponse, AgentEvent } from '@hcode/agent-protocol'

const desktop: DesktopInfo = {
  platform: process.platform,
  electronVersion: process.versions.electron,
}

contextBridge.exposeInMainWorld('desktop', Object.freeze(desktop))

contextBridge.exposeInMainWorld('agent', {
  request: (command: Command): Promise<RuntimeResponse> => ipcRenderer.invoke('agent:request', command),
  selectWorkspace: (): Promise<string | null> => ipcRenderer.invoke('agent:select-workspace'),
  onEvent: (listener: (event: AgentEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => listener(payload)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
})
