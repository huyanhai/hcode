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
        name TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_opened_at BIGINT NOT NULL
      )
    `);
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
}
