import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceSummary,
} from './workspaces.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WorkspaceSummary[]> {
    const workspaces = await this.prisma.$queryRaw<WorkspaceRow[]>`
      SELECT id, name, path, folders, status, created_at AS createdAt, last_opened_at AS lastOpenedAt
      FROM workspaces
      WHERE status = 'active'
      ORDER BY last_opened_at DESC
    `;
    return workspaces.map((workspace) => this.toSummary(workspace));
  }

  async create(input: CreateWorkspaceDto): Promise<WorkspaceSummary> {
    const folders = this.normalizeFolders(input);
    const primaryPath = folders[0];
    const timestamp = BigInt(Date.now());
    const workspace = await this.prisma.workspace.upsert({
      where: { path: primaryPath },
      update: {
        name: input.name.trim(),
        folders: JSON.stringify(folders),
        lastOpenedAt: timestamp,
      },
      create: {
        id: randomUUID(),
        name: input.name.trim(),
        path: primaryPath,
        folders: JSON.stringify(folders),
        createdAt: timestamp,
        lastOpenedAt: timestamp,
      },
    });
    await this.prisma.$executeRaw`
      UPDATE workspaces SET status = 'active' WHERE id = ${workspace.id}
    `;
    return this.toSummary(workspace, 'active');
  }

  async update(input: UpdateWorkspaceDto): Promise<WorkspaceSummary> {
    const folders = this.normalizeFolders(input);
    const primaryPath = folders[0];
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.id },
    });
    if (!workspace) throw new NotFoundException('项目不存在');
    const updated = await this.prisma.workspace.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        path: primaryPath,
        folders: JSON.stringify(folders),
        lastOpenedAt: BigInt(Date.now()),
      },
    });
    return this.toSummary(updated, 'active');
  }

  async delete(id: string): Promise<{ id: string }> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException('项目不存在');
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { workspaceId: id } }),
      this.prisma.workspace.delete({ where: { id } }),
    ]);
    return { id };
  }

  async archive(id: string): Promise<WorkspaceSummary> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException('项目不存在');
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE workspaces SET status = 'archived' WHERE id = ${id}`,
      this.prisma.session.updateMany({
        where: { workspaceId: id, status: 'active' },
        data: { status: 'archived', updatedAt: BigInt(Date.now()) },
      }),
    ]);
    const archived = await this.prisma.$queryRaw<WorkspaceRow[]>`
      SELECT id, name, path, folders, status, created_at AS createdAt, last_opened_at AS lastOpenedAt
      FROM workspaces WHERE id = ${id}
    `;
    if (!archived[0]) throw new NotFoundException('项目不存在');
    return this.toSummary(archived[0]);
  }

  private normalizeFolders(input: { path?: string; folders?: string[] }): string[] {
    const values = input.folders?.length ? input.folders : input.path ? [input.path] : [];
    const folders = [...new Set(values.map((folder) => folder.trim()).filter(Boolean))];
    if (!folders.length) throw new BadRequestException('至少选择一个文件夹');
    return folders;
  }

  private toSummary(workspace: {
    id: string;
    name: string;
    path: string;
    folders?: string | null;
    createdAt: bigint;
    lastOpenedAt: bigint;
    status?: string;
  }, status = 'active'): WorkspaceSummary {
    const paths = this.parseFolders(workspace.folders, workspace.path);
    return {
      id: workspace.id,
      name: workspace.name,
      path: paths[0],
      folders: paths.map((path, index) => ({ path, isPrimary: index === 0 })),
      status: workspace.status ?? status,
      createdAt: workspace.createdAt.toString(),
      lastOpenedAt: workspace.lastOpenedAt.toString(),
    };
  }

  private parseFolders(value: string | null | undefined, fallback: string): string[] {
    try {
      const parsed = JSON.parse(value ?? '');
      if (Array.isArray(parsed)) {
        const folders = [...new Set(parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
        if (folders.length) return folders;
      }
    } catch {
      // Existing workspaces may not have the folders column populated yet.
    }
    return [fallback];
  }
}

type WorkspaceRow = {
  id: string;
  name: string;
  path: string;
  folders: string | null;
  status: string;
  createdAt: bigint;
  lastOpenedAt: bigint;
};
