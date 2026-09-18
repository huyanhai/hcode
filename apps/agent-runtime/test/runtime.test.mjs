import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runtimePath = fileURLToPath(new URL("../dist/index.cjs", import.meta.url));

function startRuntime(directory) {
  const child = spawn(process.execPath, [runtimePath], {
    env: { ...process.env, HCODE_DB_PATH: join(directory, "runtime.db") },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout });
  const waiting = new Map();
  const events = [];
  const eventWaiters = new Set();
  lines.on("line", (line) => {
    const envelope = JSON.parse(line);
    if (envelope.type === "response") {
      waiting.get(envelope.response.requestId)?.(envelope.response);
      waiting.delete(envelope.response.requestId);
      return;
    }
    events.push(envelope.event);
    for (const waiter of eventWaiters) waiter(envelope.event);
  });

  return {
    request(type, payload, requestId = crypto.randomUUID()) {
      return new Promise((resolve) => {
        waiting.set(requestId, resolve);
        child.stdin.write(`${JSON.stringify({ requestId, type, payload })}\n`);
      });
    },
    waitForEvent(type, timeoutMs = 5_000) {
      const existing = events.find((event) => event.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          eventWaiters.delete(onEvent);
          reject(new Error(`Timed out waiting for ${type}`));
        }, timeoutMs);
        const onEvent = (event) => {
          if (event.type !== type) return;
          clearTimeout(timer);
          eventWaiters.delete(onEvent);
          resolve(event);
        };
        eventWaiters.add(onEvent);
      });
    },
    async close() {
      child.stdin.end();
      await once(child, "exit");
    },
  };
}

