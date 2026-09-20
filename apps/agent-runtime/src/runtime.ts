import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createEvent, type AgentEvent, type Command, type ListModelsPayload, type RuntimeResponse, type StartTurnPayload, type UpsertProfilePayload } from "@hcode/agent-protocol";
import { ApprovalRepository, closeDatabase, openDatabase, EventRepository, MessageRepository, ProfileRepository, RuntimeRequestRepository, SessionRepository, ToolCallRepository, TurnRepository, WorkspaceRepository } from "@hcode/agent-storage";
import { assertWorkspace } from "@hcode/agent-tools-local";
import { streamAgent, type CoreStreamEvent } from "@hcode/agent-core";
import { listProviderModels, ModelCatalogError, normalizeBaseUrl, sameBaseUrl } from "./model-catalog.js";

type RuntimeOptions = { databasePath?: string };
type TurnContext = {
  turnId: string;
  sessionId: string;
  workspaceRoot: string;
  profile: NonNullable<ReturnType<ProfileRepository["get"]>>;
  permissionMode: "restricted" | "full";
};
type PendingApproval = TurnContext & { messages: unknown[]; approvalId: string };

export class AgentRuntime {
  private readonly database;
  private readonly profiles;
  private readonly workspaces;
  private readonly sessions;
  private readonly messages;
  private readonly events;
  private readonly turns;
  private readonly toolCalls;
  private readonly approvals;
  private readonly requests;
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly emit: (event: AgentEvent) => void;

  constructor(emit: (event: AgentEvent) => void, options: RuntimeOptions = {}) {
    const databasePath = options.databasePath ?? join(homedir(), ".hcode", "data", "hcode.db");
    this.database = openDatabase(databasePath);
    this.profiles = new ProfileRepository(this.database);
    this.workspaces = new WorkspaceRepository(this.database);
    this.sessions = new SessionRepository(this.database);
    this.messages = new MessageRepository(this.database);
    this.events = new EventRepository(this.database);
    this.turns = new TurnRepository(this.database);
    this.toolCalls = new ToolCallRepository(this.database);
    this.approvals = new ApprovalRepository(this.database);
    this.requests = new RuntimeRequestRepository(this.database);
    // 应用重启后不重放工具，所有尚未结束的 turn 只保留为中断状态，避免重复写文件或执行命令。
    this.turns.markRunningAsInterrupted();
    this.emit = emit;
  }

  close(): void { closeDatabase(this.database); }

  async handle(command: Command): Promise<RuntimeResponse> {
    // requestId 的响应持久化到 SQLite，Runtime 重启后收到重试也不会再次执行有副作用的命令。
    const cached = this.requests.get(command.requestId);
    if (cached) return cached;
    let response: RuntimeResponse;
    try {
      response = await this.execute(command);
    } catch (error) {
      response = this.error(command, "RUNTIME_ERROR", error instanceof Error ? error.message : String(error));
    }
    this.requests.save(command.requestId, response);
    return response;
  }

  private async execute(command: Command): Promise<RuntimeResponse> {
    switch (command.type) {
      case "profile/list": return this.ok(command, this.profiles.list());
      case "profile/upsert": return this.upsertProfile(command);
      case "profile/delete": return this.deleteProfile(command);
      case "model/list": return this.listModels(command);
      case "models": return this.listModels(command);
      case "workspace/list": return this.ok(command, this.workspaces.list());
      case "workspace/upsert": return this.upsertWorkspace(command);
      case "session/list": return this.ok(command, this.sessions.list(this.payload<{ workspaceId?: string }>(command).workspaceId));
      case "session/create": return this.createSession(command);
      case "session/open": return this.openSession(command);
      case "turn/start": return this.startTurn(command);
      case "turn/interrupt": return this.interruptTurn(command);
      case "approval/respond": return this.respondToApproval(command);
    }
  }

  private async startTurn(command: Command): Promise<RuntimeResponse> {
    const input = this.payload<StartTurnPayload>(command);
    const session = this.sessions.get(input.sessionId);
    const profile = this.profiles.get(input.profileId);
    if (!session) return this.error(command, "SESSION_NOT_FOUND", "Session not found");
    if (!profile) return this.error(command, "PROFILE_NOT_FOUND", "Model profile not found");
    const workspace = this.workspaces.get(session.workspaceId);
    if (!workspace) return this.error(command, "WORKSPACE_NOT_FOUND", "Workspace not found");
    assertWorkspace(workspace.path);

    const turnId = randomUUID();
    this.turns.create({ id: turnId, sessionId: session.id, profile });
    this.messages.append({ id: randomUUID(), sessionId: session.id, turnId, role: "user", content: input.content });
    if (session.title === "New session") this.sessions.setTitle(session.id, input.content.trim().slice(0, 48) || "New session");
    this.sessions.touch(session.id);
    this.publish(createEvent("session/changed", this.sessions.get(session.id)));
    const controller = new AbortController();
    this.abortControllers.set(turnId, controller);
    const context = { turnId, sessionId: session.id, workspaceRoot: workspace.path, profile, permissionMode: input.permissionMode ?? "restricted" };
    void this.runPhase(context, this.toModelMessages(session.id), controller.signal).finally(() => this.abortControllers.delete(turnId));
    return this.ok(command, { turnId });
  }

