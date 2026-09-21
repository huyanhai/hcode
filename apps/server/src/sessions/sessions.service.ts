import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
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
      if (emptySession?._count.messages === 0) {
        return this.toSummary(emptySession);
      }
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
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('会话不存在');

    const profile = input.profileId
      ? await this.prisma.modelProfile.findUnique({ where: { id: input.profileId } })
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
    const model = input.model?.trim() || profile.model;
    const title = session.title === '新会话' ? this.makeTitle(content) : session.title;
    await this.prisma.session.update({
      where: { id },
      data: { title, updatedAt: BigInt(Date.now()) },
    });

    let assistantContent: string;
    try {
      const provider = createOpenAI({
        apiKey: profile.apiKey,
        baseURL: normalizeProviderBaseUrl(profile.baseUrl),
      });
      const result = await generateText({
        model: provider.responses(model),
        messages: [
          ...history
            .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
            .map((message) => ({ role: message.role, content: message.content })),
          { role: 'user', content },
        ] as never,
      });
      assistantContent = result.text.trim();
    } catch (error) {
      console.error('AI request failed', error instanceof Error ? error.message : error);
      throw new BadGatewayException('请求模型失败');
    }
    if (!assistantContent) throw new BadGatewayException('模型没有返回内容');

    await this.appendMessage(id, 'assistant', assistantContent);
    const updatedAt = BigInt(Date.now());
    await this.prisma.session.update({
      where: { id },
      data: { title, updatedAt },
    });
    return this.open(id);
  }

  async stream(id: string, input: SendMessageDto, response: ServerResponse): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('会话不存在');

    const profile = input.profileId
      ? await this.prisma.modelProfile.findUnique({ where: { id: input.profileId } })
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
    const title = session.title === '新会话' ? this.makeTitle(content) : session.title;
    await this.prisma.session.update({
      where: { id },
      data: { title, updatedAt: BigInt(Date.now()) },
    });

    const provider = createOpenAI({
      apiKey: profile.apiKey,
      baseURL: normalizeProviderBaseUrl(profile.baseUrl),
    });
    const result = streamText({
      // GPT 及当前 Atria 兼容接口使用 Responses API，而不是
      // /chat/completions。AI SDK 会把 Responses 增量转换成 text-delta，
      // 再由下面的 textStream 转发给前端。
      model: provider.responses(input.model?.trim() || profile.model),
      messages: [
        ...history
          .filter((message) => ['system', 'user', 'assistant'].includes(message.role))
          .map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content },
      ] as never,
      onError: ({ error }) => {
        console.error('AI stream failed', error);
      },
    });

    let assistantText = '';
    let responseStarted = false;
    try {
      for await (const text of result.textStream) {
        if (!responseStarted) {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache, no-transform');
          response.setHeader('Connection', 'keep-alive');
          responseStarted = true;
        }
        assistantText += text;
        response.write(text);
      }

      // Persist before ending the HTTP response. The client reloads the
      // session as soon as the stream closes.
      if (assistantText.trim()) {
        await this.appendMessage(id, 'assistant', assistantText);
        await this.prisma.session.update({
          where: { id },
          data: { updatedAt: BigInt(Date.now()) },
        });
      }

      if (!responseStarted) {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      response.end();
    } catch (error) {
      console.error('AI stream failed', error);
      if (!responseStarted) {
        response.statusCode = 502;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ code: '-1', data: null, message: '请求模型失败' }));
      } else {
        response.end();
      }
    }
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
    return {
      ...message,
      createdAt: message.createdAt.toString(),
    };
  }
}
