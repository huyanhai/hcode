import type {
  AgentEvent,
  Message,
  ModelProfile,
  ModelProfileSummary,
  Session,
  Workspace,
  RuntimeResponse,
} from "@hcode/agent-protocol";
import type { Database } from "./database.js";

type Row = Record<string, unknown>;

const now = () => Date.now();

function profileFromRow(row: Row): ModelProfile {
  return {
    id: String(row.id), name: String(row.name), provider: String(row.provider),
    model: String(row.model), baseUrl: String(row.base_url), apiKey: String(row.api_key),
    isDefault: Boolean(row.is_default), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

function summaryFromProfile(profile: ModelProfile): ModelProfileSummary {
  const { apiKey, ...summary } = profile;
  return {
    ...summary,
    apiKeyHint: apiKey.length > 4 ? `...${apiKey.slice(-4)}` : "****",
  };
}

export class ProfileRepository {
  constructor(private readonly database: Database) {}

  list(): ModelProfileSummary[] {
    const rows = this.database.prepare("SELECT * FROM model_profiles ORDER BY is_default DESC, updated_at DESC").all() as Row[];
    return rows.map((row) => summaryFromProfile(profileFromRow(row)));
  }

  get(id: string): ModelProfile | null {
    const row = this.database.prepare("SELECT * FROM model_profiles WHERE id = ?").get(id) as Row | undefined;
    return row ? profileFromRow(row) : null;
  }

  upsert(input: Omit<ModelProfile, "createdAt" | "updatedAt">): ModelProfileSummary {
    const timestamp = now();
    const existing = this.get(input.id);
    if (input.isDefault) this.database.prepare("UPDATE model_profiles SET is_default = 0").run();
    this.database.prepare(`
      INSERT INTO model_profiles (id, name, provider, model, base_url, api_key, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, provider=excluded.provider, model=excluded.model,
        base_url=excluded.base_url, api_key=excluded.api_key, is_default=excluded.is_default, updated_at=excluded.updated_at
    `).run(input.id, input.name, input.provider, input.model, input.baseUrl, input.apiKey,
      input.isDefault ? 1 : 0, existing?.createdAt ?? timestamp, timestamp);
    return summaryFromProfile(this.get(input.id)!);
  }

  delete(id: string): void { this.database.prepare("DELETE FROM model_profiles WHERE id = ?").run(id); }
}

export class WorkspaceRepository {
  constructor(private readonly database: Database) {}

  list(): Workspace[] {
    const rows = this.database.prepare("SELECT * FROM workspaces ORDER BY last_opened_at DESC").all() as Row[];
    return rows.map((row) => ({ id: String(row.id), path: String(row.path), name: String(row.name), createdAt: Number(row.created_at), lastOpenedAt: Number(row.last_opened_at) }));
  }

  upsert(input: { id: string; path: string; name: string }): Workspace {
    const timestamp = now();
    this.database.prepare(`
      INSERT INTO workspaces (id, path, name, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET name=excluded.name, last_opened_at=excluded.last_opened_at
    `).run(input.id, input.path, input.name, timestamp, timestamp);
    const row = this.database.prepare("SELECT * FROM workspaces WHERE path = ?").get(input.path) as Row;
    return { id: String(row.id), path: String(row.path), name: String(row.name), createdAt: Number(row.created_at), lastOpenedAt: Number(row.last_opened_at) };
  }

  get(id: string): Workspace | null {
    const row = this.database.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Row | undefined;
    return row ? { id: String(row.id), path: String(row.path), name: String(row.name), createdAt: Number(row.created_at), lastOpenedAt: Number(row.last_opened_at) } : null;
  }
}

export class SessionRepository {
  constructor(private readonly database: Database) {}

  list(workspaceId?: string): Session[] {
    const statement = workspaceId
      ? this.database.prepare("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC")
      : this.database.prepare("SELECT * FROM sessions ORDER BY updated_at DESC");
    const rows = (workspaceId ? statement.all(workspaceId) : statement.all()) as Row[];
    return rows.map((row) => ({ id: String(row.id), workspaceId: String(row.workspace_id), title: String(row.title), status: row.status as Session["status"], createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) }));
  }

  get(id: string): Session | null {
    const row = this.database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
    return row ? { id: String(row.id), workspaceId: String(row.workspace_id), title: String(row.title), status: row.status as Session["status"], createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) } : null;
  }

  create(input: { id: string; workspaceId: string; title: string }): Session {
    const timestamp = now();
    this.database.prepare("INSERT INTO sessions (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(input.id, input.workspaceId, input.title, timestamp, timestamp);
    return this.get(input.id)!;
  }

  touch(id: string): void { this.database.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now(), id); }

  setTitle(id: string, title: string): void {
    this.database.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?").run(title, now(), id);
  }
}

export class MessageRepository {
  constructor(private readonly database: Database) {}