  private async runPhase(context: TurnContext, modelMessages: unknown[], signal: AbortSignal): Promise<void> {
    const { turnId, sessionId, workspaceRoot, profile } = context;
    if (!this.events.listAfter(sessionId, 0).some((event) => event.turnId === turnId && event.type === "turn/started")) {
      this.publish(createEvent("turn/started", { profileId: profile.id }, { sessionId, turnId }));
    }
    let assistantText = "";
    let approvalId: string | undefined;
    let responseMessages: unknown[] = [];
    let awaitingApproval = false;
    try {
      for await (const event of streamAgent(profile, { workspaceRoot, permissionMode: context.permissionMode }, modelMessages, {}, signal)) {
        await this.handleCoreEvent(event, sessionId, turnId, (text) => { assistantText += text; });
        if (event.type === "approval") approvalId = event.approvalId;
        if (event.type === "finish") {
          responseMessages = event.responseMessages;
          awaitingApproval = event.awaitingApproval;
        }
      }
      if (assistantText) this.messages.append({ id: randomUUID(), sessionId, turnId, role: "assistant", content: assistantText });
      if (signal.aborted) {
        this.turns.setStatus(turnId, "interrupted");
        this.publish(createEvent("turn/interrupted", {}, { sessionId, turnId }));
        return;
      }
      if (awaitingApproval && approvalId) {
        // 审批暂停时保存完整模型上下文；同一进程内批准后可继续，应用重启则按设计标记为 interrupted。
        this.pendingApprovals.set(approvalId, { ...context, approvalId, messages: [...modelMessages, ...responseMessages] });
        return;
      }
      this.turns.setStatus(turnId, "completed");
      this.publish(createEvent("turn/completed", { text: assistantText }, { sessionId, turnId }));
    } catch (error) {
      this.turns.setStatus(turnId, "failed");
      this.publish(createEvent("turn/failed", { message: error instanceof Error ? error.message : String(error) }, { sessionId, turnId }));
    }
  }

  private async handleCoreEvent(event: CoreStreamEvent, sessionId: string, turnId: string, appendText: (text: string) => void): Promise<void> {
    if (event.type === "text") {
      appendText(event.text);
      this.publish(createEvent("message/delta", { text: event.text }, { sessionId, turnId }));
    } else if (event.type === "tool-call") {
      this.toolCalls.create({ id: event.toolCallId, turnId, toolName: event.toolName, input: event.input });
      this.publish(createEvent("tool/call-created", { toolCallId: event.toolCallId, toolName: event.toolName, input: event.input }, { sessionId, turnId }));
    } else if (event.type === "approval") {
      const inputHash = createHash("sha256").update(JSON.stringify(event.input)).digest("hex");
      this.approvals.create({ id: event.approvalId, turnId, toolCallId: event.toolCallId, toolName: event.toolName, toolInput: event.input, inputHash });
      this.publish(createEvent("approval/requested", { approvalId: event.approvalId, toolCallId: event.toolCallId, toolName: event.toolName, input: event.input, inputHash }, { sessionId, turnId }));
    } else if (event.type === "tool-result") {
      this.toolCalls.complete(event.toolCallId, "completed", event.output);
      this.publish(createEvent("tool/completed", { toolCallId: event.toolCallId, toolName: event.toolName, output: event.output }, { sessionId, turnId }));
    } else if (event.type === "error") {
      throw event.error;
    }
  }

  private interruptTurn(command: Command): RuntimeResponse {
    const turnId = this.payload<{ turnId: string }>(command).turnId;
    const controller = this.abortControllers.get(turnId);
    if (controller) controller.abort();
    for (const [approvalId, pending] of this.pendingApprovals) {
      if (pending.turnId === turnId) this.pendingApprovals.delete(approvalId);
    }
    this.turns.setStatus(turnId, "interrupted");
    return this.ok(command, { turnId, interrupted: true });
  }

