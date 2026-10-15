import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  FileNodePayload,
  MakeDirectoryDto,
  ReadFileDto,
  ReadFileResult,
  RemoveFileDto,
  RenameFileDto,
  WriteFileDto,
} from './files.dto';

/**
 * 工作区文件服务，为 @hcode/file-manager 的 HttpFileProvider 提供后端。
 *
 * 安全约束（与客户端 file-ipc 保持一致）：
 * 1. 路径必须落在某个已注册工作区内，越界抛 ForbiddenException；
 * 2. 不跟随符号链接；
 * 3. 删除目录必须显式 recursive。
 */
@Injectable()
export class FilesService {
  /** 已授权的工作区根目录。 */
  private readonly roots = new Set<string>();

  /** 注册可访问的工作区目录。 */
  registerRoot(rootPath: string): void {
    if (!rootPath) return;
    this.roots.add(path.resolve(rootPath));
  }

  getRoots(): string[] {
    return [...this.roots];
  }

  /**
   * 校验路径是否位于授权根目录内。
   *
   * 先做逻辑归一化消除 `..`，再用 realpath 二次确认，
   * 避免符号链接绕过。
   */
  private resolve(input: string): string {
    if (!input?.trim()) throw new BadRequestException('路径不能为空');
    if (!this.roots.size) throw new ForbiddenException('未授权任何工作区');

    const resolved = path.resolve(input);
    const permitted = [...this.roots].some(
      (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
    );
    if (!permitted) throw new ForbiddenException(`路径超出授权范围：${input}`);

    return resolved;
  }

  /** 路径统一为 POSIX 分隔符，前端无需处理平台差异。 */
  private toPosix(target: string): string {
    return target.split(path.sep).join('/');
  }

  private async toPayload(target: string): Promise<FileNodePayload> {
    const stats = await fs.lstat(target);
    return {
      name: path.basename(target),
      path: this.toPosix(target),
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      children: null,
    };
  }

  private async listDirectory(target: string): Promise<FileNodePayload[]> {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const nodes = await Promise.all(
      entries
        .filter((entry) => !entry.isSymbolicLink())
        .map((entry) => this.toPayload(path.join(target, entry.name))),
    );

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  async list(input: {
    path: string;
    recursive?: boolean;
    ignore?: string;
  }): Promise<FileNodePayload[]> {
    const resolved = this.resolve(input.path);
    const stats = await fs.lstat(resolved).catch(() => null);
    if (!stats?.isDirectory()) throw new NotFoundException(`目录不存在：${input.path}`);

    const nodes = await this.listDirectory(resolved);
    const ignore = parseIgnore(input.ignore);

    if (!input.recursive) {
      return nodes.filter((node) => !shouldIgnore(node.name, ignore));
    }

    return Promise.all(
      nodes.map(async (node) => {
        if (node.type !== 'directory') return node;
        const children = await this.listDirectory(path.resolve(resolved, node.name));
        return {
          ...node,
          children: children.filter((child) => !shouldIgnore(child.name, ignore)),
        };
      }),
    );
  }

  async read(input: ReadFileDto): Promise<ReadFileResult> {
    const resolved = this.resolve(input.path);
    const stats = await fs.lstat(resolved).catch(() => null);
    if (!stats?.isFile()) throw new NotFoundException(`文件不存在：${input.path}`);
    return { content: await fs.readFile(resolved, 'utf8'), mtimeMs: stats.mtimeMs };
  }

  async write(input: WriteFileDto): Promise<{ mtimeMs: number }> {
    const resolved = this.resolve(input.path);

    if (input.overwrite === false) {
      const exists = await fs
        .access(resolved)
        .then(() => true)
        .catch(() => false);
      if (exists) throw new BadRequestException(`文件已存在：${path.basename(input.path)}`);
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, input.content, 'utf8');
    const stats = await fs.lstat(resolved);
    return { mtimeMs: stats.mtimeMs };
  }

  async rename(input: RenameFileDto): Promise<void> {
    const source = this.resolve(input.path);
    const destination = this.resolve(input.newPath);
    if (source === destination) return;
    await fs.rename(source, destination);
  }

  async remove(input: RemoveFileDto): Promise<void> {
    const resolved = this.resolve(input.path);

    if ([...this.roots].some((root) => root === resolved)) {
      throw new BadRequestException('不允许删除工作区根目录');
    }

    const stats = await fs.lstat(resolved).catch(() => null);
    if (!stats) return;

    if (stats.isDirectory()) {
      if (!input.recursive) throw new BadRequestException('目录非空，需显式指定递归删除');
      await fs.rm(resolved, { recursive: true, force: true });
      return;
    }
    await fs.unlink(resolved);
  }

  async mkdir(input: MakeDirectoryDto): Promise<void> {
    const resolved = this.resolve(input.path);
    await fs.mkdir(resolved, { recursive: false });
  }
}

function parseIgnore(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldIgnore(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      return name.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
    }
    return name === pattern;
  });
}
