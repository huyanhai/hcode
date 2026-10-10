import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  defineExtension,
  hook,
  LiveDoc,
  ToolTask,
  type Harness,
} from "@earendil-works/pi-durable";
import { ApprovalDoc, PermissionDoc, SessionDoc, pause } from "./documents.js";
import type { PiPersistence } from "./types.js";

function inside(root: string, candidate: string): boolean {
  const part = relative(root, candidate);
  return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}

/** Resolve the existing ancestor so a symlink cannot carry read/write/edit outside an allowed root. */
async function canonical(path: string): Promise<string> {
  let ancestor = path;
  while (true) {
    try {
      const real = await realpath(ancestor);
      return resolve(real, relative(ancestor, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

/** Decisions live in a Pi document so a restarted ToolTask can read them again. */
export function createPolicy(forKind: (kind: PiPersistence) => Harness) {
  return defineExtension({
    name: "hcode-policy",
    hooks: [
      hook(ToolTask, {
        beforeTool: async (call, api, context) => {
          const session = await api.snapshot(
            SessionDoc,
            api.conversationId,
            context,
          );
          if (!session) return { block: "会话配置不存在" };
          if (["read", "write", "edit"].includes(call.name)) {
            const path = String(
              (call.arguments as { path?: unknown }).path ?? "",
            );
            const target = await canonical(
              resolve(session.workspacePath, path),
            );
            const roots = await Promise.all(
              session.folders.map((folder) => canonical(resolve(folder))),
            );
            if (!roots.some((folder) => inside(folder, target)))
              return { block: "路径不在工作区内" };
          }
          const live = await api.snapshot(LiveDoc, api.conversationId, context);
          const permission = await api.snapshot(PermissionDoc, api.conversationId, context);
          const activeInput = live?.run?.inputs[0];
          const fullAccess = activeInput === undefined
            ? session.fullAccess
            : (permission?.bySubmission[String(activeInput)] ?? session.fullAccess);
          if (call.name === "read" || fullAccess) return undefined;
          const harness = forKind(session.persistence);
          const taskId = String(api.taskId);
          const approvals = await harness.snapshot(
            ApprovalDoc,
            api.conversationId,
            context,
          );
          if (!approvals?.byTask[taskId])
            await harness.commit(async (tx) => {
              (await tx.doc(ApprovalDoc, api.conversationId)).byTask[taskId] = {
                callId: call.id,
                toolName: call.name,
                input: JSON.stringify(call.arguments),
                status: "pending",
              };
            }, context);
          while (!context.abortSignal?.aborted) {
            const state = await harness.snapshot(
              ApprovalDoc,
              api.conversationId,
              context,
            );
            if (state?.byTask[taskId]?.status === "approved") return undefined;
            if (state?.byTask[taskId]?.status === "denied")
              return { block: "用户拒绝执行" };
            await pause(200);
          }
          return { block: "审批已取消" };
        },
      }),
    ],
  });
}
