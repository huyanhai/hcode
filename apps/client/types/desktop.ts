export interface DesktopInfo {
  platform: string
  electronVersion: string
  selectDirectory(): Promise<string | null>
  /** 在主进程对指定 webview 渲染进程截图，返回 PNG base64；失败返回空串 */
  captureWebview(webContentsId: number): Promise<string>
  /** 订阅 webview 内新开标签（target="_blank"）；返回取消订阅函数 */
  onWebviewNewWindow(
    callback: (payload: { senderId: number; url: string }) => void,
  ): () => void
}
