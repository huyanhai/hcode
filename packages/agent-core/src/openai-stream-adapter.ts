import type { ResponseStreamEvent } from "openai/resources/responses/responses";

export type StreamPhase = "idle" | "queued" | "created" | "in-progress" | "compacting" | "completed" | "failed" | "incomplete";

export type PendingToolCall = {
  callId: string;
  itemId: string;
  name: string;
  arguments: string;
};

export type AgentContinuation = {
  conversation: unknown[];
  finalText: string;
  pendingToolCalls: PendingToolCall[];
  toolOutputs: unknown[];
};

export type CoreStreamEvent =
  | { type: "text"; text: string; itemId?: string; contentIndex?: number }
  | { type: "reasoning"; text: string; itemId?: string; contentIndex?: number }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown; itemId?: string; rawArguments?: string }
  | { type: "tool-call-delta"; toolCallId: string; delta: string; itemId?: string; arguments?: string; done?: boolean }
  | { type: "output-item"; itemId: string; outputIndex?: number; status: "added" | "done"; item: unknown }
  | { type: "content-part"; itemId: string; contentIndex?: number; outputIndex?: number; status: "added" | "done" | "updated"; part: unknown }
  | { type: "tool-progress"; toolName: string; status: string; itemId?: string; outputIndex?: number; data: unknown }
  | { type: "media"; kind: "audio" | "audio-transcript" | "image"; status: "delta" | "done" | "partial"; data?: string; itemId?: string; outputIndex?: number }
  | { type: "refusal"; text: string; done?: boolean; itemId?: string; contentIndex?: number }
  | { type: "response-lifecycle"; phase: Exclude<StreamPhase, "idle">; responseId?: string; response?: unknown; sourceType: string }
  | { type: "provider-event"; provider: string; sourceType: string; payload: unknown }
  | { type: "approval"; approvalId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "finish"; text: string; responseMessages: unknown[]; awaitingApproval: boolean; continuation?: AgentContinuation }
  | { type: "error"; error: Error; provider?: string; sourceType?: string; code?: string };

export type StreamAdapter<TProviderEvent> = {
  adapt(event: TProviderEvent): CoreStreamEvent[];
  snapshot(): StreamState;
};

export type StreamOutputItem = {
  id: string;
  outputIndex?: number;
  itemType?: string;
  status: "added" | "done";
  item: unknown;
};

export type StreamContentPart = {
  itemId: string;
  contentIndex?: number;
  outputIndex?: number;
  status: "added" | "done" | "updated";
  part: unknown;
};

export type StreamToolCall = {
  callId: string;
  itemId?: string;
  name?: string;
  arguments: string;
  status: "in-progress" | "done";
};

export type StreamState = {
  phase: StreamPhase;
  responseId?: string;
  response?: unknown;
  outputItems: Readonly<Record<string, StreamOutputItem>>;
  contentParts: Readonly<Record<string, StreamContentPart>>;
  toolCalls: Readonly<Record<string, StreamToolCall>>;
  text: string;
  reasoning: string;
  audio: string;
  transcript: string;
  refusal: string;
  error?: { message: string; code?: string };
  providerEvents: readonly { sourceType: string; payload: unknown }[];
};

type EventValue = Record<string, unknown>;
type MutableState = Omit<StreamState, "outputItems" | "contentParts" | "toolCalls" | "providerEvents"> & {
  outputItems: Record<string, StreamOutputItem>;
  contentParts: Record<string, StreamContentPart>;
  toolCalls: Record<string, StreamToolCall>;
  itemCallIds: Record<string, string>;
  providerEvents: { sourceType: string; payload: unknown }[];
};

const lifecyclePhases: Record<string, Exclude<StreamPhase, "idle">> = {
  "response.queued": "queued",
  "response.created": "created",
  "response.in_progress": "in-progress",
  "response.compaction.compacting": "compacting",
  "response.completed": "completed",
  "response.failed": "failed",
  "response.incomplete": "incomplete",
};

