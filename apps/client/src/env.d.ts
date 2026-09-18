/// <reference types="vite/client" />

import type { DesktopInfo } from '../types/desktop'
import type { AgentEvent, Command, RuntimeResponse } from '@hcode/agent-protocol'

declare global {
  const __APP_VERSION__: string

  interface Window {
    readonly desktop?: Readonly<DesktopInfo>
    readonly agent?: {
      request(command: Command): Promise<RuntimeResponse>
      selectWorkspace(): Promise<string | null>
      onEvent(listener: (event: AgentEvent) => void): () => void
    }
  }
}

export {}
