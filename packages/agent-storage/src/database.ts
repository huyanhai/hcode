import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

export function openDatabase(filename: string): Database {
  mkdirSync(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(database);
  return database;
}

function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      profile_id TEXT REFERENCES model_profiles(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id, sequence)
    );
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      tool_call_id TEXT NOT NULL REFERENCES tool_calls(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS runtime_requests (
      request_id TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence);
    CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events(session_id, sequence);
  `);
}

export function closeDatabase(database: Database): void {
  database.close();
}
