import { spawn } from "node:child_process";
import { createWorkspacePathResolver } from "./workspace.js";

export type CommandResult = { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean };

export function executeWorkspaceCommand(context: { workspaceRoot: string }, command: string, requestedCwd = ".", timeoutMs = 30_000): Promise<CommandResult> {
  const cwd = createWorkspacePathResolver(context.workspaceRoot)(requestedCwd, { mustExist: true });
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, detached: process.platform !== "win32", env: { ...process.env, PWD: cwd } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maxOutput = 200_000;
    const timer = setTimeout(() => {
      timedOut = true;
      // POSIX 下结束整个进程组，避免 Shell 被终止后其子进程继续占用资源。
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    }, Math.max(1_000, timeoutMs));
    child.stdout.on("data", (chunk: Buffer) => { stdout = `${stdout}${chunk.toString()}`.slice(-maxOutput); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-maxOutput); });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    });
  });
}
