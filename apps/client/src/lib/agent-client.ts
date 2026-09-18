import type { AgentEvent, Command, Message, ModelProfileSummary, Session, Workspace } from "@hcode/agent-protocol";

function requestId(): string { return crypto.randomUUID(); }

async function request<T>(type: Command["type"], payload: unknown = {}): Promise<T> {
  if (!window.agent) throw new Error("Agent runtime is unavailable in browser preview");
  const response = await window.agent.request({ requestId: requestId(), type, payload });
  if (!response.ok) throw new Error(response.error?.message ?? "Agent request failed");
  return response.data as T;
}

export function listProfiles(): Promise<ModelProfileSummary[]> { return request<ModelProfileSummary[]>("profile/list"); }
export function listWorkspaces(): Promise<Workspace[]> { return request<Workspace[]>("workspace/list"); }
export function upsertWorkspace(path: string): Promise<Workspace> { return request<Workspace>("workspace/upsert", { path }); }
export function listSessions(workspaceId: string): Promise<Session[]> { return request<Session[]>("session/list", { workspaceId }); }
export function createSession(workspaceId: string): Promise<Session> { return request<Session>("session/create", { workspaceId }); }
export function openSession(sessionId: string): Promise<{ session: Session; messages: Message[]; events: AgentEvent[] }> { return request("session/open", { sessionId }); }
export function startTurn(sessionId: string, profileId: string, content: string, permissionMode: "restricted" | "full"): Promise<{ turnId: string }> { return request("turn/start", { sessionId, profileId, content, permissionMode }); }
export function interruptTurn(turnId: string): Promise<{ interrupted: boolean }> { return request("turn/interrupt", { turnId }); }
export function respondToApproval(approvalId: string, approved: boolean): Promise<{ turnId: string }> { return request("approval/respond", { approvalId, approved }); }
export function subscribeToAgentEvents(listener: (event: AgentEvent) => void): () => void { return window.agent?.onEvent(listener) ?? (() => undefined); }
