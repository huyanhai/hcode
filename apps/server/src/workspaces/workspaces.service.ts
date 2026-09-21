import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { CreateWorkspaceDto, WorkspaceSummary } from './workspaces.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkspaceSummary[]> {
    const workspaces = await this.prisma.workspace.findMany({
      orderBy: { lastOpenedAt: 'desc' },
    });
    return workspaces.map((workspace) => this.toSummary(workspace));
  }

  async create(input: CreateWorkspaceDto): Promise<WorkspaceSummary> {
    const timestamp = BigInt(Date.now());
    const workspace = await this.prisma.workspace.upsert({
      where: { path: input.path.trim() },
      update: { name: input.name.trim(), lastOpenedAt: timestamp },
      create: {
        id: randomUUID(),
        name: input.name.trim(),
        path: input.path.trim(),
        createdAt: timestamp,
        lastOpenedAt: timestamp,
      },
    });
    return this.toSummary(workspace);
  }

  private toSummary(workspace: {
    id: string; name: string; path: string; createdAt: bigint; lastOpenedAt: bigint;
  }): WorkspaceSummary {
    return { ...workspace, createdAt: workspace.createdAt.toString(), lastOpenedAt: workspace.lastOpenedAt.toString() };
  }
}
