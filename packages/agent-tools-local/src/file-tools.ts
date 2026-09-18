import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createWorkspacePathResolver } from "./workspace.js";

export type FileToolContext = { workspaceRoot: string };

export async function listFiles(context: FileToolContext, requestedPath = "."): Promise<string[]> {
  const resolvePath = createWorkspacePathResolver(context.workspaceRoot);
  const root = resolvePath(requestedPath, { mustExist: true });
  const entries = await readdir(root, { withFileTypes: true });
  return entries.map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name).sort();
}

export async function readWorkspaceFile(context: FileToolContext, requestedPath: string): Promise<{ path: string; content: string }> {
  const resolvePath = createWorkspacePathResolver(context.workspaceRoot);
  const path = resolvePath(requestedPath, { mustExist: true });
  return { path: requestedPath, content: await readFile(path, "utf8") };
}

export async function writeWorkspaceFile(context: FileToolContext, requestedPath: string, content: string): Promise<{ path: string; bytes: number }> {
  const resolvePath = createWorkspacePathResolver(context.workspaceRoot);
  const path = resolvePath(requestedPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return { path: requestedPath, bytes: Buffer.byteLength(content) };
}

export async function applyWorkspacePatch(context: FileToolContext, requestedPath: string, patch: string): Promise<{ path: string; bytes: number }> {
  const resolvePath = createWorkspacePathResolver(context.workspaceRoot);
  const path = resolvePath(requestedPath, { mustExist: true });
  const original = await readFile(path, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const hasFinalNewline = original.endsWith("\n");
  const originalLines = original.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const patchLines = patch.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let originalIndex = 0;
  let patchIndex = patchLines.findIndex((line) => line.startsWith("@@ "));
  if (patchIndex < 0) throw new Error("Patch does not contain a unified diff hunk");

  // 每个 hunk 都校验旧文件行号、上下文和删除内容。只要补丁基于的文件版本不一致，
  // 就整体拒绝写入，避免部分应用后留下无法预测的文件状态。
  while (patchIndex < patchLines.length) {
    const header = patchLines[patchIndex];
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
    if (!match) throw new Error(`Invalid patch hunk header: ${header}`);
    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? "1");
    const newCount = Number(match[4] ?? "1");
    const targetIndex = Math.max(0, oldStart - 1);
    if (targetIndex < originalIndex || targetIndex > originalLines.length) throw new Error("Patch hunk is outside the target file");
    output.push(...originalLines.slice(originalIndex, targetIndex));
    originalIndex = targetIndex;
    patchIndex += 1;
    let consumed = 0;
    let produced = 0;

    while (patchIndex < patchLines.length && !patchLines[patchIndex].startsWith("@@ ")) {
      const line = patchLines[patchIndex];
      if (line.startsWith("\\ No newline at end of file")) { patchIndex += 1; continue; }
      const marker = line[0];
      const value = line.slice(1);
      if (marker === " " || marker === "-") {
        if (originalLines[originalIndex] !== value) throw new Error(`Patch context mismatch at line ${originalIndex + 1}`);
        originalIndex += 1;
        consumed += 1;
        if (marker === " ") { output.push(value); produced += 1; }
      } else if (marker === "+") {
        output.push(value);
        produced += 1;
      } else if (line !== "") {
        throw new Error(`Invalid patch line: ${line}`);
      }
      patchIndex += 1;
    }
    if (consumed !== oldCount || produced !== newCount) throw new Error("Patch hunk line counts do not match its header");
  }

  output.push(...originalLines.slice(originalIndex));
  const content = `${output.join(eol)}${hasFinalNewline ? eol : ""}`;
  await writeFile(path, content, "utf8");
  return { path: requestedPath, bytes: Buffer.byteLength(content) };
}

export async function searchWorkspaceFiles(context: FileToolContext, query: string, requestedPath = "."): Promise<Array<{ path: string; line: number; text: string }>> {
  const resolvePath = createWorkspacePathResolver(context.workspaceRoot);
  const root = resolvePath(requestedPath, { mustExist: true });
  const results: Array<{ path: string; line: number; text: string }> = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else {
        const info = await stat(fullPath);
        if (info.size > 1024 * 1024) continue;
        const content = await readFile(fullPath, "utf8").catch(() => null);
        if (content === null) continue;
        content.split(/\r?\n/).forEach((text, index) => {
          if (text.toLowerCase().includes(query.toLowerCase())) results.push({ path: fullPath.slice(root.length + 1), line: index + 1, text: text.trim().slice(0, 400) });
        });
      }
    }
  }

  await visit(root);
  return results.slice(0, 200);
}
