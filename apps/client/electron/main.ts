import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import { join } from "node:path";

/** 切换某个 webview 自己的 DevTools（独立窗口，和主窗口的 DevTools 互不影响） */
function toggleWebviewDevTools(contents: Electron.WebContents): void {
  if (contents.isDestroyed()) return;
  if (contents.isDevToolsOpened()) {
    contents.closeDevTools();
    return;
  }
  contents.openDevTools({ mode: "detach" });
}

// <webview> 里 target="_blank" / window.open 的链接默认会被静默丢弃，
// 这里改成在当前 webview 内直接加载
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void contents.loadURL(url).catch(() => undefined);
    }
    return { action: "deny" };
  });

  // 焦点在网页内部时，F12 / Cmd(Ctrl)+Shift+I 切换该 webview 的调试窗口
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const isToggleKey =
      input.key === "F12" ||
      (input.key.toLowerCase() === "i" &&
        (input.control || input.meta) &&
        input.shift);
    if (!isToggleKey) return;
    event.preventDefault();
    toggleWebviewDevTools(contents);
  });
});

async function createWindow(): Promise<void> {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    title: "Code Client",
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    show: false,
    transparent: isMac ? true : false, // 关键：开启窗口透明
    frame: false, // 关键：移除默认窗口边框和标题栏
    titleBarStyle: "hiddenInset", // 或 'hidden' 或 'customButtonsOnHover'
    vibrancy: isMac ? "header" : undefined,
    backgroundMaterial: isMac ? undefined : "mica",
    visualEffectState: "active",
    roundedCorners: true,
    trafficLightPosition: {
      y: 17,
      x: 10,
    },
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  // window.webContents.openDevTools({ mode: "detach" });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function handleStartupError(error: unknown): void {
  console.error("Unable to open Code Client:", error);
  app.quit();
}

app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => {
        callback(false);
      },
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    ipcMain.handle("workspace:select-directory", async (event) => {
      const result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender)!,
        {
          properties: ["openDirectory", "createDirectory"],
        },
      );
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin"
          ? [{ role: "appMenu" as const }]
          : []),
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]),
    );

    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow().catch(handleStartupError);
      }
    });
  })
  .catch(handleStartupError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
