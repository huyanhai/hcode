import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

function databaseUrl(): string {
  if (process.env.HCODE_DATABASE_URL) return process.env.HCODE_DATABASE_URL;

  return `file:${resolve(__dirname, '../../database/agent.db')}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private initialization?: Promise<void>;
  constructor() {
    super({ datasources: { db: { url: databaseUrl() } } });
  }

  async onModuleInit(): Promise<void> {
    this.initialization ??= this.initialize();
    await this.initialization;
  }

  private async initialize(): Promise<void> {
    await this.$connect();
    await this.migrateModelProfilesTimestampColumns();
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
      model TEXT NOT NULL,
      request_type TEXT NOT NULL DEFAULT 'response',
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await this.migrateModelProfilesRequestTypeColumn();
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
          request_type TEXT NOT NULL DEFAULT 'response',
          base_url TEXT NOT NULL,
          api_key TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
      await this.$executeRawUnsafe(`
        INSERT INTO model_profiles_prisma_migration
        SELECT id, name, provider, model, 'response', base_url, api_key, is_default,
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

  private async migrateModelProfilesRequestTypeColumn(): Promise<void> {
    const columns = await this.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info(model_profiles)',
    );
    if (!columns.some((column) => column.name === 'request_type')) {
      await this.$executeRawUnsafe(
        "ALTER TABLE model_profiles ADD COLUMN request_type TEXT NOT NULL DEFAULT 'response'",
      );
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
      await this.$executeRawUnsafe(
        'ALTER TABLE workspaces ADD COLUMN folders TEXT',
      );
    }
    const rows = await this.$queryRawUnsafe<
      Array<{ id: string; path: string; folders: string | null }>
    >(
      "SELECT id, path, folders FROM workspaces WHERE folders IS NULL OR folders = ''",
    );
    for (const row of rows) {
      await this.$executeRaw`
        UPDATE workspaces SET folders = ${JSON.stringify([row.path])} WHERE id = ${row.id}
      `;
    }
  }
}
