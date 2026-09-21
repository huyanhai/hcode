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
};

export type SessionDetail = {
  session: SessionSummary;
  messages: MessageSummary[];
};
