export function registerIpc(webview: HTMLElement, cb?: EventListener) {
  webview.addEventListener("ipc-message", cb as EventListener);
}

export function unregisterIpc(webview: HTMLElement, cb?: EventListener) {
  webview.removeEventListener("ipc-message", cb as EventListener);
}