import OpenAI from "openai";
import type { Response, ResponseStreamEvent } from "openai/resources/responses/responses";
import {
  OpenAIResponseStreamAdapter,
  type AgentContinuation,
  type CoreStreamEvent,
  type PendingToolCall,
} from "./openai-stream-adapter";
export type {
  AgentContinuation,
  CoreStreamEvent,
  PendingToolCall,
  StreamAdapter,
  StreamState,
} from "./openai-stream-adapter";
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

export type AgentContext = {
  workspaceRoot: string;
  permissionMode?: "restricted" | "full";
};
export type ModelProfile = { id: string; name: string; provider: string; model: string; baseUrl: string; apiKey: string; isDefault: boolean; createdAt: number; updatedAt: number };
export type ApprovalDecisions = Record<string, boolean>;

type ToolDefinition = {
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval?: boolean;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type FunctionCall = PendingToolCall;

const instructions =
  "You are a local coding agent. Work only inside the provided workspace. " +
  "Use tools for workspace inspection and changes. Explain actions briefly and never claim a tool succeeded without its result.";

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function createTools(context: AgentContext): Record<string, ToolDefinition> {
  const requiresApproval = context.permissionMode !== "full";
  return {
    listFiles: {
      description: "List files in the workspace.",
      parameters: objectSchema({ path: { type: "string", description: "Workspace-relative path." } }),
      execute: (input) => listFiles(context, String(input.path ?? ".")),
    },
    readFile: {
      description: "Read a UTF-8 text file in the workspace.",
      parameters: objectSchema({ path: { type: "string" } }, ["path"]),
      execute: (input) => readWorkspaceFile(context, String(input.path)),
    },
    searchFiles: {
      description: "Search text across workspace files.",
      parameters: objectSchema(
        { query: { type: "string" }, path: { type: "string", description: "Workspace-relative path." } },
        ["query"],
      ),
      execute: (input) => searchWorkspaceFiles(context, String(input.query), String(input.path ?? ".")),
    },
    writeFile: {
      description: "Write UTF-8 content to a workspace file.",
      parameters: objectSchema({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]),
      requiresApproval,
      execute: (input) => writeWorkspaceFile(context, String(input.path), String(input.content)),
    },
    applyPatch: {
      description: "Apply a unified diff to one existing workspace file.",
      parameters: objectSchema({ path: { type: "string" }, patch: { type: "string" } }, ["path", "patch"]),
      requiresApproval,
      execute: (input) => applyWorkspacePatch(context, String(input.path), String(input.patch)),
    },
    execCommand: {
      description: "Run a shell command in the workspace.",
      parameters: objectSchema(
        {
          command: { type: "string" },
          cwd: { type: "string", description: "Workspace-relative working directory." },
          timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
        },
        ["command"],
      ),
      requiresApproval,
      execute: (input) =>
        executeWorkspaceCommand(
          context,
          String(input.command),
          String(input.cwd ?? "."),
          Number(input.timeoutMs ?? 30000),
        ),
    },
    gitStatus: {
      description: "Show the current git status.",
      parameters: objectSchema({}),
      execute: () => gitStatus(context),
    },
    gitDiff: {
      description: "Show the current git diff.",
      parameters: objectSchema({}),
      execute: () => gitDiff(context),
    },
    gitLog: {
      description: "Show recent git commits.",
      parameters: objectSchema({}),
      execute: () => gitLog(context),
    },
  };
}

function openaiTools(tools: Record<string, ToolDefinition>) {
  return Object.entries(tools).map(([name, definition]) => ({
    type: "function" as const,
    name,
    description: definition.description,
    parameters: definition.parameters,
    strict: false,
  }));
}

function inputMessages(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    const value = message as Record<string, unknown>;
    const role = value.role === "system" ? "developer" : value.role;
    return { role, content: [{ type: "input_text", text: String(value.content ?? "") }] };
  });
}

function itemCall(item: unknown): FunctionCall | null {
  if (!item || typeof item !== "object") return null;
  const value = item as Record<string, unknown>;
  if (value.type !== "function_call") return null;
  return {
    callId: String(value.call_id ?? value.id ?? ""),
    itemId: String(value.id ?? value.call_id ?? ""),
    name: String(value.name ?? ""),
    arguments: String(value.arguments ?? ""),
  };
}

function responseItems(response: Response): unknown[] {
  return Array.isArray(response.output) ? (response.output as unknown[]) : [];
}

function responseText(response: Response): string {
  const direct = (response as Response & { output_text?: string }).output_text;
  if (direct) return direct;
  return responseItems(response)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => (part && typeof part === "object" ? String((part as Record<string, unknown>).text ?? "") : ""))
    .join("");
}

