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
});
