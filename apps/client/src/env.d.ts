/// <reference types="vite/client" />

import type { DesktopInfo } from '../types/desktop'

type AgentEvent = Record<string, unknown>
type Command = Record<string, unknown>
type RuntimeResponse = Record<string, unknown>

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