  list(sessionId: string): Message[] {
    const rows = this.database.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY sequence").all(sessionId) as Row[];
    return rows.map((row) => ({ id: String(row.id), sessionId: String(row.session_id), turnId: row.turn_id ? String(row.turn_id) : null, role: row.role as Message["role"], content: String(row.content), sequence: Number(row.sequence), createdAt: Number(row.created_at) }));
  }

  append(input: { id: string; sessionId: string; turnId?: string; role: Message["role"]; content: string }): Message {
    const sequence = Number((this.database.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM messages WHERE session_id = ?").get(input.sessionId) as Row).next);
    const timestamp = now();
    this.database.prepare("INSERT INTO messages (id, session_id, turn_id, role, content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(input.id, input.sessionId, input.turnId ?? null, input.role, input.content, sequence, timestamp);
    return { id: input.id, sessionId: input.sessionId, turnId: input.turnId ?? null, role: input.role, content: input.content, sequence, createdAt: timestamp };
  }
}

export class EventRepository {
  constructor(private readonly database: Database) {}

  append(event: AgentEvent): AgentEvent {
    if (!event.sessionId) throw new Error("sessionId is required for persisted events");
    const sequence = Number((this.database.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM agent_events WHERE session_id = ?").get(event.sessionId) as Row).next);
    this.database.prepare("INSERT INTO agent_events (id, session_id, turn_id, sequence, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(event.eventId, event.sessionId, event.turnId ?? null, sequence, event.type, JSON.stringify(event.payload ?? null), event.createdAt);
    return { ...event, sequence };
  }

  listAfter(sessionId: string, sequence: number): AgentEvent[] {
    const rows = this.database.prepare("SELECT * FROM agent_events WHERE session_id = ? AND sequence > ? ORDER BY sequence").all(sessionId, sequence) as Row[];
    return rows.map((row) => ({ eventId: String(row.id), sessionId: String(row.session_id), turnId: row.turn_id ? String(row.turn_id) : undefined, sequence: Number(row.sequence), type: row.type as AgentEvent["type"], payload: JSON.parse(String(row.payload_json)) as unknown, createdAt: Number(row.created_at) }));
  }
}

export class TurnRepository {
  constructor(private readonly database: Database) {}

  create(input: { id: string; sessionId: string; profile: ModelProfile }): void {
    this.database.prepare("INSERT INTO turns (id, session_id, profile_id, provider, model, base_url, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)").run(input.id, input.sessionId, input.profile.id, input.profile.provider, input.profile.model, input.profile.baseUrl, now());
  }

  setStatus(id: string, status: string): void { this.database.prepare("UPDATE turns SET status = ?, completed_at = ? WHERE id = ?").run(status, now(), id); }

  markRunningAsInterrupted(): void { this.database.prepare("UPDATE turns SET status = 'interrupted', completed_at = ? WHERE status = 'running'").run(now()); }
}

export class ToolCallRepository {
  constructor(private readonly database: Database) {}

  create(input: { id: string; turnId: string; toolName: string; input: unknown }): void {
    this.database.prepare("INSERT INTO tool_calls (id, turn_id, tool_name, input_json, status, started_at) VALUES (?, ?, ?, ?, 'running', ?) ON CONFLICT(id) DO NOTHING").run(input.id, input.turnId, input.toolName, JSON.stringify(input.input), now());
  }

  complete(id: string, status: string, output?: unknown): void { this.database.prepare("UPDATE tool_calls SET status = ?, output_json = ?, completed_at = ? WHERE id = ?").run(status, output === undefined ? null : JSON.stringify(output), now(), id); }
}

export class ApprovalRepository {
  constructor(private readonly database: Database) {}

  create(input: { id: string; turnId: string; toolCallId: string; toolName: string; toolInput: unknown; inputHash: string }): void {
    this.database.prepare(`
      INSERT INTO approval_requests (id, turn_id, tool_call_id, tool_name, input_json, input_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(input.id, input.turnId, input.toolCallId, input.toolName, JSON.stringify(input.toolInput), input.inputHash, now());
  }

  respond(id: string, approved: boolean, reason?: string): void {
    this.database.prepare("UPDATE approval_requests SET status = ?, reason = ?, responded_at = ? WHERE id = ?")
      .run(approved ? "approved" : "denied", reason ?? null, now(), id);
  }
}

export class RuntimeRequestRepository {
  constructor(private readonly database: Database) {}

  get(requestId: string): RuntimeResponse | null {
    const row = this.database.prepare("SELECT response_json FROM runtime_requests WHERE request_id = ?").get(requestId) as Row | undefined;
    return row ? JSON.parse(String(row.response_json)) as RuntimeResponse : null;
  }

  save(requestId: string, response: RuntimeResponse): void {
    this.database.prepare("INSERT OR IGNORE INTO runtime_requests (request_id, response_json, created_at) VALUES (?, ?, ?)")
      .run(requestId, JSON.stringify(response), now());
  }
}
