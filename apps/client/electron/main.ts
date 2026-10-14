import { app, BrowserWindow, dialog, ipcMain, Menu, session, webContents } from "electron";
import { join } from "node:path";

/**
 * webview 截图必须在主进程执行：
 * <webview>.capturePage() 会让宿主渲染进程崩溃（V8 Empty MaybeLocal，Electron 44 实测复现）。
 * 这里校验目标必须是 webview guest，避免被用来截任意窗口。
 */
ipcMain.handle("webview:capture", async (_event, webContentsId: number) => {
  const guest = webContents.fromId(Number(webContentsId));
  if (!guest || guest.isDestroyed() || guest.getType() !== "webview") return "";
  // 不带 rect 的 capturePage() 会截下整个文档（含滚动区外内容）。
  // capturePage 的 rect 是视口坐标：固定从可视区左上角截 clientWidth×clientHeight，
  // 与滚动位置无关（此前用 scrollY 当 y，页面滚动后 rect 超出视口会得到空图而回退整页截图）
  try {
    const rect = (await guest.executeJavaScript(
      "({x:0,y:0,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight})",
      true,
    )) as { x: number; y: number; width: number; height: number };
    if (rect && rect.width > 0 && rect.height > 0) {
      const image = await guest.capturePage(rect);
      if (image && !image.isEmpty()) return image.toPNG().toString("base64");
    }
  } catch {
    // 测量可视区失败时回退到整页截图
  }
  const image = await guest.capturePage();
  return image ? image.toPNG().toString("base64") : "";
});

/** 渲染进程崩溃日志，便于排查白屏类问题 */
app.on("render-process-gone", (_event, contents, details) => {
  if (details.reason === "clean-exit") return;
  console.error(
    `[client] render-process-gone type=${contents.getType()} reason=${details.reason} exitCode=${details.exitCode}`,
  );
});

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

  window.webContents.openDevTools({ mode: "detach" });

  window.webContents.on("will-attach-webview", (_event, webPreferences) => {
    webPreferences.preload = join(
      __dirname,
      "../webview-preload/webview-preload.cjs",
    );
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

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
