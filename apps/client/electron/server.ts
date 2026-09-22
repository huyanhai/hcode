import { app } from "electron";
import { fork } from "node:child_process";
import path from "node:path";

export function startServer() {
  let serverPath: string;

  if (app.isPackaged) {
    // 生产环境：从 resources/server 下启动
    serverPath = path.join(process.resourcesPath, "server", "main.js");
  } else {
    // 开发环境：指向本地源码目录
    serverPath = path.join(__dirname, "../../server/dist/main.js");
  }

  const serverProcess = fork(serverPath, [], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3000" },
  });

  return serverProcess;
}
