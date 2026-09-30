import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { ServerResponse } from 'node:http';
import {
  streamAgent,
  type AgentContext,
  type AgentContinuation,
  type ApprovalDecisions,
  type CoreStreamEvent,
  type ModelProfile,
} from '@hcode/agent-core';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateSessionDto,
  EditMessageDto,
  MessageAttachment,
  MessageAttachmentDto,
  MessageComment,
  MessageCommentDto,
  MessageSummary,
  MessageToolCall,
  MessageStreamStatus,
  SendMessageDto,
  SessionDetail,
  SessionSummary,
} from './sessions.dto';
import { normalizeProviderBaseUrl } from '../model-profiles/base-url';
import { FileStorageService } from '../file-storage/file-storage.service';

type PendingApprovalRun = {
  sessionId: string;
  messageId: string;
  profile: ModelProfile;
  context: AgentContext;
  continuation: AgentContinuation;
  approvals: ApprovalDecisions;
  text: string;
  toolCalls: MessageToolCall[];
  startedAt: bigint;
};

@Injectable()
export class SessionsService {
  private readonly pendingApprovals = new Map<string, PendingApprovalRun>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // 查询当前项目下的所有会话
  async list(workspaceId?: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { ...(workspaceId ? { workspaceId } : {}), status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return sessions.map((session) => this.toSummary(session));
  }

  // 会话归档
  async archive(id: string): Promise<SessionSummary> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('会话不存在');
    if (session.status === 'archived') return this.toSummary(session);

    const archived = await this.prisma.session.update({
      where: { id },
      data: { status: 'archived', updatedAt: BigInt(Date.now()) },
    });
    return this.toSummary(archived);
  }

