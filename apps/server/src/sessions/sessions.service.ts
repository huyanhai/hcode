import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import type {
  PiAttachment,
  PiComment,
  PiDetail,
  PiProfile,
  PiRuntime,
  PiSession,
  PiStreamEvent,
} from '@hcode/runtime';
import { PrismaService } from '../database/prisma.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { normalizeProviderBaseUrl } from '../model-profiles/base-url';
import type {
  CreateSessionDto,
  EditMessageDto,
  SendMessageDto,
} from './sessions.dto';

/** Keep the Pi ESM package behind a native dynamic import; Nest currently emits CommonJS. */
const loadRuntime = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('@hcode/runtime')>;

@Injectable()
export class SessionsService implements OnModuleInit, OnModuleDestroy {
  private runtime!: PiRuntime;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.onModuleInit();
    const profiles = await this.prisma.modelProfile.findMany();
    const { PiRuntime } = await loadRuntime('@hcode/runtime');
    this.runtime = await PiRuntime.open(
      process.env.HCODE_PI_SESSION_DB ??
        resolve(__dirname, '../../database/pi-sessions.sqlite'),
      profiles.map((profile) => this.toProfile(profile)),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime?.close();
  }

  async list(workspaceId?: string): Promise<PiSession[]> {
    return this.runtime.list(workspaceId);
  }
  async archive(id: string): Promise<PiSession> {
    return this.notFound(() => this.runtime.archive(id));
  }
  async archiveWorkspace(workspaceId: string): Promise<void> {
    await this.runtime.archiveWorkspace(workspaceId);
  }

  async create(input: CreateSessionDto): Promise<PiSession> {
    const workspace = input.workspaceId
      ? await this.prisma.workspace.findUnique({
          where: { id: input.workspaceId },
        })
      : null;
    if (input.workspaceId && !workspace)
      throw new NotFoundException('工作区不存在');
    const runtimeWorkspace =
      workspace ??
      (await this.prisma.workspace.findFirst({
        where: { status: 'active' },
        orderBy: { lastOpenedAt: 'desc' },
      }));
    const folders = this.parseFolders(
      runtimeWorkspace?.folders,
      runtimeWorkspace?.path ?? process.cwd(),
    );
    const title = input.title?.trim() || '新会话';
    if (title === '新会话') {
      for (const session of await this.runtime.list(workspace?.id)) {
        if (
          session.workspaceId === (workspace?.id ?? null) &&
          session.title === title &&
          session.persistence === (input.persistence ?? 'durable') &&
          !(await this.runtime.detail(session.id)).messages.length
        )
          return session;
      }
    }
    return this.runtime.create({
      workspaceId: workspace?.id,
      workspacePath: runtimeWorkspace?.path ?? process.cwd(),
      folders,
      title,
      persistence: input.persistence,
    });
  }

  async open(id: string): Promise<PiDetail> {
    return this.notFound(() => this.runtime.detail(id));
  }

  async send(id: string, input: SendMessageDto): Promise<PiDetail> {
    const submission = await this.submitOrRethrow(id, input, '发送消息失败');
    const result = await this.runtime.observe(id, submission, () => {});
    if (!result.text.trim() && !result.awaitingApproval)
      throw new BadGatewayException('模型没有返回内容');
    return this.open(id);
  }

  async stream(
    id: string,
    input: SendMessageDto,
    response: ServerResponse,
  ): Promise<void> {
    const submission = await this.submitOrRethrow(id, input, '请求模型失败');
    await this.streamRun(
      response,
      (emit, signal) => this.runtime.observe(id, submission, emit, signal),
      '请求模型失败',
    );
  }

  async editStream(
    id: string,
    input: EditMessageDto,
    response: ServerResponse,
  ): Promise<void> {
    try {
      await this.runtime.editLastUser(id, input.messageId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === '只能编辑最后一条用户消息'
      )
        throw new BadRequestException(error.message);
      throw error;
    }
    const submission = await this.submitOrRethrow(id, input, '重新生成消息失败');
    await this.streamRun(
      response,
      (emit, signal) => this.runtime.observe(id, submission, emit, signal),
      '重新生成消息失败',
    );
  }

  async streamApproval(
    id: string,
    approvalId: string,
    approved: boolean,
    response: ServerResponse,
  ): Promise<void> {
    const pending = await this.notFound(() => this.runtime.approval(id));
    if (!pending || pending.approvalId !== approvalId)
      throw new NotFoundException('审批请求不存在或已失效');
    await this.runtime.decide(id, approvalId, approved);
    const submission = await this.runtime.activeSubmission(id);
    await this.streamRun(
      response,
      async (emit, signal) => {
        if (!submission) return { text: '', awaitingApproval: false };
        return this.runtime.observe(id, submission, emit, signal);
      },
      '处理审批失败',
    );
  }

