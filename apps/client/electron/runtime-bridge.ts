import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import type { Command, RuntimeResponse } from "@hcode/agent-protocol";

type RuntimeEnvelope = { type: "response"; response: RuntimeResponse } | { type: "event"; event: unknown };

export class RuntimeBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, {
    resolve: (response: RuntimeResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  start(): void {
    if (this.process) return;
    const currentDirectory = dirname(__dirname);
    const runtimePath = app.isPackaged
      ? join(process.resourcesPath, "agent-runtime", "dist", "index.cjs")
      : join(currentDirectory, "../../agent-runtime/dist/index.cjs");
    this.process = spawn(process.execPath, [runtimePath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", HCODE_DB_PATH: join(app.getPath("userData"), "data", "hcode.db") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = createInterface({ input: this.process.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    this.process.stderr.on("data", (chunk) => console.error("Agent runtime:", chunk.toString()));
    this.process.once("exit", () => {
      this.process = null;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Agent runtime exited"));
      }
      this.pending.clear();
    });
  }

  stop(): void { this.process?.kill(); this.process = null; }

  request(command: Command): Promise<RuntimeResponse> {
    this.start();
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin.writable) { reject(new Error("Agent runtime is unavailable")); return; }
      const timeout = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new Error(`Agent request timed out: ${command.type}`));
      }, 15_000);
      this.pending.set(command.requestId, { resolve, reject, timeout });
      this.process.stdin.write(`${JSON.stringify(command)}\n`, (error) => {
        if (error) { clearTimeout(timeout); this.pending.delete(command.requestId); reject(error); }
      });
    });
  }

  async selectWorkspace(): Promise<string | null> {
    const window = BrowserWindow.getFocusedWindow();
    const options = { properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory"> };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  registerIpc(): void {
    ipcMain.handle("agent:request", (_event, command: Command) => this.request(command));
    ipcMain.handle("agent:select-workspace", () => this.selectWorkspace());
  }

  private handleLine(line: string): void {
    try {
      const envelope = JSON.parse(line) as RuntimeEnvelope;
      if (envelope.type === "response") {
        const pending = this.pending.get(envelope.response.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(envelope.response.requestId);
          pending.resolve(envelope.response);
        }
      }
      else for (const window of BrowserWindow.getAllWindows()) window.webContents.send("agent:event", envelope.event);
    } catch (error) { console.error("Invalid agent runtime output", error); }
  }
}
