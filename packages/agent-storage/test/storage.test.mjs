import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { closeDatabase, EventRepository, MessageRepository, openDatabase, ProfileRepository, SessionRepository, TurnRepository, WorkspaceRepository } from "../dist/index.js";

test("repositories persist profiles, sessions, messages and ordered events", () => {
  const directory = mkdtempSync(join(tmpdir(), "hcode-storage-"));
  const database = openDatabase(join(directory, "test.db"));
  try {
    const profiles = new ProfileRepository(database);
    const workspaces = new WorkspaceRepository(database);
    const sessions = new SessionRepository(database);
    const messages = new MessageRepository(database);
    const events = new EventRepository(database);
    const turns = new TurnRepository(database);
    const profile = profiles.upsert({ id: "profile", name: "Local", provider: "openai", model: "test", baseUrl: "http://localhost:1234/v1", apiKey: "secret-key", isDefault: true });
    assert.equal(profile.apiKeyHint, "...-key");
    assert.equal("apiKey" in profile, false);
    const workspace = workspaces.upsert({ id: "workspace", path: directory, name: "test" });
    const session = sessions.create({ id: "session", workspaceId: workspace.id, title: "Session" });
    const fullProfile = profiles.get("profile");
    assert.ok(fullProfile);
    turns.create({ id: "turn", sessionId: session.id, profile: fullProfile });
    messages.append({ id: "message", sessionId: session.id, turnId: "turn", role: "user", content: "hello" });
    const first = events.append({ eventId: "event-1", sessionId: session.id, turnId: "turn", type: "turn/started", payload: {}, createdAt: 1 });
    const second = events.append({ eventId: "event-2", sessionId: session.id, turnId: "turn", type: "message/delta", payload: { text: "hi" }, createdAt: 2 });
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
    assert.equal(messages.list(session.id)[0]?.content, "hello");
    turns.markRunningAsInterrupted();
  } finally {
    closeDatabase(database);
    rmSync(directory, { recursive: true, force: true });
  }
});
