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
  executeAdditionalWorkspaceCommand,
  applyWorkspacePatch,
  applyAdditionalWorkspacePatch,
  gitDiff,
  gitLog,
  gitStatus,
  listFiles,
  listAdditionalFiles,
  readWorkspaceFile,
  readAdditionalWorkspaceFile,
  searchWorkspaceFiles,
  searchAdditionalWorkspaceFiles,
  writeWorkspaceFile,
  writeAdditionalWorkspaceFile,
} from "@hcode/agent-tools-local";
import type { WorkspaceRoot } from "@hcode/agent-tools-local";

export type AgentContext = {
  workspaceRoot: string;
  additionalRoots?: WorkspaceRoot[];
  permissionMode?: "restricted" | "full";
};
export type ModelProfile = { id: string; name: string; provider: string; model: string; baseUrl: string; apiKey: string; requestType?: "response" | "chat"; isDefault: boolean; createdAt: number; updatedAt: number };
export type ApprovalDecisions = Record<string, boolean>;

export type AgentAttachment = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
};

type ToolDefinition = {
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval?: boolean;
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type FunctionCall = PendingToolCall;

function instructions(context: AgentContext): string {
  const additional = context.additionalRoots ?? [];
  const additionalInstruction = additional.length
    ? ` Additional folders are available only on demand: ${additional.map((root) => `\"${root.name}\"`).join(", ")}. Keep using the default workspace tools for the primary folder. Use an additional-folder tool only when the user explicitly asks about one of these folders or its contents.`
    : " No additional folders are configured.";
  return (
    "You are a local coding agent. Work only inside the provided workspace. " +
    "Use tools for workspace inspection and changes. Explain actions briefly and never claim a tool succeeded without its result." +
    additionalInstruction
  );
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function createTools(context: AgentContext): Record<string, ToolDefinition> {
  const requiresApproval = context.permissionMode !== "full";
  const tools: Record<string, ToolDefinition> = {
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
  const additionalRoots = context.additionalRoots ?? [];
  if (additionalRoots.length) {
    const rootNames = additionalRoots.map((root) => root.name);
    const rootProperty = {
      type: "string",
      enum: rootNames,
      description: "Configured additional folder label. Use only when the user explicitly requests this folder.",
    };
    tools.listAdditionalFiles = {
      description: "List files in a configured additional folder. Use only when the user explicitly asks to inspect that folder.",
      parameters: objectSchema({ root: rootProperty, path: { type: "string", description: "Path relative to the selected additional folder." } }, ["root"]),
      execute: (input) => listAdditionalFiles({ additionalRoots }, String(input.root), String(input.path ?? ".")),
    };
    tools.readAdditionalFile = {
      description: "Read a UTF-8 file from a configured additional folder. Use only when the user explicitly asks for that folder or file.",
      parameters: objectSchema({ root: rootProperty, path: { type: "string", description: "Path relative to the selected additional folder." } }, ["root", "path"]),
      execute: (input) => readAdditionalWorkspaceFile({ additionalRoots }, String(input.root), String(input.path)),
    };
    tools.searchAdditionalFiles = {
      description: "Search text in a configured additional folder. Use only when the user explicitly asks to search that folder.",
      parameters: objectSchema({ root: rootProperty, query: { type: "string" }, path: { type: "string", description: "Path relative to the selected additional folder." } }, ["root", "query"]),
      execute: (input) => searchAdditionalWorkspaceFiles({ additionalRoots }, String(input.root), String(input.query), String(input.path ?? ".")),
    };
    tools.writeAdditionalFile = {
      description: "Write a UTF-8 file in a configured additional folder after user approval.",
      parameters: objectSchema({ root: rootProperty, path: { type: "string" }, content: { type: "string" } }, ["root", "path", "content"]),
      requiresApproval,
      execute: (input) => writeAdditionalWorkspaceFile({ additionalRoots }, String(input.root), String(input.path), String(input.content)),
    };
    tools.applyAdditionalPatch = {
      description: "Apply a unified diff to a file in a configured additional folder after user approval.",
      parameters: objectSchema({ root: rootProperty, path: { type: "string" }, patch: { type: "string" } }, ["root", "path", "patch"]),
      requiresApproval,
      execute: (input) => applyAdditionalWorkspacePatch({ additionalRoots }, String(input.root), String(input.path), String(input.patch)),
    };
    tools.execAdditionalCommand = {
      description: "Run a shell command in a configured additional folder after user approval.",
      parameters: objectSchema({ root: rootProperty, command: { type: "string" }, cwd: { type: "string", description: "Path relative to the selected additional folder." }, timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 } }, ["root", "command"]),
      requiresApproval,
      execute: (input) => executeAdditionalWorkspaceCommand({ additionalRoots }, String(input.root), String(input.command), String(input.cwd ?? "."), Number(input.timeoutMs ?? 30000)),
    };
  }
  return tools;
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

function chatTools(tools: Record<string, ToolDefinition>) {
  return Object.entries(tools).map(([name, definition]) => ({
    type: "function" as const,
    function: { name, description: definition.description, parameters: definition.parameters },
  }));
}

function chatMessages(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    const value = message as Record<string, unknown>;
    if (Array.isArray(value.tool_calls) || value.tool_call_id) return value;
    const role = value.role === "developer" ? "system" : value.role;
    const rawContent = value.content;
    if (!Array.isArray(rawContent)) return { role, content: String(rawContent ?? "") };
    const content = rawContent.map((part) => {
      if (!part || typeof part !== "object") return part;
      const item = part as Record<string, unknown>;
      if (item.type === "input_text") return { type: "text", text: String(item.text ?? "") };
      if (item.type === "input_image") return { type: "image_url", image_url: { url: String(item.image_url ?? "") } };
      if (item.type === "input_file") return { type: "text", text: `[File: ${String(item.filename ?? "attachment")}]` };
      return item;
    });
    return { role, content };
  });
}

function chatToolOutput(call: FunctionCall, output: unknown) {
  return { role: "tool", tool_call_id: call.callId, content: JSON.stringify(output) };
}

export function inputMessages(messages: unknown[]): unknown[] {
  return messages.map((message) => {
    if (!message || typeof message !== "object") return message;
    const value = message as Record<string, unknown>;
    const role = value.role === "system" ? "developer" : value.role;
    const content: Array<Record<string, unknown>> = [];
    const text = String(value.content ?? "");
    if (text) content.push({ type: "input_text", text });
    const attachments = Array.isArray(value.attachments) ? value.attachments : [];
    for (const attachment of attachments) {
      if (!attachment || typeof attachment !== "object") continue;
      const file = attachment as Record<string, unknown>;
      const url = String(file.url ?? "");
      const dataUrl = typeof file.dataUrl === "string" ? file.dataUrl : "";
      const mimeType = String(file.mimeType ?? "").toLowerCase();
      const name = String(file.name ?? "attachment");
      if (!url) continue;
      if (mimeType.startsWith("image/")) {
        content.push({ type: "input_image", image_url: dataUrl || url, detail: "auto" });
      } else {
        content.push(
          dataUrl
            ? { type: "input_file", file_data: dataUrl, filename: name, detail: "auto" }
            : { type: "input_file", file_url: url, filename: name, detail: "auto" },
        );
      }
    }
    return content.length ? { role, content } : null;
  }).filter(Boolean);
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

function parseToolArguments(argumentsText: string): unknown {
  try { return JSON.parse(argumentsText || "{}"); } catch { return {}; }
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
        const request = profile.requestType === "chat"
          ? {
              model: profile.model,
              messages: [{ role: "system", content: instructions(context) }, ...chatMessages(conversation)] as never,
              tools: chatTools(tools) as never,
              stream: streamOutput,
            }
          : {
              model: profile.model,
              instructions: instructions(context),
              input: conversation as never,
              tools: openaiTools(tools) as never,
              reasoning: { summary: "auto" },
              stream: streamOutput,
            };
        const result = profile.requestType === "chat"
          ? await client.chat.completions.create(request as never, { signal: abortSignal })
          : await client.responses.create(request as never, { signal: abortSignal });
        let response: Response | undefined;
        const calls = new Map<string, FunctionCall>();

        if (profile.requestType === "chat") {
          let assistantText = "";
          const chatCalls = new Map<number, FunctionCall>();
          const consumeChunk = (chunk: any) => {
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta ?? {};
            if (typeof delta.content === "string" && delta.content) {
              assistantText += delta.content;
              return [{ type: "text", text: delta.content } as CoreStreamEvent];
            }
            const events: CoreStreamEvent[] = [];
            for (const tool of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
              const index = Number(tool.index ?? 0);
              const existing = chatCalls.get(index);
              const call: FunctionCall = existing ?? {
                callId: String(tool.id ?? `call_${index}`), itemId: String(tool.id ?? `call_${index}`),
                name: String(tool.function?.name ?? ""), arguments: "",
              };
              if (tool.id) call.callId = String(tool.id);
              if (tool.function?.name) call.name = String(tool.function.name);
              const args = String(tool.function?.arguments ?? "");
              call.arguments += args;
              chatCalls.set(index, call);
              if (!existing) events.push({ type: "tool-call", toolCallId: call.callId, itemId: call.itemId, toolName: call.name, input: parseToolArguments(call.arguments), rawArguments: call.arguments });
              if (args) events.push({ type: "tool-call-delta", toolCallId: call.callId, itemId: call.itemId, delta: args, arguments: call.arguments });
            }
            return events;
          };
          if (!streamOutput) {
            const completion = result as any;
            const message = completion.choices?.[0]?.message ?? {};
            assistantText = String(message.content ?? "");
            for (const tool of message.tool_calls ?? []) {
              const call: FunctionCall = { callId: String(tool.id), itemId: String(tool.id), name: String(tool.function?.name ?? ""), arguments: String(tool.function?.arguments ?? "") };
              chatCalls.set(chatCalls.size, call);
            }
            if (assistantText) { finalText += assistantText; yield { type: "text", text: assistantText }; }
          } else {
            for await (const chunk of result as any) for (const event of consumeChunk(chunk)) { if (event.type === "text") finalText += event.text; yield event; }
          }
          stepCalls = [...chatCalls.values()];
          if (assistantText || stepCalls.length) {
            conversation = [...conversation, { role: "assistant", content: assistantText || null, ...(stepCalls.length ? { tool_calls: stepCalls.map((call) => ({ id: call.callId, type: "function", function: { name: call.name, arguments: call.arguments } })) } : {}) }];
          }
          if (!stepCalls.length) break;
        }

        if (profile.requestType !== "chat" && !streamOutput) {
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
        for await (const providerEvent of (profile.requestType !== "chat" && streamOutput ? result : []) as unknown as AsyncIterable<ResponseStreamEvent>) {
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

        if (profile.requestType === "chat") {
          // Chat completions already produced a normalized tool-call list above.
        } else if (!response) break;
        if (profile.requestType !== "chat" && !stepCalls.length) {
          stepCalls = responseItems(response!)
            .map(itemCall)
            .filter((call): call is FunctionCall => Boolean(call));
        }
        if (!stepCalls.length) break;
        if (profile.requestType !== "chat") conversation = [...conversation, ...responseItems(response!)];
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
          outputs.push(profile.requestType === "chat" ? chatToolOutput(call, output) : { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
          continue;
        }
        if (!definition) {
          const output = { error: `Unknown tool: ${call.name}` };
          outputs.push(profile.requestType === "chat" ? chatToolOutput(call, output) : { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
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
            outputs.push(profile.requestType === "chat" ? chatToolOutput(call, output) : { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
            yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
            continue;
          }
        }
        try {
          const output = await definition.execute(input);
          outputs.push(profile.requestType === "chat" ? chatToolOutput(call, output) : { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
          yield { type: "tool-result", toolCallId: call.callId, toolName: call.name, output };
        } catch (error) {
          const output = { error: error instanceof Error ? error.message : String(error) };
          outputs.push(profile.requestType === "chat" ? chatToolOutput(call, output) : { type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
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