function asRecord(value: unknown): EventValue {
  return value && typeof value === "object" ? (value as EventValue) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseInput(argumentsText: string): unknown {
  try {
    return JSON.parse(argumentsText || "{}");
  } catch {
    return {};
  }
}

function partKey(itemId: string, contentIndex: number | undefined): string {
  return `${itemId}:${contentIndex ?? "unknown"}`;
}

function toolNameFor(sourceType: string): string | undefined {
  if (sourceType.includes("code_interpreter")) return "code-interpreter";
  if (sourceType.includes("file_search")) return "file-search";
  if (sourceType.includes("web_search")) return "web-search";
  if (sourceType.includes("image_generation")) return "image-generation";
  if (sourceType.includes("shell_call")) return "shell";
  if (sourceType.includes("mcp_list_tools")) return "mcp-list-tools";
  if (sourceType.includes("mcp_call")) return "mcp";
  return undefined;
}

function progressStatus(sourceType: string): string {
  const suffix = sourceType.split(".").at(-1);
  return suffix || "updated";
}

export class OpenAIResponseStreamAdapter implements StreamAdapter<ResponseStreamEvent> {
  private readonly state: MutableState = {
    phase: "idle",
    outputItems: {},
    contentParts: {},
    toolCalls: {},
    itemCallIds: {},
    text: "",
    reasoning: "",
    audio: "",
    transcript: "",
    refusal: "",
    providerEvents: [],
  };

  adapt(event: ResponseStreamEvent): CoreStreamEvent[] {
    const value = asRecord(event);
    const sourceType = optionalString(value.type) ?? "unknown";
    const itemId = optionalString(value.item_id);
    const outputIndex = optionalNumber(value.output_index);
    const contentIndex = optionalNumber(value.content_index);

    const lifecycle = lifecyclePhases[sourceType];
    if (lifecycle) return this.adaptLifecycle(lifecycle, sourceType, value);

    if (sourceType === "error" || sourceType === "response.error") {
      const message = optionalString(value.message) ?? optionalString(asRecord(value.error).message) ?? "Model request failed";
      const code = optionalString(value.code) ?? optionalString(asRecord(value.error).code);
      this.state.phase = "failed";
      this.state.error = { message, ...(code ? { code } : {}) };
      return [{ type: "error", error: new Error(message), provider: "openai", sourceType, ...(code ? { code } : {}) }];
    }

    if (sourceType === "response.output_item.added" || sourceType === "response.output_item.done") {
      return this.adaptOutputItem(sourceType === "response.output_item.added" ? "added" : "done", value);
    }

    if (sourceType === "response.content_part.added" || sourceType === "response.content_part.done") {
      const status = sourceType.endsWith(".added") ? "added" : "done";
      const part = value.part;
      if (itemId) this.state.contentParts[partKey(itemId, contentIndex)] = { itemId, contentIndex, outputIndex, status, part };
      return itemId ? [{ type: "content-part", itemId, contentIndex, outputIndex, status, part }] : this.providerEvent(sourceType, event);
    }

    if (sourceType === "response.output_text.delta") return this.adaptText(value, itemId, contentIndex);
    if (sourceType === "response.reasoning_summary_text.delta" || sourceType === "response.reasoning_text.delta") {
      const text = optionalString(value.delta) ?? "";
      this.state.reasoning += text;
      return text ? [{ type: "reasoning", text, itemId, contentIndex }] : [];
    }
    if (sourceType === "response.refusal.delta") {
      const text = optionalString(value.delta) ?? "";
      this.state.refusal += text;
      return text ? [{ type: "refusal", text, itemId, contentIndex }] : [];
    }

    if (sourceType === "response.function_call_arguments.delta" || sourceType === "response.custom_tool_call_input.delta") {
      return this.adaptToolArguments(value, false);
    }
    if (sourceType === "response.function_call_arguments.done" || sourceType === "response.custom_tool_call_input.done") {
      return this.adaptToolArguments(value, true);
    }

    if (sourceType === "response.audio.delta") {
      const data = optionalString(value.delta) ?? "";
      this.state.audio += data;
      return data ? [{ type: "media", kind: "audio", status: "delta", data }] : [];
    }
    if (sourceType === "response.audio.done") return [{ type: "media", kind: "audio", status: "done" }];
    if (sourceType === "response.audio.transcript.delta") {
      const data = optionalString(value.delta) ?? "";
      this.state.transcript += data;
      return data ? [{ type: "media", kind: "audio-transcript", status: "delta", data }] : [];
    }
    if (sourceType === "response.audio.transcript.done") return [{ type: "media", kind: "audio-transcript", status: "done" }];
    if (sourceType === "response.image_generation_call.partial_image") {
      return [{ type: "media", kind: "image", status: "partial", data: optionalString(value.partial_image_b64), itemId, outputIndex }];
    }

    const toolName = toolNameFor(sourceType);
    if (toolName) {
      return [{ type: "tool-progress", toolName, status: progressStatus(sourceType), itemId, outputIndex, data: event }];
    }

    if (sourceType === "response.reasoning_summary_part.added" || sourceType === "response.reasoning_summary_part.done") {
      const status = sourceType.endsWith(".added") ? "added" : "done";
      const summaryIndex = optionalNumber(value.summary_index);
      if (itemId) this.state.contentParts[partKey(itemId, summaryIndex)] = { itemId, contentIndex: summaryIndex, outputIndex, status, part: value.part };
      return itemId
        ? [{ type: "content-part", itemId, contentIndex: summaryIndex, outputIndex, status, part: value.part }]
        : this.providerEvent(sourceType, event);
    }
    if (sourceType === "response.reasoning_summary_text.done" || sourceType === "response.reasoning_text.done") {
      const text = optionalString(value.text) ?? "";
      if (text && !this.state.reasoning.endsWith(text)) this.state.reasoning += text;
      const partIndex = optionalNumber(value.summary_index) ?? contentIndex;
      if (itemId) this.state.contentParts[partKey(itemId, partIndex)] = { itemId, contentIndex: partIndex, outputIndex, status: "done", part: text };
      return itemId
        ? [{ type: "content-part", itemId, contentIndex: partIndex, outputIndex, status: "done", part: text }]
        : this.providerEvent(sourceType, event);
    }
    if (sourceType === "response.refusal.done" || sourceType.endsWith(".done")) {
      return this.adaptDonePart(sourceType, value, itemId, contentIndex, outputIndex);
    }
    if (sourceType === "response.output_text.annotation.added") {
      if (itemId) this.state.contentParts[partKey(itemId, contentIndex)] = { itemId, contentIndex, outputIndex, status: "updated", part: value.annotation };
      return itemId
        ? [{ type: "content-part", itemId, contentIndex, outputIndex, status: "updated", part: value.annotation }]
        : this.providerEvent(sourceType, event);
    }

    return this.providerEvent(sourceType, event);
  }

  snapshot(): StreamState {
    return {
      ...this.state,
      outputItems: { ...this.state.outputItems },
      contentParts: { ...this.state.contentParts },
      toolCalls: { ...this.state.toolCalls },
      providerEvents: [...this.state.providerEvents],
    };
  }

  private adaptLifecycle(phase: Exclude<StreamPhase, "idle">, sourceType: string, value: EventValue): CoreStreamEvent[] {
    const response = value.response;
    const responseId = optionalString(asRecord(response).id) ?? optionalString(value.response_id);
    this.state.phase = phase;
    if (responseId) this.state.responseId = responseId;
    if (response !== undefined) this.state.response = response;
    return [{ type: "response-lifecycle", phase, responseId, response, sourceType }];
  }

  private adaptOutputItem(status: "added" | "done", value: EventValue): CoreStreamEvent[] {
    const item = value.item;
    const itemValue = asRecord(item);
    const itemId = optionalString(itemValue.id) ?? optionalString(value.item_id);
    const outputIndex = optionalNumber(value.output_index);
    if (!itemId) return this.providerEvent(status === "added" ? "response.output_item.added" : "response.output_item.done", value);

    this.state.outputItems[itemId] = { id: itemId, outputIndex, itemType: optionalString(itemValue.type), status, item };
    const events: CoreStreamEvent[] = [{ type: "output-item", itemId, outputIndex, status, item }];
    const itemType = optionalString(itemValue.type);
    if (itemType === "function_call" || itemType === "custom_tool_call") {
      const callId = optionalString(itemValue.call_id) ?? itemId;
      const rawArguments = optionalString(itemValue.arguments) ?? optionalString(itemValue.input) ?? "";
      const wasKnown = Boolean(this.state.toolCalls[callId]);
      const call = this.upsertToolCall(callId, itemId, optionalString(itemValue.name), rawArguments, status === "done" ? "done" : "in-progress");
      if (status === "added" || !wasKnown) {
        events.push({ type: "tool-call", toolCallId: call.callId, toolName: call.name ?? "unknown", input: parseInput(call.arguments), itemId, rawArguments: call.arguments });
      }
    }
    return events;
  }

  private adaptText(value: EventValue, itemId?: string, contentIndex?: number): CoreStreamEvent[] {
    const text = optionalString(value.delta) ?? "";
    this.state.text += text;
    return text ? [{ type: "text", text, itemId, contentIndex }] : [];
  }

  private adaptToolArguments(value: EventValue, done: boolean): CoreStreamEvent[] {
    const itemId = optionalString(value.item_id);
    const knownCallId = itemId ? this.state.itemCallIds[itemId] : undefined;
    const callId = knownCallId ?? optionalString(value.call_id) ?? itemId;
    if (!callId) return this.providerEvent(done ? "response.function_call_arguments.done" : "response.function_call_arguments.delta", value);
    const delta = optionalString(value.delta) ?? "";
    const fullArguments = optionalString(value.arguments) ?? optionalString(value.input);
    const call = this.upsertToolCall(callId, itemId, undefined, fullArguments ?? delta, done ? "done" : "in-progress", fullArguments === undefined);
    return [{ type: "tool-call-delta", toolCallId: call.callId, delta, itemId, ...(fullArguments !== undefined ? { arguments: fullArguments } : {}), ...(done ? { done: true } : {}) }];
  }

  private adaptDonePart(sourceType: string, value: EventValue, itemId?: string, contentIndex?: number, outputIndex?: number): CoreStreamEvent[] {
    if (sourceType === "response.refusal.done") {
      const refusal = optionalString(value.refusal) ?? this.state.refusal;
      this.state.refusal = refusal;
      if (itemId) this.state.contentParts[partKey(itemId, contentIndex)] = { itemId, contentIndex, outputIndex, status: "done", part: refusal };
      return [{ type: "refusal", text: refusal, done: true, itemId, contentIndex }];
    }
    if (itemId && sourceType.includes("reasoning") && sourceType.includes("part")) {
      return [{ type: "content-part", itemId, contentIndex, outputIndex, status: "done", part: value.part }];
    }
    if (sourceType === "response.output_text.done") {
      const text = optionalString(value.text) ?? "";
      if (itemId) this.state.contentParts[partKey(itemId, contentIndex)] = { itemId, contentIndex, outputIndex, status: "done", part: text };
      return itemId ? [{ type: "content-part", itemId, contentIndex, outputIndex, status: "done", part: text }] : [];
    }
    return this.providerEvent(sourceType, value);
  }

  private upsertToolCall(callId: string, itemId: string | undefined, name: string | undefined, argumentsText: string, status: "in-progress" | "done", append = false): StreamToolCall {
    const existing = this.state.toolCalls[callId];
    const call: StreamToolCall = {
      callId,
      itemId: itemId ?? existing?.itemId,
      name: name ?? existing?.name,
      arguments: append ? `${existing?.arguments ?? ""}${argumentsText}` : argumentsText || existing?.arguments || "",
      status,
    };
    this.state.toolCalls[callId] = call;
    if (call.itemId) this.state.itemCallIds[call.itemId] = callId;
    return call;
  }

  private providerEvent(sourceType: string, payload: unknown): CoreStreamEvent[] {
    this.state.providerEvents.push({ sourceType, payload });
    return [{ type: "provider-event", provider: "openai", sourceType, payload }];
  }
}
