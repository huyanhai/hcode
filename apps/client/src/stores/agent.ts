import { defineStore } from "pinia";
import type { AgentEvent, ListModelsPayload, Message, ModelProfileSummary, Session, UpsertProfilePayload, Workspace } from "@hcode/agent-protocol";
import {
  createSession,
  deleteProfile,
  interruptTurn,
  listModels,
  listProfiles,
  listSessions,
  listWorkspaces,
  openSession,
  respondToApproval,
  startTurn,
  subscribeToAgentEvents,
  upsertProfile,
  upsertWorkspace,
} from "@/lib/agent-client";

export type ApprovalView = { approvalId: string; toolName: string; input: unknown };

export const useAgentStore = defineStore("agent", () => {
  const profiles = ref<ModelProfileSummary[]>([]);
  const availableModels = ref<Record<string, string[]>>({});
  const modelsLoading = ref(false);
  const modelsError = ref("");
  const workspaces = ref<Workspace[]>([]);
  const sessions = ref<Session[]>([]);
  const messages = ref<Message[]>([]);
  const approvals = ref<ApprovalView[]>([]);
  const currentWorkspaceId = ref<string>();
  const currentSessionId = ref<string>();
  const activeTurnId = ref<string>();
  const busy = ref(false);
  const errorMessage = ref("");
  let initialized = false;
  let unsubscribe: (() => void) | undefined;

  async function initialize(): Promise<void> {
    if (initialized) return;
    initialized = true;
    unsubscribe = subscribeToAgentEvents(handleEvent);
    try {
      await Promise.all([refreshProfiles(), refreshWorkspaces()]);
      if (workspaces.value[0]) {
        currentWorkspaceId.value = workspaces.value[0].id;
        await refreshSessions();
        if (sessions.value[0]) await selectSession(sessions.value[0].id);
      }
    } catch (error) { setError(error); }
  }

  async function refreshProfiles(): Promise<void> { profiles.value = await listProfiles(); }
  async function saveProfile(payload: UpsertProfilePayload): Promise<ModelProfileSummary> {
    const profile = await upsertProfile(payload);
    await refreshProfiles();
    return profile;
  }
  async function removeProfile(id: string): Promise<void> {
    await deleteProfile(id);
    const next = { ...availableModels.value };
    delete next[id];
    availableModels.value = next;
    await refreshProfiles();
  }
  async function loadModels(payload: ListModelsPayload): Promise<string[]> {
    modelsLoading.value = true;
    modelsError.value = "";
    try {
      const result = await listModels(payload);
      const key = payload.profileId ?? "draft";
      availableModels.value = { ...availableModels.value, [key]: result.models };
      return result.models;
    } catch (error) {
      modelsError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      modelsLoading.value = false;
    }
  }
  async function refreshWorkspaces(): Promise<void> { workspaces.value = await listWorkspaces(); }
  async function refreshSessions(): Promise<void> {
    sessions.value = currentWorkspaceId.value ? await listSessions(currentWorkspaceId.value) : [];
  }

  async function chooseWorkspace(): Promise<Workspace | null> {
    const path = await window.agent?.selectWorkspace();
    if (!path) return null;
    const workspace = await upsertWorkspace(path);
    await refreshWorkspaces();
    currentWorkspaceId.value = workspace.id;
    await refreshSessions();
    return workspace;
  }

  async function newSession(): Promise<Session | null> {
    let workspaceId = currentWorkspaceId.value;
    if (!workspaceId) workspaceId = (await chooseWorkspace())?.id;
    if (!workspaceId) return null;
    const session = await createSession(workspaceId);
    await refreshSessions();
    await selectSession(session.id);
    return session;
  }

  async function selectSession(sessionId: string): Promise<void> {
    const opened = await openSession(sessionId);
    currentSessionId.value = sessionId;
    messages.value = opened.messages;
    approvals.value = [];
    busy.value = false;
  }

  async function send(content: string, profileId: string, fullAccess: boolean): Promise<void> {
    errorMessage.value = "";
    try {
      if (!profiles.value.length) throw new Error("请先在右侧模型配置中添加一个模型");
      if (!currentSessionId.value) await newSession();
      if (!currentSessionId.value) throw new Error("请选择一个工作区");
      const message: Message = { id: crypto.randomUUID(), sessionId: currentSessionId.value, turnId: null, role: "user", content, sequence: messages.value.length + 1, createdAt: Date.now() };
      messages.value.push(message);
      busy.value = true;
      const result = await startTurn(currentSessionId.value, profileId, content, fullAccess ? "full" : "restricted");
      activeTurnId.value = result.turnId;
    } catch (error) {
      busy.value = false;
      setError(error);
      throw error;
    }
  }

  async function answerApproval(approvalId: string, approved: boolean): Promise<void> {
    approvals.value = approvals.value.filter((item) => item.approvalId !== approvalId);
    try { await respondToApproval(approvalId, approved); }
    catch (error) { setError(error); throw error; }
  }

  async function stop(): Promise<void> {
    if (!activeTurnId.value) return;
    try { await interruptTurn(activeTurnId.value); }
    catch (error) { setError(error); throw error; }
    finally { busy.value = false; }
  }

  function handleEvent(event: AgentEvent): void {
    if (event.type === "profile/changed") void refreshProfiles();
    if (event.type === "session/changed") void refreshSessions();
    if (event.sessionId && event.sessionId !== currentSessionId.value) return;
    if (event.type === "message/delta") {
      const text = (event.payload as { text?: string })?.text ?? "";
      const last = messages.value.at(-1);
      if (last?.role === "assistant" && last.turnId === event.turnId) last.content += text;
      else messages.value.push({ id: event.eventId, sessionId: event.sessionId!, turnId: event.turnId ?? null, role: "assistant", content: text, sequence: event.sequence ?? messages.value.length + 1, createdAt: event.createdAt });
    }
    if (event.type === "approval/requested") approvals.value.push(event.payload as ApprovalView);
    if (event.type === "turn/failed") setError((event.payload as { message?: string }).message ?? "Agent 执行失败");
    if (["turn/completed", "turn/failed", "turn/interrupted"].includes(event.type)) {
      busy.value = false;
      activeTurnId.value = undefined;
      void refreshSessions();
    }
  }

  function setError(error: unknown): void { errorMessage.value = error instanceof Error ? error.message : String(error); }
  function dispose(): void { unsubscribe?.(); initialized = false; }

  return {
    profiles, availableModels, modelsLoading, modelsError, workspaces, sessions, messages, approvals, currentWorkspaceId, currentSessionId,
    activeTurnId, busy, errorMessage, initialize, refreshProfiles, chooseWorkspace, newSession,
    selectSession, send, answerApproval, stop, saveProfile, removeProfile, loadModels, dispose,
  };
});
