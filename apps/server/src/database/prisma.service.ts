import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function databaseUrl(): string {
  if (process.env.HCODE_DATABASE_URL) return process.env.HCODE_DATABASE_URL;

  const fromRepositoryRoot = resolve(
    process.cwd(),
    'packages/agent-storage/agent.db',
  );
  const fromServerDirectory = resolve(
    process.cwd(),
    '../../packages/agent-storage/agent.db',
  );
  const path = existsSync(resolve(process.cwd(), 'packages/agent-storage'))
    ? fromRepositoryRoot
    : fromServerDirectory;
  return `file:${path}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasources: { db: { url: databaseUrl() } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.migrateModelProfilesTimestampColumns();
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_model_profiles_default_updated ON model_profiles (is_default, updated_at)',
    );
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        folders TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at BIGINT NOT NULL,
        last_opened_at BIGINT NOT NULL
      )
    `);
    await this.migrateWorkspaceStatusColumn();
    await this.migrateWorkspaceFoldersColumn();
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_sessions_workspace_updated ON sessions (workspace_id, updated_at)',
    );
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turn_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        reasoning TEXT,
        tool_calls TEXT,
        stream_status TEXT,
        started_at BIGINT,
        completed_at BIGINT,
        sequence INTEGER NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(session_id, sequence)
      )
    `);
    await this.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_messages_session_sequence ON messages (session_id, sequence)',
    );
    await this.migrateMessageStreamColumns();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async migrateModelProfilesTimestampColumns(): Promise<void> {
    const table = await this.$queryRawUnsafe<Array<{ sql: string | null }>>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'model_profiles'",
    );
    const definition = table[0]?.sql?.toUpperCase() ?? '';
    if (!definition || !/CREATED_AT\s+INTEGER/.test(definition)) return;

    await this.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
    try {
      await this.$executeRawUnsafe(`
        CREATE TABLE model_profiles_prisma_migration (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_key TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
      await this.$executeRawUnsafe(`
        INSERT INTO model_profiles_prisma_migration
        SELECT id, name, provider, model, base_url, api_key, is_default,
          created_at, updated_at
        FROM model_profiles
      `);
      await this.$executeRawUnsafe('DROP TABLE model_profiles');
      await this.$executeRawUnsafe(
        'ALTER TABLE model_profiles_prisma_migration RENAME TO model_profiles',
      );
    } finally {
      await this.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    }
  }

  private async migrateMessageStreamColumns(): Promise<void> {
    const columns = await this.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info(messages)',
    );
    const existing = new Set(columns.map((column) => column.name));
    const additions = [
      ['reasoning', 'TEXT'],
      ['tool_calls', 'TEXT'],
      ['stream_status', 'TEXT'],
      ['started_at', 'BIGINT'],
      ['completed_at', 'BIGINT'],
    ] as const;
    for (const [name, type] of additions) {
      if (!existing.has(name)) {
        await this.$executeRawUnsafe(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
      }
    }
  }

  private async migrateWorkspaceStatusColumn(): Promise<void> {
    const columns = await this.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info(workspaces)',
    );
    if (!columns.some((column) => column.name === 'status')) {
      await this.$executeRawUnsafe(
        "ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
      );
    }
  }

  private async migrateWorkspaceFoldersColumn(): Promise<void> {
    const columns = await this.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info(workspaces)',
    );
    if (!columns.some((column) => column.name === 'folders')) {
      await this.$executeRawUnsafe('ALTER TABLE workspaces ADD COLUMN folders TEXT');
    }
    const rows = await this.$queryRawUnsafe<Array<{ id: string; path: string; folders: string | null }>>(
      'SELECT id, path, folders FROM workspaces WHERE folders IS NULL OR folders = \'\'',
    );
    for (const row of rows) {
      await this.$executeRaw`
        UPDATE workspaces SET folders = ${JSON.stringify([row.path])} WHERE id = ${row.id}
      `;
    }
  }
}
