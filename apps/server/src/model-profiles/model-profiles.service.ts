import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ModelProfileSummary,
  UpsertModelProfileDto,
} from './model-profiles.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ModelProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ModelProfileSummary[]> {
    const profiles = await this.prisma.modelProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return profiles.map((profile) => this.toSummary(profile));
  }

  async upsert(input: UpsertModelProfileDto): Promise<ModelProfileSummary> {
    const name = input.name.trim();
    const provider = input.provider.trim();
    const model = input.model.trim();
    const baseUrl = input.baseUrl.trim();
    const id = input.id?.trim() || undefined;
    const existing = id
      ? await this.prisma.modelProfile.findUnique({ where: { id } })
      : null;

    if (id && !existing) {
      throw new NotFoundException({
        message: '模型配置不存在',
      });
    }

    const apiKey = input.apiKey?.trim() || existing?.apiKey;
    if (!apiKey) {
      throw new BadRequestException({
        message: '新增模型配置时 API Key 必填',
      });
    }

    const isDefault = input.isDefault ?? existing?.isDefault ?? false;
    const profile = await this.prisma.$transaction(async (transaction) => {
      if (isDefault) {
        await transaction.modelProfile.updateMany({
          data: { isDefault: false },
        });
      }

      const now = BigInt(Date.now());
      return existing
        ? transaction.modelProfile.update({
            where: { id: existing.id },
            data: {
              name,
              provider,
              model,
              baseUrl,
              apiKey,
              isDefault,
              updatedAt: now,
            },
          })
        : transaction.modelProfile.create({
            data: {
              id: randomUUID(),
              name,
              provider,
              model,
              baseUrl,
              apiKey,
              isDefault,
              createdAt: now,
              updatedAt: now,
            },
          });
    });

    return this.toSummary(profile);
  }

  async remove(id: string): Promise<{ id: string }> {
    const normalizedId = id.trim();

    try {
      const profile = await this.prisma.modelProfile.delete({
        where: { id: normalizedId },
      });
      return { id: profile.id };
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException({
          message: '模型配置不存在',
        });
      }
      throw error;
    }
  }

  async listModels(profileId: string): Promise<{ models: string[] }> {
    const profile = await this.prisma.modelProfile.findUnique({
      where: { id: profileId.trim() },
    });
    if (!profile) {
      throw new NotFoundException({ message: '模型配置不存在' });
    }

    const modelsUrl = `${profile.baseUrl.replace(/\/+$/, '')}/models`;
    let response: Response;
    try {
      response = await fetch(modelsUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${profile.apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException({ message: '获取模型列表失败' });
    }

    if (!response.ok) {
      throw new BadGatewayException({
        message: `获取模型列表失败（HTTP ${response.status}）`,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException({ message: '模型列表响应格式无效' });
    }

    const rawModels = Array.isArray(payload)
      ? payload
      : this.isRecord(payload) && Array.isArray(payload.data)
        ? payload.data
        : this.isRecord(payload) && Array.isArray(payload.models)
          ? payload.models
          : [];
    const models = rawModels
      .map((item) => {
        if (typeof item === 'string') return item;
        if (this.isRecord(item) && typeof item.id === 'string') return item.id;
        if (this.isRecord(item) && typeof item.name === 'string') return item.name;
        return null;
      })
      .filter((model): model is string => Boolean(model));

    return { models: [...new Set(models)] };
  }

  private toSummary(profile: {
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    isDefault: boolean;
    createdAt: bigint;
    updatedAt: bigint;
  }): ModelProfileSummary {
    return {
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt.toString(),
      updatedAt: profile.updatedAt.toString(),
      apiKeyHint:
        profile.apiKey.length > 4 ? `...${profile.apiKey.slice(-4)}` : '****',
    };
  }

  private isPrismaNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2025'
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