  // 创建新会话
  async create(input: CreateSessionDto): Promise<SessionSummary> {
    const workspace = input.workspaceId
      ? await this.prisma.workspace.findUnique({ where: { id: input.workspaceId } })
      : null;
    if (input.workspaceId && !workspace) throw new NotFoundException('工作区不存在');
    const title = input.title?.trim() || '新会话';
    if (title === '新会话') {
      // 判断当前项目下是否存在新的会话，存在就不新建会话
      const emptySession = await this.prisma.session.findFirst({
        where: { workspaceId: workspace?.id ?? null, status: 'active', title },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      });
      if (emptySession?._count.messages === 0)
        return this.toSummary(emptySession);
    }
    const timestamp = BigInt(Date.now());
    const session = await this.prisma.session.create({
      data: {
        id: randomUUID(),
        workspaceId: workspace?.id ?? null,
        title,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return this.toSummary(session);
  }

  // 查询会话历史
  async open(id: string): Promise<SessionDetail> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!session) throw new NotFoundException('会话不存在');
    const messages = await this.prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { sequence: 'asc' },
    });
    return {
      session: this.toSummary(session),
      messages: messages.map((message) => this.toMessageSummary(message)),
    };
  }

  async send(id: string, input: SendMessageDto): Promise<SessionDetail> {
    const result = await this.run(id, input, undefined);
    if (!result.text.trim() && !result.awaitingApproval)
      throw new BadGatewayException('模型没有返回内容');
    return this.open(id);
  }

  // 流式会话
  async stream(
    id: string,
    input: SendMessageDto,
    response: ServerResponse,
  ): Promise<void> {
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    response.once('close', abort);
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      const result = await this.run(
        id,
        input,
        (event) => {
          response.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        abortController.signal,
      );
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({
            type: 'done',
            text: result.text,
            awaitingApproval: result.awaitingApproval,
          })}\n\n`,
        );
        response.end();
      }
    } catch (error) {
      console.error('AI stream failed', error);
      if (response.destroyed) return;
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(
          JSON.stringify({ code: '-1', data: null, message: '请求模型失败' }),
        );
      } else {
        response.write(
          `data: ${JSON.stringify({ type: 'error', message: '请求模型失败' })}\n\n`,
        );
        response.end();
      }
    } finally {
      response.off('close', abort);
    }
  }

  async editStream(
    id: string,
    input: EditMessageDto,
    response: ServerResponse,
  ): Promise<void> {
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    response.once('close', abort);
    try {
      await this.replaceLastUserMessage(id, input.messageId);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      const { messageId: _messageId, ...messageInput } = input;
      const result = await this.run(
        id,
        messageInput,
        (event) => response.write(`data: ${JSON.stringify(event)}\n\n`),
        abortController.signal,
      );
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({
            type: 'done',
            text: result.text,
            awaitingApproval: result.awaitingApproval,
          })}\n\n`,
        );
        response.end();
      }
    } catch (error) {
      console.error('AI edit stream failed', error);
      if (response.destroyed) return;
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(
          JSON.stringify({ code: '-1', data: null, message: '重新生成消息失败' }),
        );
      } else {
        response.write(
          `data: ${JSON.stringify({ type: 'error', message: '重新生成消息失败' })}\n\n`,
        );
        response.end();
      }
    } finally {
      response.off('close', abort);
    }
  }

  async streamApproval(
    id: string,
    approvalId: string,
    approved: boolean,
    response: ServerResponse,
  ): Promise<void> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.sessionId !== id)
      throw new NotFoundException('审批请求不存在或已失效');
    const toolCall = pending.toolCalls.find(
      (call) => call.approval?.id === approvalId,
    );
    if (!toolCall || toolCall.approval?.status !== 'pending')
      throw new BadRequestException('审批请求已处理');

    pending.approvals[approvalId] = approved;
    toolCall.approval.status = approved ? 'approved' : 'denied';
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    response.once('close', abort);
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      const result = await this.resumePendingApproval(
        pending,
        (event) => response.write(`data: ${JSON.stringify(event)}\n\n`),
        abortController.signal,
      );
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({
            type: 'done',
            text: result.text,
            awaitingApproval: result.awaitingApproval,
          })}\n\n`,
        );
        response.end();
      }
    } catch (error) {
      console.error('Approval stream failed', error);
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({ type: 'error', message: '处理审批失败' })}\n\n`,
        );
        response.end();
      }
    } finally {
      response.off('close', abort);
    }
  }

  private async run(
    id: string,
    input: SendMessageDto,
    onEvent?: (event: CoreStreamEvent) => void,
    abortSignal?: AbortSignal,
  ): Promise<{ text: string; awaitingApproval: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!session) throw new NotFoundException('会话不存在');
    const runtimeWorkspace =
      session.workspace ??
      (await this.prisma.workspace.findFirst({
        where: { status: 'active' },
        orderBy: { lastOpenedAt: 'desc' },
      }));
    const profile = input.profileId
      ? await this.prisma.modelProfile.findUnique({
          where: { id: input.profileId },
        })
      : await this.prisma.modelProfile.findFirst({
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
    if (!profile) throw new BadRequestException('请先配置模型');

    const content = (input.content ?? '').trim();
    const storedAttachments = this.normalizeAttachments(input.attachments ?? []);
    const storedComments = this.normalizeComments(input.comments ?? []);
    if (!content && !storedAttachments.length && !storedComments.length)
      throw new BadRequestException('消息内容或附件不能为空');
    const history = await this.prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { sequence: 'asc' },
    });
    await this.appendMessage(
      id,
      'user',
      content,
      storedAttachments,
      storedComments,
    );
    const title =
      session.title === '新会话' ? this.makeTitle(content) : session.title;
    await this.prisma.session.update({
      where: { id },
      data: { title, updatedAt: BigInt(Date.now()) },
    });

    const agentProfile = {
      ...profile,
      model: input.model?.trim() || profile.model,
      requestType: (profile.requestType === 'chat' ? 'chat' : 'response') as 'chat' | 'response',
      baseUrl: normalizeProviderBaseUrl(profile.baseUrl),
      createdAt: Number(profile.createdAt),
      updatedAt: Number(profile.updatedAt),
    };
    const historyMessages = await Promise.all(
      history
        .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
        .map(async (message) => ({
          role: message.role,
          content: this.contentWithComments(
            message.content,
            this.parseComments(message.comments),
          ),
          attachments: await this.prepareAttachments(
            this.parseAttachments(message.attachments),
          ),
        })),
    );
    const messages = [
      ...historyMessages,
      {
        role: 'user',
        content: this.contentWithComments(content, storedComments),
        attachments: await this.prepareAttachments(storedAttachments),
      },
    ];
    const startedAt = BigInt(Date.now());
    const agentContext = this.createAgentContext(
      runtimeWorkspace?.path ?? process.cwd(),
      runtimeWorkspace?.folders ?? null,
      input.fullAccess,
    );
    let text = '';
    const toolCalls: MessageToolCall[] = [];
    let streamStatus: MessageStreamStatus = 'completed';
    let awaitingApproval = false;
    let continuation: AgentContinuation | undefined;
    try {
      for await (const event of streamAgent(
        agentProfile,
        agentContext,
        messages,
        {},
        abortSignal,
        Boolean(onEvent),
      )) {
        if (event.type === 'text') text += event.text;
        this.captureToolEvent(toolCalls, event, text.length);
        if (event.type === 'finish') {
          awaitingApproval = event.awaitingApproval;
          continuation = event.continuation;
        }
        onEvent?.(event);
        if (event.type === 'error') throw event.error;
      }
    } catch (error) {
      streamStatus = abortSignal?.aborted ? 'stopped' : 'failed';
      if (text.trim() || toolCalls.length) {
        await this.appendAssistantMessage(id, text, {
          toolCalls,
          streamStatus,
          startedAt,
          completedAt: BigInt(Date.now()),
        });
      }
      throw error;
    }
    const assistantMessage = await this.appendAssistantMessage(id, text, {
      toolCalls,
      streamStatus: awaitingApproval ? 'awaiting-approval' : streamStatus,
      startedAt,
      completedAt: awaitingApproval ? null : BigInt(Date.now()),
    });
    if (awaitingApproval && continuation && assistantMessage) {
      const pending: PendingApprovalRun = {
        sessionId: id,
        messageId: assistantMessage.id,
        profile: agentProfile,
        context: agentContext,
        continuation,
        approvals: {},
        text,
        toolCalls,
        startedAt,
      };
      this.indexPendingApprovals(pending);
    }
    await this.prisma.session.update({
      where: { id },
      data: { updatedAt: BigInt(Date.now()) },
    });
    return { text, awaitingApproval };
  }

  private async replaceLastUserMessage(sessionId: string, messageId: string) {
    const target = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!target || target.sessionId !== sessionId || target.role !== 'user')
      throw new BadRequestException('只能编辑当前会话中的用户消息');

    const latestUser = await this.prisma.message.findFirst({
      where: { sessionId, role: 'user' },
      orderBy: { sequence: 'desc' },
    });
    if (!latestUser || latestUser.id !== messageId)
      throw new BadRequestException('只能编辑最后一条用户消息');

    for (const pending of this.pendingApprovals.values()) {
      if (pending.sessionId === sessionId) this.clearPendingApprovals(pending);
    }
    await this.prisma.message.deleteMany({
      where: { sessionId, sequence: { gte: target.sequence } },
    });
  }

  private createAgentContext(
    primaryPath: string,
    folders: string | null,
    fullAccess = false,
  ): AgentContext {
    const configured = this.parseWorkspaceFolders(folders, primaryPath);
    const additionalRoots = configured.slice(1).map((path, index, paths) => ({
      name: this.folderLabel(path, paths.slice(0, index)),
      path,
    }));
    return {
      workspaceRoot: primaryPath,
      additionalRoots,
      permissionMode: fullAccess ? 'full' : 'restricted',
    };
  }

  private parseWorkspaceFolders(value: string | null, fallback: string): string[] {
    try {
      const parsed = JSON.parse(value ?? '');
      if (Array.isArray(parsed)) {
        const folders = [...new Set(
          parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        )];
        if (folders.length) return folders;
      }
    } catch {
      // Existing workspaces may not have a populated folders column.
    }
    return [fallback];
  }

  private folderLabel(path: string, previousPaths: string[]): string {
    const base = basename(path) || path;
    if (!previousPaths.some((previous) => (basename(previous) || previous) === base)) return base;
    return path;
  }

  private async appendMessage(
    sessionId: string,
    role: string,
    content: string,
    attachments: MessageAttachment[] = [],
    comments: MessageComment[] = [],
  ) {
    const last = await this.prisma.message.findFirst({
      where: { sessionId },
      orderBy: { sequence: 'desc' },
    });
    return this.prisma.message.create({
      data: {
        id: randomUUID(),
        sessionId,
        role,
        content,
        attachments: attachments.length ? JSON.stringify(attachments) : null,
        comments: comments.length ? JSON.stringify(comments) : null,
        sequence: (last?.sequence ?? 0) + 1,
        createdAt: BigInt(Date.now()),
      },
    });
  }

  private async appendAssistantMessage(
    sessionId: string,
    content: string,
    metadata: {
      toolCalls: MessageToolCall[];
      streamStatus: MessageStreamStatus;
      startedAt: bigint;
      completedAt: bigint | null;
    },
  ): Promise<{ id: string } | null> {
    if (
      !content.trim() &&
      !metadata.toolCalls.length &&
      metadata.streamStatus !== 'awaiting-approval'
    ) {
      return null;
    }
    const last = await this.prisma.message.findFirst({
      where: { sessionId },
      orderBy: { sequence: 'desc' },
    });
    return this.prisma.message.create({
      data: {
        id: randomUUID(),
        sessionId,
        role: 'assistant',
        content,
        reasoning: null,
        toolCalls: metadata.toolCalls.length
          ? JSON.stringify(metadata.toolCalls)
          : null,
        streamStatus: metadata.streamStatus,
        startedAt: metadata.startedAt,
        completedAt: metadata.completedAt,
        sequence: (last?.sequence ?? 0) + 1,
        createdAt: metadata.completedAt ?? BigInt(Date.now()),
      },
    });
  }

  private async resumePendingApproval(
    pending: PendingApprovalRun,
    onEvent: (event: CoreStreamEvent) => void,
    abortSignal: AbortSignal,
  ): Promise<{ text: string; awaitingApproval: boolean }> {
    let awaitingApproval = false;
    let continuation: AgentContinuation | undefined;
    try {
      for await (const event of streamAgent(
        pending.profile,
        pending.context,
        [],
        pending.approvals,
        abortSignal,
        true,
        pending.continuation,
      )) {
        if (event.type === 'text') pending.text += event.text;
        this.captureToolEvent(pending.toolCalls, event, pending.text.length);
        if (event.type === 'finish') {
          awaitingApproval = event.awaitingApproval;
          continuation = event.continuation;
        }
        onEvent(event);
        if (event.type === 'error') throw event.error;
      }
    } catch (error) {
      this.clearPendingApprovals(pending);
      await this.updateAssistantMessage(pending, 'failed', BigInt(Date.now()));
      throw error;
    }

    if (awaitingApproval && continuation) {
      pending.continuation = continuation;
      this.indexPendingApprovals(pending);
      await this.updateAssistantMessage(pending, 'awaiting-approval', null);
    } else {
      this.clearPendingApprovals(pending);
      await this.updateAssistantMessage(
        pending,
        'completed',
        BigInt(Date.now()),
      );
    }
    return { text: pending.text, awaitingApproval };
  }

  private async updateAssistantMessage(
    pending: PendingApprovalRun,
    streamStatus: MessageStreamStatus,
    completedAt: bigint | null,
  ) {
    await this.prisma.message.update({
      where: { id: pending.messageId },
      data: {
        content: pending.text,
        reasoning: null,
        toolCalls: JSON.stringify(pending.toolCalls),
        streamStatus,
        completedAt,
      },
    });
    await this.prisma.session.update({
      where: { id: pending.sessionId },
      data: { updatedAt: BigInt(Date.now()) },
    });
  }

  private indexPendingApprovals(pending: PendingApprovalRun) {
    this.clearPendingApprovals(pending);
    for (const toolCall of pending.toolCalls) {
      if (toolCall.approval?.status === 'pending')
        this.pendingApprovals.set(toolCall.approval.id, pending);
    }
  }

  private clearPendingApprovals(pending: PendingApprovalRun) {
    for (const [approvalId, value] of this.pendingApprovals) {
      if (value === pending) this.pendingApprovals.delete(approvalId);
    }
  }

  private captureToolEvent(
    toolCalls: MessageToolCall[],
    event: CoreStreamEvent,
    contentOffset: number,
  ) {
    if (event.type === 'approval') {
      const toolCall = toolCalls.find((call) => call.id === event.toolCallId);
      if (toolCall) {
        toolCall.input = event.input;
        toolCall.approval = { id: event.approvalId, status: 'pending' };
      } else {
        toolCalls.push({
          id: event.toolCallId,
          toolName: event.toolName,
          status: 'in-progress',
          input: event.input,
          contentOffset,
          approval: { id: event.approvalId, status: 'pending' },
        });
      }
      return;
    }
    if (event.type === 'tool-call') {
      toolCalls.push({
        id: event.toolCallId,
        toolName: event.toolName,
        status: 'in-progress',
        input: event.input,
        rawArguments: event.rawArguments,
        contentOffset,
      });
      return;
    }
    if (event.type === 'tool-call-delta') {
      const toolCall = toolCalls.find((call) => call.id === event.toolCallId);
      if (toolCall) {
        const rawArguments =
          event.arguments ?? `${toolCall.rawArguments ?? ''}${event.delta}`;
        toolCall.rawArguments = rawArguments;
        try {
          toolCall.input = JSON.parse(rawArguments || '{}');
        } catch {
          // The arguments may still be incomplete while the model is streaming.
        }
      }
      return;
    }
    if (event.type === 'tool-result') {
      const toolCall = toolCalls.find((call) => call.id === event.toolCallId);
      const status = isToolResultFailure(event.output) ? 'failed' : 'completed';
      if (toolCall) {
        toolCall.status = status;
        toolCall.output = event.output;
      } else {
        toolCalls.push({
          id: event.toolCallId,
          toolName: event.toolName,
          status,
          output: event.output,
          contentOffset,
        });
      }
      return;
    }
    if (event.type === 'tool-progress') {
      const id = event.itemId ?? `${event.toolName}:${toolCalls.length}`;
      const existing = toolCalls.find((call) => call.id === id);
      const status =
        event.status === 'failed'
          ? 'failed'
          : event.status === 'completed'
            ? 'completed'
            : 'in-progress';
      if (existing) {
        existing.status = status;
      } else {
        toolCalls.push({
          id,
          toolName: event.toolName,
          status,
          output: event.data,
          contentOffset,
        });
      }
    }
  }

  private makeTitle(content: string): string {
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() || '新会话';
    return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  }

  private toSummary(session: {
    id: string;
    workspaceId: string | null;
    title: string;
    status: string;
    createdAt: bigint;
    updatedAt: bigint;
  }): SessionSummary {
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      title: session.title,
      status: session.status,
      createdAt: session.createdAt.toString(),
      updatedAt: session.updatedAt.toString(),
    };
  }

  private toMessageSummary(message: {
    id: string;
    sessionId: string;
    turnId: string | null;
    role: string;
    content: string;
    attachments: string | null;
    comments: string | null;
    sequence: number;
    createdAt: bigint;
    reasoning: string | null;
    toolCalls: string | null;
    streamStatus: string | null;
    startedAt: bigint | null;
    completedAt: bigint | null;
  }): MessageSummary {
    return {
      id: message.id,
      sessionId: message.sessionId,
      turnId: message.turnId,
      role: message.role,
      content: message.content,
      ...(message.attachments
        ? { attachments: this.parseAttachments(message.attachments) }
        : {}),
      ...(message.comments
        ? { comments: this.parseComments(message.comments) }
        : {}),
      sequence: message.sequence,
      createdAt: message.createdAt.toString(),
      ...(message.toolCalls
        ? { toolCalls: this.parseToolCalls(message.toolCalls) }
        : {}),
      ...(this.isStreamStatus(message.streamStatus)
        ? { streamStatus: message.streamStatus }
        : {}),
      ...(message.startedAt ? { startedAt: message.startedAt.toString() } : {}),
      ...(message.completedAt
        ? { completedAt: message.completedAt.toString() }
        : {}),
    };
  }

  private parseToolCalls(value: string): MessageToolCall[] {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MessageToolCall[]) : [];
    } catch {
      return [];
    }
  }

  private parseAttachments(value: string | null | undefined): MessageAttachment[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MessageAttachment[]) : [];
    } catch {
      return [];
    }
  }

  private parseComments(value: string | null | undefined): MessageComment[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MessageComment[]) : [];
    } catch {
      return [];
    }
  }

  private normalizeComments(comments: MessageCommentDto[]): MessageComment[] {
    return comments
      .map((comment) => ({
        id: comment.id,
        content: (comment.content ?? '').trim(),
        ...(comment.selectedText?.trim()
          ? { selectedText: comment.selectedText.trim() }
          : {}),
        ...(comment.messageId ? { messageId: comment.messageId } : {}),
        ...(Number.isInteger(comment.startOffset)
          ? { startOffset: comment.startOffset }
          : {}),
        ...(Number.isInteger(comment.endOffset)
          ? { endOffset: comment.endOffset }
          : {}),
      }));
  }

  private contentWithComments(
    content: string,
    comments: MessageComment[],
  ): string {
    if (!comments.length) return content;
    const notes = comments
      .map((comment, index) => {
        const selected = comment.selectedText
          ? `\n选中文本：${comment.selectedText}`
          : '';
        return `${index + 1}.${selected}\n评论：${comment.content}`;
      })
      .join('\n\n');
    return `${content}\n\n用户针对这段内容的评论：\n${notes}`;
  }

  private normalizeAttachments(attachments: MessageAttachmentDto[]): MessageAttachment[] {
    if (!attachments.length) return [];
    return attachments.map((attachment) => {
      if (!this.fileStorage.isManagedUrl(attachment.url))
        throw new BadRequestException('附件必须来自已配置的文件存储');
      return {
        id: attachment.id,
        url: attachment.url,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      };
    });
  }

  private async prepareAttachments(
    attachments: MessageAttachment[],
  ): Promise<Array<MessageAttachment & { dataUrl?: string }>> {
    return Promise.all(
      attachments.map(async (attachment) => {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new BadRequestException(`无法读取附件: ${attachment.name}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          ...attachment,
          dataUrl: `data:${attachment.mimeType};base64,${bytes.toString('base64')}`,
        };
      }),
    );
  }

  private isStreamStatus(value: string | null): value is MessageStreamStatus {
    return [
      'thinking',
      'streaming',
      'awaiting-approval',
      'completed',
      'failed',
      'stopped',
    ].includes(value ?? '');
  }
}

function isToolResultFailure(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    'error' in output &&
    typeof output.error === 'string'
  );
}
