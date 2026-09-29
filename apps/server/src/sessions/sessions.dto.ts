import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

export class MessageAttachmentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsUrl()
  url!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  size!: number;
}

export class MessageCommentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsOptional()
  content!: string;

  @IsOptional()
  @IsString()
  selectedText?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsInt()
  startOffset?: number;

  @IsOptional()
  @IsInt()
  endOffset?: number;
}

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
  @IsOptional()
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  attachments?: MessageAttachmentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageCommentDto)
  comments?: MessageCommentDto[];
}

export class EditMessageDto extends SendMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId!: string;
}

export class RespondApprovalDto {
  @IsBoolean()
  approved!: boolean;
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
  attachments?: MessageAttachment[];
  comments?: MessageComment[];
  sequence: number;
  createdAt: string;
  toolCalls?: MessageToolCall[];
  streamStatus?: MessageStreamStatus;
  startedAt?: string;
  completedAt?: string;
};

export type MessageAttachment = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type MessageComment = {
  id: string;
  content: string;
  selectedText?: string;
  messageId?: string;
  startOffset?: number;
  endOffset?: number;
};

export type MessageStreamStatus =
  | 'thinking'
  | 'streaming'
  | 'awaiting-approval'
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
  contentOffset?: number;
  approval?: {
    id: string;
    status: 'pending' | 'approved' | 'denied';
  };
};

export type SessionDetail = {
  session: SessionSummary;
  messages: MessageSummary[];
};
