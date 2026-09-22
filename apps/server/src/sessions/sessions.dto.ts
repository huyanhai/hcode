import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profileId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  fullAccess?: boolean;
}

export type SessionSummary = {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageSummary = {
  id: string;
  sessionId: string;
  turnId: string | null;
  role: string;
  content: string;
  sequence: number;
  createdAt: string;
  reasoning?: string;
  toolCalls?: MessageToolCall[];
  streamStatus?: MessageStreamStatus;
  startedAt?: string;
  completedAt?: string;
};

export type MessageStreamStatus =
  | 'thinking'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'stopped';

export type MessageToolCall = {
  id: string;
  toolName: string;
  status: 'in-progress' | 'completed' | 'failed';
  input?: unknown;
  rawArguments?: string;
  output?: unknown;
};

export type SessionDetail = {
  session: SessionSummary;
  messages: MessageSummary[];
};