export function createAgent(profile: ModelProfile, context: AgentContext) {
  const client = new OpenAI({ apiKey: profile.apiKey, baseURL: profile.baseUrl });
  const tools = createTools(context);
  return { client, tools };
}

export async function* streamAgent(
  profile: ModelProfile,
  context: AgentContext,
  messages: unknown[],
  approvals: ApprovalDecisions = {},
  abortSignal?: AbortSignal,
  streamOutput = true,
  continuation?: AgentContinuation,
): AsyncGenerator<CoreStreamEvent> {
  const { client, tools } = createAgent(profile, context);
  let conversation = continuation?.conversation ?? inputMessages(messages);
  let finalText = continuation?.finalText ?? "";
  let pendingToolCalls = continuation?.pendingToolCalls ?? [];
  let pendingOutputs = continuation?.toolOutputs ?? [];

  try {
    for (let step = 0; step < 20; step += 1) {
      let stepCalls = pendingToolCalls;
      if (!stepCalls.length) {
        const request = {
          model: profile.model,
          instructions,
          input: conversation as never,
          tools: openaiTools(tools) as never,
          reasoning: { summary: "auto" },
          stream: streamOutput,
        };
        const result = await client.responses.create(request as never, { signal: abortSignal });
        let response: Response | undefined;
        const calls = new Map<string, FunctionCall>();

        if (!streamOutput) {
          response = result as Response;
          const outputText = responseText(response);
          if (outputText) {
            finalText += outputText;
            yield { type: "text", text: outputText };
          }
          for (const item of responseItems(response)) {
            const call = itemCall(item);
            if (call) stepCalls.push(call);
          }
        }
        const adapter = new OpenAIResponseStreamAdapter();
        for await (const providerEvent of (streamOutput ? result : []) as unknown as AsyncIterable<ResponseStreamEvent>) {
          for (const event of adapter.adapt(providerEvent)) {
            if (event.type === "text") {
              finalText += event.text;
            } else if (event.type === "tool-call") {
              const call: FunctionCall = {
                callId: event.toolCallId,
                itemId: event.itemId ?? event.toolCallId,
                name: event.toolName,
                arguments: event.rawArguments ?? "",
              };
              calls.set(call.itemId, call);
              calls.set(call.callId, call);
              stepCalls.push(call);
            } else if (event.type === "tool-call-delta") {
              const call = calls.get(event.itemId ?? "") ?? calls.get(event.toolCallId);
              if (call) call.arguments = event.arguments ?? `${call.arguments}${event.delta}`;
            } else if (event.type === "response-lifecycle" && event.phase === "completed" && event.response) {
              response = event.response as Response;
            }
            yield event;
          }
        }

        if (!response) break;
        if (!stepCalls.length) {
          stepCalls = responseItems(response)
            .map(itemCall)
            .filter((call): call is FunctionCall => Boolean(call));
        }
        if (!stepCalls.length) break;
        conversation = [...conversation, ...responseItems(response)];
      }

      const outputs = [...pendingOutputs];
      const nextPendingToolCalls: FunctionCall[] = [];
      for (const call of stepCalls) {
        const definition = tools[call.name];
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        } catch {
          const output = { error: "Invalid JSON arguments" };
          outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
          continue;
        }
        if (!definition) {
          const output = { error: `Unknown tool: ${call.name}` };
          outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
          continue;
        }
        const approvalId = `${call.callId}:approval`;
        if (definition.requiresApproval) {
          if (!Object.prototype.hasOwnProperty.call(approvals, approvalId)) {
            nextPendingToolCalls.push(call);
            yield { type: "approval", approvalId, toolCallId: call.callId, toolName: call.name, input };
            continue;
          }
          if (!approvals[approvalId]) {
            const output = { error: "Tool execution was denied by the user" };
            outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
            yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
            continue;
          }
        }
        try {
          const output = await definition.execute(input);
          outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
        } catch (error) {
          const output = { error: error instanceof Error ? error.message : String(error) };
          outputs.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
        }
      }
      if (nextPendingToolCalls.length) {
        yield {
          type: "finish",
          text: finalText,
          responseMessages: conversation,
          awaitingApproval: true,
          continuation: {
            conversation,
            finalText,
            pendingToolCalls: nextPendingToolCalls,
            toolOutputs: outputs,
          },
        };
        return;
      }
      if (!outputs.length) break;
      conversation = [...conversation, ...outputs];
      pendingToolCalls = [];
      pendingOutputs = [];
    }

    yield { type: "finish", text: finalText, responseMessages: conversation, awaitingApproval: false };
  } catch (error) {
    yield { type: "error", error: error instanceof Error ? error : new Error(String(error)) };
  }
}
