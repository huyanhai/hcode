import { app, Menu, session, BrowserWindow } from "electron";
import { join } from "node:path";
import { RuntimeBridge } from "./runtime-bridge";

const runtimeBridge = new RuntimeBridge();

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
    vibrancy: isMac ? "under-window" : undefined, 
    backgroundMaterial: isMac ? undefined : "mica",
    visualEffectState: "followWindow",
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
    runtimeBridge.registerIpc();
    runtimeBridge.start();
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => {
        callback(false);
      },
    );
    session.defaultSession.setPermissionCheckHandler(() => false);

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
  runtimeBridge.stop();
  if (process.platform !== "darwin") app.quit();
});
