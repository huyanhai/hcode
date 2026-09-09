/// <reference types="vite/client" />

import type { DesktopInfo } from '../types/desktop'

declare global {
  const __APP_VERSION__: string

  interface Window {
    readonly desktop?: Readonly<DesktopInfo>
  }
}

export {}
