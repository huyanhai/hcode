import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponseStreamAdapter } from "../dist/openai-stream-adapter.js";

test("accumulates text and reasoning deltas", () => {
  const adapter = new OpenAIResponseStreamAdapter();

  assert.deepEqual(adapter.adapt({ type: "response.output_text.delta", delta: "Hello", item_id: "message-1", content_index: 0 }), [
    { type: "text", text: "Hello", itemId: "message-1", contentIndex: 0 },
  ]);
  assert.deepEqual(adapter.adapt({ type: "response.reasoning_text.delta", delta: "Plan" }), [{ type: "reasoning", text: "Plan", itemId: undefined, contentIndex: undefined }]);

  assert.equal(adapter.snapshot().text, "Hello");
  assert.equal(adapter.snapshot().reasoning, "Plan");
});

test("correlates function calls with argument deltas", () => {
  const adapter = new OpenAIResponseStreamAdapter();
  const created = adapter.adapt({
    type: "response.output_item.added",
    output_index: 0,
    item: { id: "item-1", type: "function_call", call_id: "call-1", name: "readFile", arguments: "" },
  });

  assert.equal(created[1]?.type, "tool-call");
  assert.deepEqual(adapter.adapt({ type: "response.function_call_arguments.delta", item_id: "item-1", delta: '{"path":' })[0], {
    type: "tool-call-delta",
    toolCallId: "call-1",
    delta: '{"path":',
    itemId: "item-1",
  });
  assert.deepEqual(adapter.adapt({ type: "response.function_call_arguments.done", item_id: "item-1", arguments: '{"path":"a.ts"}' })[0], {
    type: "tool-call-delta",
    toolCallId: "call-1",
    delta: "",
    itemId: "item-1",
    arguments: '{"path":"a.ts"}',
    done: true,
  });

  assert.deepEqual(adapter.snapshot().toolCalls["call-1"], {
    callId: "call-1",
    itemId: "item-1",
    name: "readFile",
    arguments: '{"path":"a.ts"}',
    status: "done",
  });

  const custom = new OpenAIResponseStreamAdapter();
  custom.adapt({ type: "response.output_item.added", output_index: 0, item: { id: "custom-1", type: "custom_tool_call", call_id: "custom-call", name: "applyPatch", input: "" } });
  custom.adapt({ type: "response.custom_tool_call_input.done", item_id: "custom-1", input: "patch" });
  assert.equal(custom.snapshot().toolCalls["custom-call"]?.arguments, "patch");
});

test("tracks output content and terminal response state", () => {
  const adapter = new OpenAIResponseStreamAdapter();
  adapter.adapt({ type: "response.content_part.added", item_id: "message-1", output_index: 0, content_index: 0, part: { type: "output_text", text: "" } });
  adapter.adapt({ type: "response.content_part.done", item_id: "message-1", output_index: 0, content_index: 0, part: { type: "output_text", text: "Done" } });

  assert.equal(adapter.snapshot().contentParts["message-1:0"]?.status, "done");
  assert.deepEqual(adapter.adapt({ type: "response.completed", response: { id: "resp-1" } })[0], {
    type: "response-lifecycle",
    phase: "completed",
    responseId: "resp-1",
    response: { id: "resp-1" },
    sourceType: "response.completed",
  });
  assert.equal(adapter.snapshot().phase, "completed");
  assert.equal(adapter.snapshot().responseId, "resp-1");

  adapter.adapt({ type: "response.reasoning_text.done", item_id: "reasoning-1", output_index: 1, content_index: 0, text: "Final reasoning" });
  assert.equal(adapter.snapshot().contentParts["reasoning-1:0"]?.part, "Final reasoning");
});

test("normalizes media, tool progress, and errors", () => {
  const adapter = new OpenAIResponseStreamAdapter();

  assert.deepEqual(adapter.adapt({ type: "response.audio.transcript.delta", delta: "spoken" })[0], {
    type: "media",
    kind: "audio-transcript",
    status: "delta",
    data: "spoken",
  });
  assert.deepEqual(adapter.adapt({ type: "response.file_search_call.searching", item_id: "search-1", output_index: 2 })[0], {
    type: "tool-progress",
    toolName: "file-search",
    status: "searching",
    itemId: "search-1",
    outputIndex: 2,
    data: { type: "response.file_search_call.searching", item_id: "search-1", output_index: 2 },
  });
  const error = adapter.adapt({ type: "error", message: "bad input", code: "invalid_request" })[0];
  assert.equal(error?.type, "error");
  assert.equal(adapter.snapshot().phase, "failed");
  assert.deepEqual(adapter.snapshot().error, { message: "bad input", code: "invalid_request" });
});

test("preserves events without a core mapping", () => {
  const adapter = new OpenAIResponseStreamAdapter();
  const payload = { type: "response.future_feature.changed", value: 1 };

  assert.deepEqual(adapter.adapt(payload)[0], {
    type: "provider-event",
    provider: "openai",
    sourceType: "response.future_feature.changed",
    payload,
  });
  assert.deepEqual(adapter.snapshot().providerEvents, [{ sourceType: "response.future_feature.changed", payload }]);
});
