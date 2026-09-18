import { createOpenAI } from "@ai-sdk/openai";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { ModelProfile } from "@hcode/agent-protocol";
import {
  executeWorkspaceCommand,
  applyWorkspacePatch,
  gitDiff,
  gitLog,
  gitStatus,
  listFiles,
  readWorkspaceFile,
  searchWorkspaceFiles,
  writeWorkspaceFile,
} from "@hcode/agent-tools-local";

export type AgentContext = { workspaceRoot: string; permissionMode?: "restricted" | "full" };
export type ApprovalDecisions = Record<string, boolean>;
export type CoreStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "approval"; approvalId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "finish"; text: string; responseMessages: unknown[]; awaitingApproval: boolean }
  | { type: "error"; error: Error };

function createTools(context: AgentContext, approvals: ApprovalDecisions) {
  void approvals;
  return {
    listFiles: tool({
      description: "List files in the workspace.",
      inputSchema: z.object({ path: z.string().default(".") }),
      execute: ({ path }) => listFiles(context, path),
    }),
    readFile: tool({
      description: "Read a UTF-8 text file in the workspace.",
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) => readWorkspaceFile(context, path),
    }),
    searchFiles: tool({
      description: "Search text across workspace files.",
      inputSchema: z.object({ query: z.string(), path: z.string().default(".") }),
      execute: ({ query, path }) => searchWorkspaceFiles(context, query, path),
    }),
    writeFile: tool({
      description: "Write UTF-8 content to a workspace file. Requires approval.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      needsApproval: context.permissionMode !== "full",
      execute: ({ path, content }) => writeWorkspaceFile(context, path, content),
    }),
    applyPatch: tool({
      description: "Apply a unified diff to one existing workspace file. Requires approval.",
      inputSchema: z.object({ path: z.string(), patch: z.string() }),
      needsApproval: context.permissionMode !== "full",
      execute: ({ path, patch }) => applyWorkspacePatch(context, path, patch),
    }),
    execCommand: tool({
      description: "Run a shell command in the workspace. Requires approval.",
      inputSchema: z.object({ command: z.string(), cwd: z.string().default("."), timeoutMs: z.number().int().positive().max(120000).default(30000) }),
      needsApproval: context.permissionMode !== "full",
      execute: ({ command, cwd, timeoutMs }) => executeWorkspaceCommand(context, command, cwd, timeoutMs),
    }),
    gitStatus: tool({
      description: "Show git status.",
      inputSchema: z.object({}),
      execute: () => gitStatus(context),
    }),
    gitDiff: tool({
      description: "Show git diff.",
      inputSchema: z.object({}),
      execute: () => gitDiff(context),
    }),
    gitLog: tool({
      description: "Show recent git commits.",
      inputSchema: z.object({}),
      execute: () => gitLog(context),
    }),
  };
}

export function createAgent(profile: ModelProfile, context: AgentContext, approvals: ApprovalDecisions = {}) {
  const provider = createOpenAI({ apiKey: profile.apiKey, baseURL: profile.baseUrl });
  const tools = createTools(context, approvals);
  // 将默认步数限制固定在 20，避免异常模型持续调用工具造成无限成本。
  return new ToolLoopAgent({
    // 自定义 Base URL 通常只实现 OpenAI Chat Completions 协议；显式选择 chat，
    // 避免新版 Provider 默认改走 Responses API 后破坏兼容服务。
    model: provider.chat(profile.model),
    instructions: "You are a local coding agent. Work only inside the provided workspace. Explain actions briefly and never claim a tool succeeded without its result.",
    tools,
    stopWhen: stepCountIs(20),
  });
}

export async function* streamAgent(
  profile: ModelProfile,
  context: AgentContext,
  messages: unknown[],
  approvals: ApprovalDecisions = {},
  abortSignal?: AbortSignal,
): AsyncGenerator<CoreStreamEvent> {
  try {
    const agent = createAgent(profile, context, approvals);
    const result = await agent.stream({ messages: messages as never, abortSignal });
    let finalText = "";
    let awaitingApproval = false;
    for await (const part of result.fullStream) {
      const chunk = part as Record<string, unknown>;
      if (chunk.type === "text-delta") {
        const text = String(chunk.text ?? "");
        finalText += text;
        if (text) yield { type: "text", text };
      } else if (chunk.type === "tool-call") {
        yield { type: "tool-call", toolCallId: String(chunk.toolCallId), toolName: String(chunk.toolName), input: chunk.input };
      } else if (chunk.type === "tool-approval-request") {
        awaitingApproval = true;
        const toolCall = chunk.toolCall as Record<string, unknown>;
        yield { type: "approval", approvalId: String(chunk.approvalId), toolCallId: String(toolCall.toolCallId), toolName: String(toolCall.toolName), input: toolCall.input };
      } else if (chunk.type === "tool-result") {
        yield { type: "tool-result", toolCallId: String(chunk.toolCallId), toolName: String(chunk.toolName), output: chunk.output };
      } else if (chunk.type === "error") {
        yield { type: "error", error: chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error)) };
      }
    }
    const response = await result.response;
    yield { type: "finish", text: finalText, responseMessages: response.messages as unknown[], awaitingApproval };
  } catch (error) {
    yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) };
  }
}
