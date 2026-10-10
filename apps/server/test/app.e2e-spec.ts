import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { createServer, Server } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/agent/agent.module';

describe('Pi-backed sessions (e2e)', () => {
  let app: INestApplication;
  let directory: string;
  let modelServer: Server;
  let modelUrl: string;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'hcode-server-pi-'));
    process.env.HCODE_DATABASE_URL = `file:${join(directory, 'app.db')}`;
    process.env.HCODE_PI_SESSION_DB = join(directory, 'pi.db');
    modelServer = createServer(async (_incoming, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const base = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'test',
      };
      response.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: 'hello from pi' }, finish_reason: null }] })}\n\n`,
      );
      response.write(
        `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 } })}\n\n`,
      );
      response.end('data: [DONE]\n\n');
    });
    modelServer.listen(0, '127.0.0.1');
    await once(modelServer, 'listening');
    const address = modelServer.address();
    if (!address || typeof address === 'string')
      throw new Error('模型测试服务启动失败');
    modelUrl = `http://127.0.0.1:${address.port}/v1`;
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) =>
          new BadRequestException(
            errors
              .flatMap((error) => Object.values(error.constraints ?? {}))
              .join('; '),
          ),
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    modelServer?.close();
    await once(modelServer, 'close');
    delete process.env.HCODE_DATABASE_URL;
    delete process.env.HCODE_PI_SESSION_DB;
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates durable and memory sessions while preserving the HTTP contract', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/workspaces/create')
      .send({ name: 'Test', path: directory })
      .expect(200);
    expect(workspace.body.code).toBe('0');
    const durable = await request(app.getHttpServer())
      .post('/api/sessions/create')
      .send({ workspaceId: workspace.body.data.id })
      .expect(200);
    const memory = await request(app.getHttpServer())
      .post('/api/sessions/create')
      .send({ workspaceId: workspace.body.data.id, persistence: 'memory' })
      .expect(200);
    expect(durable.body.data.id).toMatch(/^d:\d+$/);
    expect(memory.body.data.id).toMatch(/^m:\d+$/);
    const listed = await request(app.getHttpServer())
      .get(`/api/sessions?workspaceId=${workspace.body.data.id}`)
      .expect(200);
    expect(
      listed.body.data.map((item: { id: string }) => item.id).sort(),
    ).toEqual([durable.body.data.id, memory.body.data.id].sort());
    await request(app.getHttpServer())
      .post(`/api/sessions/${durable.body.data.id}/archive`)
      .expect(200);
    const after = await request(app.getHttpServer())
      .get('/api/sessions')
      .expect(200);
    expect(
      after.body.data.map((item: { id: string }) => item.id),
    ).not.toContain(durable.body.data.id);
  });

  it('submits through Pi and reopens the committed transcript', async () => {
    const profile = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: 'Fake OpenAI',
        provider: 'openai',
        model: 'test',
        requestType: 'chat',
        baseUrl: modelUrl,
        apiKey: 'test-key',
        isDefault: true,
      })
      .expect(200);
    const session = await request(app.getHttpServer())
      .post('/api/sessions/create')
      .send({ title: 'Pi test' })
      .expect(200);
    const result = await request(app.getHttpServer())
      .post(`/api/sessions/${session.body.data.id}/messages`)
      .send({ content: 'hello', profileId: profile.body.data.id })
      .expect(200);
    expect(
      result.body.data.messages.map(
        (message: { role: string; content: string }) => [
          message.role,
          message.content,
        ],
      ),
    ).toEqual([
      ['user', 'hello'],
      ['assistant', 'hello from pi'],
    ]);
    const opened = await request(app.getHttpServer())
      .get(`/api/sessions/${session.body.data.id}`)
      .expect(200);
    expect(opened.body.data.messages).toEqual(result.body.data.messages);
  });
});
