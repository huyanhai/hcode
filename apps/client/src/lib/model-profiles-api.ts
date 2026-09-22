const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000";

export type ModelProfileSummary = {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  isDefault: boolean;
  createdAt: string | number;
  updatedAt: string | number;
  apiKeyHint: string;
};

export type UpsertModelProfileInput = {
  id?: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  isDefault?: boolean;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type SessionSummary = {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionMessageSummary = {
  id: string;
  sessionId: string;
  turnId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  sequence: number;
  createdAt: string;
  reasoning?: string;
  toolCalls?: string[];
};

export type SessionStreamEvent =
  | { type: "text"; text: string; itemId?: string; contentIndex?: number }
  | {
      type: "reasoning";
      text: string;
      itemId?: string;
      contentIndex?: number;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
      itemId?: string;
      rawArguments?: string;
    }
  | {
      type: "tool-call-delta";
      toolCallId: string;
      delta: string;
      itemId?: string;
      arguments?: string;
      done?: boolean;
    }
  | {
      type: "output-item";
      itemId: string;
      outputIndex?: number;
      status: "added" | "done";
      item: unknown;
    }
  | {
      type: "content-part";
      itemId: string;
      contentIndex?: number;
      outputIndex?: number;
      status: "added" | "done" | "updated";
      part: unknown;
    }
  | {
      type: "tool-progress";
      toolName: string;
      status: string;
      itemId?: string;
      outputIndex?: number;
      data: unknown;
    }
  | {
      type: "media";
      kind: "audio" | "audio-transcript" | "image";
      status: "delta" | "done" | "partial";
      data?: string;
      itemId?: string;
      outputIndex?: number;
    }
  | {
      type: "refusal";
      text: string;
      done?: boolean;
      itemId?: string;
      contentIndex?: number;
    }
  | {
      type: "response-lifecycle";
      phase:
        | "queued"
        | "created"
        | "in-progress"
        | "compacting"
        | "completed"
        | "failed"
        | "incomplete";
      responseId?: string;
      response?: unknown;
      sourceType: string;
    }
  | {
      type: "provider-event";
      provider: string;
      sourceType: string;
      payload: unknown;
    }
  | { type: "approval"; approvalId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "finish"; text: string; responseMessages: unknown[]; awaitingApproval: boolean }
  | { type: "done"; text: string }
  | { type: "error"; message?: string; provider?: string; sourceType?: string; code?: string };

export type SessionDetail = {
  session: SessionSummary;
  messages: SessionMessageSummary[];
};

type ApiResponse<T> = {
  code: "0" | "-1";
  data: T;
  message: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok || body.code !== "0") {
    throw new Error(body.message || "请求失败");
  }
  return body.data;
}

export function listModelProfiles(): Promise<ModelProfileSummary[]> {
  return request<ModelProfileSummary[]>("/api/model-profiles");
}

export function upsertModelProfile(
  input: UpsertModelProfileInput,
): Promise<ModelProfileSummary> {
  return request<ModelProfileSummary>("/api/model-profiles/upsert", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteModelProfile(id: string): Promise<{ id: string }> {
  return request<{ id: string }>("/api/model-profiles/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function listProfileModels(
  profileId: string,
): Promise<{ models: string[] }> {
  return request<{ models: string[] }>("/api/model-profiles/models", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return request<WorkspaceSummary[]>("/api/workspaces");
}

export function createWorkspace(input: { name: string; path: string }): Promise<WorkspaceSummary> {
  return request<WorkspaceSummary>("/api/workspaces/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listSessions(workspaceId?: string): Promise<SessionSummary[]> {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  return request<SessionSummary[]>(`/api/sessions${query}`);
}

export function createSession(input: { workspaceId: string; title?: string }): Promise<SessionSummary> {
  return request<SessionSummary>("/api/sessions/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function openSession(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`);
}

export function sendSessionMessage(
  id: string,
  input: { content: string; profileId?: string; model?: string; fullAccess?: boolean },
): Promise<SessionDetail> {
  return request<SessionDetail>(
    `/api/sessions/${encodeURIComponent(id)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function streamSessionMessage(
  id: string,
  input: { content: string; profileId?: string; model?: string; fullAccess?: boolean },
  onEvent: (event: SessionStreamEvent) => void,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/sessions/${encodeURIComponent(id)}/messages/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok || !response.body) {
    let message = "发送消息失败";
    try {
      const body = (await response.json()) as ApiResponse<unknown>;
      message = body.message || message;
    } catch {
      // Keep the generic error when the server did not return JSON.
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedText = false;
  let buffer = "";
  const consume = (chunk: string) => {
    buffer += chunk;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split(/\r?\n/).find((item) => item.startsWith("data:"));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as SessionStreamEvent;
        if (event.type === "text") receivedText = true;
        onEvent(event);
      } catch {
        // Ignore malformed keep-alive frames.
      }
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      consume(decoder.decode(value, { stream: true }));
    }
    const remaining = decoder.decode();
    if (remaining) consume(remaining);
    if (buffer.trim()) consume("\n\n");
    if (!receivedText) throw new Error("模型没有返回内容");
  } finally {
    reader.releaseLock();
  }
}