test("JSONL runtime persists commands and deduplicates requestId", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hcode-runtime-"));
  const runtime = startRuntime(directory);
  try {
    const workspaceResponse = await runtime.request("workspace/upsert", { path: directory });
    assert.equal(workspaceResponse.ok, true);
    const profileResponse = await runtime.request("profile/upsert", { name: "Test", provider: "openai", model: "test", baseUrl: "http://localhost:1234/v1", apiKey: "secret", isDefault: true });
    assert.equal(profileResponse.ok, true);
    assert.equal(profileResponse.data.apiKey, undefined);

    const invalidRequestId = crypto.randomUUID();
    const invalidResponse = await runtime.request("profile/upsert", { name: "Incomplete" }, invalidRequestId);
    assert.equal(invalidResponse.requestId, invalidRequestId);
    assert.equal(invalidResponse.error.code, "INVALID_COMMAND");

    const requestId = crypto.randomUUID();
    const sessionResponse = await runtime.request("session/create", { workspaceId: workspaceResponse.data.id }, requestId);
    const duplicateResponse = await runtime.request("session/create", { workspaceId: workspaceResponse.data.id }, requestId);
    assert.deepEqual(duplicateResponse, sessionResponse);
    const listResponse = await runtime.request("session/list", { workspaceId: workspaceResponse.data.id });
    assert.equal(listResponse.data.length, 1);

    const openResponse = await runtime.request("session/open", { sessionId: sessionResponse.data.id });
    assert.deepEqual(openResponse.data.messages, []);
  } finally {
    await runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime streams an OpenAI-compatible response through Vercel AI SDK", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hcode-stream-"));
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    requests.push({ url: request.url, body: JSON.parse(body) });
    response.writeHead(200, { "content-type": "text/event-stream" });
    const base = { id: "chatcmpl-test", object: "chat.completion.chunk", created: 1, model: "test" };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: "hello from fake model" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 4, total_tokens: 5 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const runtime = startRuntime(directory);

  try {
    const workspace = await runtime.request("workspace/upsert", { path: directory });
    const profile = await runtime.request("profile/upsert", {
      name: "Fake OpenAI",
      provider: "openai",
      model: "test",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: "local-test-key",
      isDefault: true,
    });
    const session = await runtime.request("session/create", { workspaceId: workspace.data.id });
    const turn = await runtime.request("turn/start", { sessionId: session.data.id, profileId: profile.data.id, content: "hello", permissionMode: "restricted" });
    assert.equal(turn.ok, true);
    await runtime.waitForEvent("turn/completed");

    const opened = await runtime.request("session/open", { sessionId: session.data.id });
    assert.deepEqual(opened.data.messages.map((message) => [message.role, message.content]), [
      ["user", "hello"],
      ["assistant", "hello from fake model"],
    ]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v1/chat/completions");
    assert.equal(requests[0].body.model, "test");
  } finally {
    await runtime.close();
    server.close();
    await once(server, "close");
    rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime lists OpenAI-compatible models without exposing saved credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hcode-models-"));
  const requests = [];
  const secret = "saved-local-key";
  const providerBody = `provider leaked ${secret} Authorization: Bearer ${secret}`;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      accept: request.headers.accept,
      body,
    });

    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "model-b" }, { id: "model-a" }, { id: "model-b" }, { id: "" }, {}] }));
      return;
    }
    if (request.url === "/unauthorized/models") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(providerBody);
      return;
    }
    if (request.url === "/invalid/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("not-json");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const runtime = startRuntime(directory);

  try {
    const profile = await runtime.request("profile/upsert", {
      name: "Catalog",
      provider: "openai",
      model: "model-a",
      baseUrl: `${origin}/v1/`,
      apiKey: secret,
      isDefault: true,
    });
    assert.equal(profile.ok, true);

    const listed = await runtime.request("model/list", {
      profileId: profile.data.id,
      baseUrl: `${origin}/v1`,
    });
    assert.deepEqual(listed, {
      requestId: listed.requestId,
      ok: true,
      data: { models: ["model-a", "model-b"] },
    });
    assert.deepEqual(requests[0], {
      method: "GET",
      url: "/v1/models",
      authorization: `Bearer ${secret}`,
      accept: "application/json",
      body: "",
    });

    const countBeforeChangedUrl = requests.length;
    const changedUrl = await runtime.request("model/list", {
      profileId: profile.data.id,
      baseUrl: `${origin}/different`,
    });
    assert.equal(changedUrl.ok, false);
    assert.equal(changedUrl.error.code, "API_KEY_REQUIRED");
    assert.equal(requests.length, countBeforeChangedUrl);

    const changedProfile = await runtime.request("profile/upsert", {
      id: profile.data.id,
      name: "Catalog",
      provider: "openai",
      model: "model-a",
      baseUrl: `${origin}/different`,
      isDefault: true,
    });
    assert.equal(changedProfile.ok, false);
    assert.equal(changedProfile.error.code, "API_KEY_REQUIRED");

    const unauthorized = await runtime.request("model/list", {
      baseUrl: `${origin}/unauthorized`,
      apiKey: secret,
    });
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.error.code, "MODEL_LIST_HTTP_ERROR");
    assert.equal(JSON.stringify(unauthorized).includes(secret), false);
    assert.equal(JSON.stringify(unauthorized).includes(providerBody), false);

    const invalid = await runtime.request("model/list", {
      baseUrl: `${origin}/invalid`,
      apiKey: secret,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "MODEL_LIST_INVALID_RESPONSE");

    const empty = await runtime.request("model/list", {
      baseUrl: `${origin}/empty`,
      apiKey: secret,
    });
    assert.equal(empty.ok, false);
    assert.equal(empty.error.code, "MODEL_LIST_EMPTY");

    const invalidUrl = await runtime.request("model/list", {
      baseUrl: "not-a-url",
      apiKey: secret,
    });
    assert.equal(invalidUrl.ok, false);
    assert.equal(invalidUrl.error.code, "INVALID_COMMAND");
  } finally {
    await runtime.close();
    server.close();
    await once(server, "close");
    rmSync(directory, { recursive: true, force: true });
  }
});
