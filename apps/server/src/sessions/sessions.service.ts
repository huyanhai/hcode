import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { streamAgent, type CoreStreamEvent } from '@hcode/agent-core';
import { PrismaService } from '../database/prisma.service';
import type {
  CreateSessionDto,
  MessageSummary,
  SendMessageDto,
  SessionDetail,
  SessionSummary,
} from './sessions.dto';
import { normalizeProviderBaseUrl } from '../model-profiles/base-url';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId?: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    return sessions.map((session) => this.toSummary(session));
  }

  async create(input: CreateSessionDto): Promise<SessionSummary> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
    });
    if (!workspace) throw new NotFoundException('工作区不存在');
    const title = input.title?.trim() || '新会话';
    if (title === '新会话') {
      const emptySession = await this.prisma.session.findFirst({
        where: { workspaceId: workspace.id, status: 'active', title },
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
        workspaceId: workspace.id,
        title,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    return this.toSummary(session);
  }

  async open(id: string): Promise<SessionDetail> {
    const session = await this.prisma.session.findUnique({ where: { id } });
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
    if (!result.text.trim()) throw new BadGatewayException('模型没有返回内容');
    return this.open(id);
  }

  async stream(
    id: string,
    input: SendMessageDto,
    response: ServerResponse,
  ): Promise<void> {
    try {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      const result = await this.run(id, input, (event) => {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      });
      response.write(
        `data: ${JSON.stringify({ type: 'done', text: result.text })}\n\n`,
      );
      response.end();
    } catch (error) {
      console.error('AI stream failed', error);
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
    }
  }

  private async run(
    id: string,
    input: SendMessageDto,
    onEvent?: (event: CoreStreamEvent) => void,
  ): Promise<{ text: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!session) throw new NotFoundException('会话不存在');
    const profile = input.profileId
      ? await this.prisma.modelProfile.findUnique({
          where: { id: input.profileId },
        })
      : await this.prisma.modelProfile.findFirst({
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        });
    if (!profile) throw new BadRequestException('请先配置模型');

    const content = input.content.trim();
    const history = await this.prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { sequence: 'asc' },
    });
    await this.appendMessage(id, 'user', content);
    const title =
      session.title === '新会话' ? this.makeTitle(content) : session.title;
    await this.prisma.session.update({
      where: { id },
      data: { title, updatedAt: BigInt(Date.now()) },
    });

    const agentProfile = {
      ...profile,
      model: input.model?.trim() || profile.model,
      baseUrl: normalizeProviderBaseUrl(profile.baseUrl),
      createdAt: Number(profile.createdAt),
      updatedAt: Number(profile.updatedAt),
    };
    const messages = [
      ...history
        .filter((message) =>
          ['system', 'user', 'assistant'].includes(message.role),
        )
        .map((message) => ({ role: message.role, content: message.content })),
      { role: 'user', content },
    ];
    let text = '';
    console.log('执行');
    for await (const event of streamAgent(
      agentProfile,
      {
        workspaceRoot: session.workspace.path,
        permissionMode: input.fullAccess ? 'full' : 'restricted',
      },
      messages,
      {},
      undefined,
      Boolean(onEvent),
    )) {
      if (event.type === 'text') text += event.text;
      onEvent?.(event);
      if (event.type === 'error') throw event.error;
    }
    if (text.trim()) {
      await this.appendMessage(id, 'assistant', text);
      await this.prisma.session.update({
        where: { id },
        data: { updatedAt: BigInt(Date.now()) },
      });
    }
    return { text };
  }

  private async appendMessage(
    sessionId: string,
    role: string,
    content: string,
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
        sequence: (last?.sequence ?? 0) + 1,
        createdAt: BigInt(Date.now()),
      },
    });
  }

  private makeTitle(content: string): string {
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() || '新会话';
    return firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  }

  private toSummary(session: {
    id: string;
    workspaceId: string;
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
    sequence: number;
    createdAt: bigint;
  }): MessageSummary {
    return { ...message, createdAt: message.createdAt.toString() };
  }
}
