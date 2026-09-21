import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { successResponse, type ApiResponse } from '../common/api-response';
import { CreateWorkspaceDto, type WorkspaceSummary } from './workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}
  @Get()
  async list(): Promise<ApiResponse<WorkspaceSummary[]>> { return successResponse(await this.service.list()); }
  @Post('create')
  @HttpCode(200)
  async create(@Body() body: CreateWorkspaceDto): Promise<ApiResponse<WorkspaceSummary>> { return successResponse(await this.service.create(body)); }
}
