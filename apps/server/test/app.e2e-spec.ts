import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/agent/agent.module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let databaseDirectory: string;

  beforeAll(async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), 'hcode-server-'));
    process.env.HCODE_DATABASE_URL = `file:${join(databaseDirectory, 'test.db')}`;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: '-1',
            message: errors
              .flatMap((error) => Object.values(error.constraints ?? {}))
              .join('; '),
          }),
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.HCODE_DATABASE_URL;
    rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ code: '0', data: 'Hello World!', message: '' });
  });

  it('creates, edits and lists a model profile without returning its API key', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: 'OpenAI 主账号',
        provider: 'openai',
        model: 'gpt-5.6-sol',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        isDefault: true,
      })
      .expect(200);

    expect(created.body.code).toBe('0');
    expect(created.body.data.apiKeyHint).toBe('...-key');
    expect(created.body.data.apiKey).toBeUndefined();

    const id = created.body.data.id as string;
    const edited = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        id,
        name: 'OpenAI 更新',
        provider: 'openai',
        model: 'gpt-5.6-sol',
        baseUrl: 'https://api.openai.com/v1',
      })
      .expect(200);

    expect(edited.body.data.name).toBe('OpenAI 更新');
    expect(edited.body.data.apiKeyHint).toBe('...-key');

    const listed = await request(app.getHttpServer())
      .get('/api/model-profiles')
      .expect(200);

    expect(listed.body.code).toBe('0');
    expect(listed.body.data).toEqual([
      expect.objectContaining({ id, name: 'OpenAI 更新', isDefault: true }),
    ]);
  });

  it('keeps only the latest selected default profile', async () => {
    await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: 'Anthropic 主账号',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-anthropic-key',
        isDefault: true,
      })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get('/api/model-profiles')
      .expect(200);

    expect(listed.body.data).toEqual([
      expect.objectContaining({ name: 'Anthropic 主账号', isDefault: true }),
      expect.objectContaining({ name: 'OpenAI 更新', isDefault: false }),
    ]);
  });

  it('requires an API key when creating a profile', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: 'Missing key',
        provider: 'openai',
        model: 'gpt-5.6-sol',
        baseUrl: 'https://api.openai.com/v1',
      })
      .expect(400);

    expect(response.body).toEqual({
      code: '-1',
      message: '新增模型配置时 API Key 必填',
      data: null,
    });
  });

  it('validates DTO fields before entering the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: '',
        provider: 'openai',
        model: 'gpt-5.6-sol',
        baseUrl: 'ftp://invalid.example.com/v1',
        apiKey: 'sk-test-key',
        unexpected: true,
      })
      .expect(400);

    expect(response.body.code).toBe('-1');
    expect(response.body.message).toContain('property unexpected should not exist');
    expect(response.body.data).toBeNull();
  });

  it('gets provider models on the server with the stored API key', async () => {
    const provider = await import('node:http');
    const server = provider.createServer((request, response) => {
      expect(request.url).toBe('/v1/models');
      expect(request.headers.authorization).toBe('Bearer sk-model-key');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'remote-model' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not start');

    const created = await request(app.getHttpServer())
      .post('/api/model-profiles/upsert')
      .send({
        name: 'Model provider',
        provider: 'openai',
        model: 'configured-model',
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: 'sk-model-key',
      })
      .expect(200);

    const models = await request(app.getHttpServer())
      .post('/api/model-profiles/models')
      .send({ profileId: created.body.data.id })
      .expect(200);

    expect(models.body).toEqual({
      code: '0',
      data: { models: ['remote-model'] },
      message: '',
    });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('creates and lists sessions for a workspace', async () => {
    const workspace = await request(app.getHttpServer())
      .post('/api/workspaces/create')
      .send({ name: '会话测试项目', path: join(databaseDirectory, 'session-project') })
      .expect(200);

    const created = await request(app.getHttpServer())
      .post('/api/sessions/create')
      .send({ workspaceId: workspace.body.data.id })
      .expect(200);

    const duplicate = await request(app.getHttpServer())
      .post('/api/sessions/create')
      .send({ workspaceId: workspace.body.data.id })
      .expect(200);
    expect(duplicate.body.data.id).toBe(created.body.data.id);

    expect(created.body).toEqual({
      code: '0',
      data: expect.objectContaining({
        workspaceId: workspace.body.data.id,
        title: '新会话',
        status: 'active',
      }),
      message: '',
    });

    const listed = await request(app.getHttpServer())
      .get(`/api/sessions?workspaceId=${workspace.body.data.id}`)
      .expect(200);

    expect(listed.body.data).toEqual([
      expect.objectContaining({ id: created.body.data.id, title: '新会话' }),
    ]);
  });

  it('opens a session and persists user and assistant messages', async () => {
    const provider = await import('node:http');
    const server = provider.createServer(async (incoming, response) => {
      let body = '';
      for await (const chunk of incoming) body += chunk.toString();
      expect(incoming.url).toBe('/v1/responses');
      expect(JSON.parse(body).input.at(-1).content.at(-1).text).toBe('hello');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: 'resp_1',
        created_at: Math.floor(Date.now() / 1000),
        model: 'test-model',
        output: [{
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'hello back', annotations: [] }],
        }],
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          input_tokens_details: {},
          output_tokens_details: {},
        },
      }));
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not start');

    try {
      const profile = await request(app.getHttpServer())
        .post('/api/model-profiles/upsert')
        .send({
          name: 'Session provider',
          provider: 'openai',
          model: 'test-model',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: 'session-key',
          isDefault: true,
        })
        .expect(200);
      const workspace = await request(app.getHttpServer())
        .post('/api/workspaces/create')
        .send({ name: '消息测试项目', path: join(databaseDirectory, 'message-project') })
        .expect(200);
      const session = await request(app.getHttpServer())
        .post('/api/sessions/create')
        .send({ workspaceId: workspace.body.data.id })
        .expect(200);

      const opened = await request(app.getHttpServer())
        .get(`/api/sessions/${session.body.data.id}`)
        .expect(200);
      expect(opened.body.data.messages).toEqual([]);

      const sent = await request(app.getHttpServer())
        .post(`/api/sessions/${session.body.data.id}/messages`)
        .send({
          content: 'hello',
          profileId: profile.body.data.id,
          model: 'test-model',
        })
        .expect(200);

      expect(sent.body.data.messages.map((message: { role: string; content: string }) => [message.role, message.content])).toEqual([
        ['user', 'hello'],
        ['assistant', 'hello back'],
      ]);
      expect(sent.body.data.session.title).toBe('hello');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('streams assistant output through the session endpoint', async () => {
    const provider = await import('node:http');
    const server = provider.createServer(async (incoming, response) => {
      let body = '';
      for await (const chunk of incoming) body += chunk.toString();
      expect(incoming.url).toBe('/v1/responses');
      expect(JSON.parse(body).input.at(-1).content.at(-1).text).toBe('stream me');
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream',
      });
      response.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', item_id: 'msg_1', delta: 'hello ' })}\n\n`);
      response.write(`data: ${JSON.stringify({ type: 'response.output_text.delta', item_id: 'msg_1', delta: 'stream' })}\n\n`);
      response.end(`data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            input_tokens_details: {},
            output_tokens_details: {},
          },
        },
      })}\n\n`);
    });
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not start');

    try {
      const profile = await request(app.getHttpServer())
        .post('/api/model-profiles/upsert')
        .send({
          name: 'Streaming provider',
          provider: 'openai',
          model: 'stream-model',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          apiKey: 'stream-key',
          isDefault: true,
        })
        .expect(200);
      const workspace = await request(app.getHttpServer())
        .post('/api/workspaces/create')
        .send({ name: '流式测试项目', path: join(databaseDirectory, 'stream-project') })
        .expect(200);
      const session = await request(app.getHttpServer())
        .post('/api/sessions/create')
        .send({ workspaceId: workspace.body.data.id })
        .expect(200);

      const streamed = await request(app.getHttpServer())
        .post(`/api/sessions/${session.body.data.id}/messages/stream`)
        .send({ content: 'stream me', profileId: profile.body.data.id })
        .expect(200);

      expect(streamed.text).toBe('hello stream');
      const opened = await request(app.getHttpServer())
        .get(`/api/sessions/${session.body.data.id}`)
        .expect(200);
      expect(opened.body.data.messages.at(-1)).toEqual(
        expect.objectContaining({ role: 'assistant', content: 'hello stream' }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