  /** submit 阶段的异常大多是可读的业务错误（如附件读取失败），
   *  包成 HttpException 让真实原因到达客户端，而不是 500「系统异常」 */
  private async submitOrRethrow(
    id: string,
    input: SendMessageDto,
    fallback: string,
  ) {
    try {
      return await this.submit(id, input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('Session submit failed', error);
      throw new BadGatewayException(
        error instanceof Error && error.message
          ? error.message
          : fallback,
      );
    }
  }

  private async submit(id: string, input: SendMessageDto) {
    await this.open(id);
    const content = (input.content ?? '').trim();
    const attachments: PiAttachment[] = (input.attachments ?? []).map(
      (item) => {
        if (!this.fileStorage.isManagedUrl(item.url))
          throw new BadRequestException('附件必须来自已配置的文件存储');
        return {
          id: item.id,
          url: item.url,
          name: item.name,
          mimeType: item.mimeType,
          size: item.size,
        };
      },
    );
    const comments: PiComment[] = (input.comments ?? []).map((item) => ({
      id: item.id,
      content: (item.content ?? '').trim(),
      ...(item.selectedText?.trim()
        ? { selectedText: item.selectedText.trim() }
        : {}),
      ...(item.messageId ? { messageId: item.messageId } : {}),
      ...(Number.isInteger(item.startOffset)
        ? { startOffset: item.startOffset }
        : {}),
      ...(Number.isInteger(item.endOffset)
        ? { endOffset: item.endOffset }
        : {}),
      ...(item.attachmentId ? { attachmentId: item.attachmentId } : {}),
      ...(Number.isInteger(item.pinIndex) ? { pinIndex: item.pinIndex } : {}),
    }));
    if (!content && !attachments.length && !comments.length)
      throw new BadRequestException('消息内容或附件不能为空');
    const profile = input.profileId
      ? await this.prisma.modelProfile.findUnique({
          where: { id: input.profileId },
        })
      : await this.prisma.modelProfile.findFirst({
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
    if (!profile) throw new BadRequestException('请先配置模型');
    try {
      return await this.runtime.submit(id, {
        content,
        attachments,
        comments,
        profile: this.toProfile(profile),
        model: input.model,
        fullAccess: input.fullAccess,
        whenBusy: input.whenBusy,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === '会话忙碌时不能切换完全访问模式'
      )
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** HTTP disconnect stops this observer only; Pi keeps the submitted work alive. */
  private async streamRun(
    response: ServerResponse,
    run: (
      emit: (event: PiStreamEvent) => void,
      signal: AbortSignal,
    ) => Promise<{ text: string; awaitingApproval: boolean }>,
    errorMessage: string,
  ): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once('close', abort);
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      const result = await run((event) => {
        if (!response.destroyed)
          response.write(`data: ${JSON.stringify(event)}\n\n`);
      }, controller.signal);
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({ type: 'hcode.done', ...result })}\n\n`,
        );
        response.end();
      }
    } catch (error) {
      console.error('Pi session stream failed', error);
      if (!response.destroyed) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : errorMessage;
        response.write(
          `data: ${JSON.stringify({ type: 'hcode.error', message })}\n\n`,
        );
        response.end();
      }
    } finally {
      response.off('close', abort);
    }
  }

  private toProfile(profile: {
    id: string;
    name: string;
    model: string;
    requestType: string;
    baseUrl: string;
    apiKey: string;
  }): PiProfile {
    return {
      id: profile.id,
      name: profile.name,
      model: profile.model,
      requestType: profile.requestType === 'chat' ? 'chat' : 'response',
      baseUrl: normalizeProviderBaseUrl(profile.baseUrl),
      apiKey: profile.apiKey,
    };
  }

  private parseFolders(
    value: string | null | undefined,
    fallback: string,
  ): string[] {
    try {
      const parsed: unknown = JSON.parse(value ?? '');
      if (Array.isArray(parsed)) {
        const folders = parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean);
        if (folders.length) return [...new Set(folders)];
      }
    } catch {
      /* Older workspaces can have an empty folders column. */
    }
    return [fallback];
  }

  private async notFound<T>(load: () => Promise<T>): Promise<T> {
    try {
      return await load();
    } catch (error) {
      if (error instanceof Error && error.message === '会话不存在')
        throw new NotFoundException(error.message);
      throw error;
    }
  }
}
