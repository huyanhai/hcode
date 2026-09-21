export interface DesktopInfo {
  platform: string
  electronVersion: string
  selectDirectory(): Promise<string | null>
}