  private respondToApproval(command: Command): RuntimeResponse {
    const input = this.payload<{ approvalId: string; approved: boolean; reason?: string }>(command);
    const pending = this.pendingApprovals.get(input.approvalId);
    if (!pending) return this.error(command, "APPROVAL_NOT_FOUND", "Approval request is no longer active");
    this.pendingApprovals.delete(input.approvalId);
    this.approvals.respond(input.approvalId, input.approved, input.reason);
    this.publish(createEvent("approval/responded", input, { sessionId: pending.sessionId, turnId: pending.turnId }));
    const controller = new AbortController();
    this.abortControllers.set(pending.turnId, controller);
    const approvalMessage = {
      role: "tool",
      content: [{ type: "tool-approval-response", approvalId: input.approvalId, approved: input.approved, reason: input.reason }],
    };
    void this.runPhase(pending, [...pending.messages, approvalMessage], controller.signal)
      .finally(() => this.abortControllers.delete(pending.turnId));
    return this.ok(command, { turnId: pending.turnId });
  }

  private upsertProfile(command: Command): RuntimeResponse {
    const input = this.payload<UpsertProfilePayload>(command);
    const id = input.id ?? randomUUID();
    const existing = this.profiles.get(id);
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(input.baseUrl);
    } catch (error) {
      return this.error(command, error instanceof ModelCatalogError ? error.code : "INVALID_BASE_URL", "Base URL 无效");
    }
    const apiKey = input.apiKey?.trim() || (existing && sameBaseUrl(baseUrl, existing.baseUrl) ? existing.apiKey : undefined);
    if (!apiKey) return this.error(command, "API_KEY_REQUIRED", "API Key is required");
    const profile = this.profiles.upsert({ id, name: input.name, provider: input.provider, model: input.model, baseUrl, apiKey, isDefault: input.isDefault ?? false });
    this.publish(createEvent("profile/changed", profile));
    return this.ok(command, profile);
  }

  private async listModels(command: Command): Promise<RuntimeResponse> {
    const input = this.payload<ListModelsPayload>(command);
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(input.baseUrl);
    } catch (error) {
      return this.error(command, error instanceof ModelCatalogError ? error.code : "MODEL_LIST_INVALID_BASE_URL", "Base URL 无效");
    }

    let apiKey = input.apiKey?.trim();
    if (!apiKey) {
      if (!input.profileId) return this.error(command, "API_KEY_REQUIRED", "API Key is required");
      const profile = this.profiles.get(input.profileId);
      if (!profile) return this.error(command, "PROFILE_NOT_FOUND", "Model profile not found");
      if (!sameBaseUrl(baseUrl, profile.baseUrl)) return this.error(command, "API_KEY_REQUIRED", "更换 Base URL 后需要重新填写 API Key");
      apiKey = profile.apiKey;
    }

    try {
      return this.ok(command, { models: await listProviderModels(baseUrl, apiKey) });
    } catch (error) {
      if (error instanceof ModelCatalogError) return this.error(command, error.code, error.message);
      return this.error(command, "MODEL_LIST_NETWORK_ERROR", "无法获取模型列表");
    }
  }

  private deleteProfile(command: Command): RuntimeResponse { this.profiles.delete(this.payload<{ id: string }>(command).id); return this.ok(command, null); }

  private upsertWorkspace(command: Command): RuntimeResponse {
    const input = this.payload<{ id?: string; path: string; name?: string }>(command);
    assertWorkspace(input.path);
    const workspace = this.workspaces.upsert({ id: input.id ?? randomUUID(), path: input.path, name: input.name ?? basename(input.path) });
    return this.ok(command, workspace);
  }

  private createSession(command: Command): RuntimeResponse {
    const input = this.payload<{ workspaceId: string; title?: string }>(command);
    if (!this.workspaces.get(input.workspaceId)) return this.error(command, "WORKSPACE_NOT_FOUND", "Workspace not found");
    const session = this.sessions.create({ id: randomUUID(), workspaceId: input.workspaceId, title: input.title ?? "New session" });
    this.publish(createEvent("session/changed", session));
    return this.ok(command, session);
  }

  private openSession(command: Command): RuntimeResponse {
    const id = this.payload<{ sessionId: string }>(command).sessionId;
    const session = this.sessions.get(id);
    return session ? this.ok(command, { session, messages: this.messages.list(id), events: this.events.listAfter(id, 0) }) : this.error(command, "SESSION_NOT_FOUND", "Session not found");
  }

  private toModelMessages(sessionId: string): unknown[] {
    return this.messages.list(sessionId)
      .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system")
      .map((message) => ({ role: message.role, content: message.content }));
  }

  private publish(event: AgentEvent): void {
    // 只有归属会话的事件进入可重放日志；配置变化等全局事件直接广播。
    this.emit(event.sessionId ? this.events.append(event) : event);
  }
  private payload<T>(command: Command): T { return (command.payload ?? {}) as T; }
  private ok(command: Command, data: unknown): RuntimeResponse { return { requestId: command.requestId, ok: true, data }; }
  private error(command: Command, code: string, message: string): RuntimeResponse { return { requestId: command.requestId, ok: false, error: { code, message } }; }
}
