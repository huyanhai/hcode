import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { successResponse, type ApiResponse } from '../common/api-response';
import { SessionsService } from './sessions.service';
import {
  CreateSessionDto,
  SendMessageDto,
  type SessionDetail,
  type SessionSummary,
} from './sessions.dto';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Get()
  async list(
    @Query('workspaceId') workspaceId?: string,
  ): Promise<ApiResponse<SessionSummary[]>> {
    return successResponse(await this.service.list(workspaceId));
  }

  @Post('create')
  @HttpCode(200)
  async create(
    @Body() body: CreateSessionDto,
  ): Promise<ApiResponse<SessionSummary>> {
    return successResponse(await this.service.create(body));
  }

  @Get(':id')
  async open(@Param('id') id: string): Promise<ApiResponse<SessionDetail>> {
    return successResponse(await this.service.open(id));
  }

  @Post(':id/messages')
  @HttpCode(200)
  async send(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ): Promise<ApiResponse<SessionDetail>> {
    return successResponse(await this.service.send(id, body));
  }

  @Post(':id/messages/stream')
  async stream(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.service.stream(id, body, response);
  }
}
