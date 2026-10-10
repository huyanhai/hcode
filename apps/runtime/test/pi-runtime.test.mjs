import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PiRuntime } from '../dist/index.js';

test('durable sessions survive reopen; memory sessions do not', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcode-pi-'));
  const db = join(dir, 'sessions.sqlite');
  try {
    const first = await PiRuntime.open(db, []);
    const durable = await first.create({ workspacePath: dir, folders: [dir] });
    const memory = await first.create({ workspacePath: dir, folders: [dir], persistence: 'memory' });
    assert.deepEqual((await first.list()).map((item) => item.id).sort(), [durable.id, memory.id].sort());
    await first.close();
    const second = await PiRuntime.open(db, []);
    assert.deepEqual((await second.list()).map((item) => item.id), [durable.id]);
    await second.archive(durable.id);
    assert.deepEqual(await second.list(), []);
    await second.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('write tool waits for a durable approval decision', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcode-pi-approval-'));
  const output = join(dir, 'approved.txt');
  let requests = 0;
  const server = createServer(async (_request, response) => {
    requests++;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: `chatcmpl-${requests}`, object: 'chat.completion.chunk', created: 1, model: 'test' };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    if (requests === 1) {
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: output, content: 'approved' }) } }] }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
    } else {
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: 'saved' }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const profile = { id: 'write-test', name: 'Write test', model: 'test', requestType: 'chat', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'key' };
  let runtime;
  try {
    runtime = await PiRuntime.open(join(dir, 'pi.db'), [profile]);
    const session = await runtime.create({ workspacePath: dir, folders: [dir] });
    const submission = await runtime.submit(session.id, { content: 'write', profile });
    const events = [];
    const paused = await runtime.observe(session.id, submission, (event) => events.push(event));
    assert.equal(paused.awaitingApproval, true);
    assert.ok(events.some((event) => event.type === 'hcode.approval_requested'));
    await runtime.close();
    runtime = await PiRuntime.open(join(dir, 'pi.db'), [profile]);
    const approval = await runtime.approval(session.id);
    assert.equal(approval.toolName, 'write');
    assert.equal(await runtime.activeSubmission(session.id), submission);
    await runtime.decide(session.id, approval.approvalId, true);
    const resumed = await runtime.observe(session.id, submission, () => {});
    assert.equal(resumed.awaitingApproval, false);
    assert.equal(readFileSync(output, 'utf8'), 'approved');
    assert.equal(requests, 2);
    const detail = await runtime.detail(session.id);
    assert.deepEqual(detail.messages.map((message) => message.role), ['user', 'assistant']);
    assert.equal(detail.messages[1].content, 'saved');
    assert.equal(detail.messages[1].toolCalls[0].status, 'completed');
  } finally {
    await runtime?.close();
    server.close();
    await once(server, 'close');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Pi submission streams and projects an OpenAI-compatible response', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcode-pi-model-'));
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/image.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q+6EAAAAASUVORK5CYII=', 'base64'));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    requests.push({ url: request.url, body: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test' };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: 'hello from pi' }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 } })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const profile = { id: 'fake', name: 'Fake', model: 'test', requestType: 'chat', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test-key' };
  let runtime;
  try {
    runtime = await PiRuntime.open(join(dir, 'sessions.sqlite'), [profile]);
    const session = await runtime.create({ workspacePath: dir, folders: [dir] });
    const attachment = { id: 'img-1', url: `http://127.0.0.1:${address.port}/image.png`, name: 'image.png', mimeType: 'image/png', size: 68 };
    const comment = { id: 'comment-1', content: 'Please inspect', selectedText: 'hello' };
    const submission = await runtime.submit(session.id, { content: 'hello', profile, attachments: [attachment], comments: [comment] });
    const events = [];
    const result = await runtime.observe(session.id, submission, (event) => events.push(event));
    assert.equal(result.text, 'hello from pi');
    assert.deepEqual((await runtime.detail(session.id)).messages.map((message) => [message.role, message.content]), [['user', 'hello'], ['assistant', 'hello from pi']]);
    assert.equal(requests[0].url, '/v1/chat/completions');
    assert.ok(events.some((event) =>
      event.type === 'message_update' &&
      event.changes.some((change) => change.type === 'text_delta'))
    );
    assert.ok(events.every((event) =>
      !['text', 'reasoning', 'tool-call', 'tool-result', 'done'].includes(event.type)
    ));
    assert.deepEqual((await runtime.detail(session.id)).messages[0].attachments, [attachment]);
    assert.deepEqual((await runtime.detail(session.id)).messages[0].comments, [comment]);
    assert.match(JSON.stringify(requests[0].body), /image_url/);
    const userId = (await runtime.detail(session.id)).messages[0].id;
    await runtime.editLastUser(session.id, userId);
    assert.deepEqual((await runtime.detail(session.id)).messages, []);
    const replacement = await runtime.submit(session.id, { content: 'replacement', profile });
    await runtime.observe(session.id, replacement, () => {});
    assert.deepEqual((await runtime.detail(session.id)).messages.map((message) => message.role), ['user', 'assistant']);
  } finally {
    await runtime?.close();
    server.close();
    await once(server, 'close');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('busy input is queued as a Pi follow-up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hcode-pi-followup-'));
  let calls = 0;
  const server = createServer(async (_request, response) => {
    calls++;
    const call = calls;
    if (call === 1) await new Promise((done) => setTimeout(done, 80));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const base = { id: `chatcmpl-${call}`, object: 'chat.completion.chunk', created: 1, model: 'test' };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: `answer-${call}` }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const profile = { id: 'queue-test', name: 'Queue test', model: 'test', requestType: 'chat', baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'key' };
  let runtime;
  try {
    runtime = await PiRuntime.open(join(dir, 'pi.db'), [profile]);
    const session = await runtime.create({ workspacePath: dir, folders: [dir] });
    const first = await runtime.submit(session.id, { content: 'first', profile });
    const second = await runtime.submit(session.id, { content: 'second', profile, whenBusy: 'followUp' });
    await Promise.all([runtime.observe(session.id, first, () => {}), runtime.observe(session.id, second, () => {})]);
    const messages = (await runtime.detail(session.id)).messages;
    assert.deepEqual(messages.map((message) => [message.role, message.content]), [
      ['user', 'first'], ['assistant', 'answer-1'], ['user', 'second'], ['assistant', 'answer-2'],
    ]);
  } finally {
    await runtime?.close();
    server.close();
    await once(server, 'close');
    rmSync(dir, { recursive: true, force: true });
  }
});
