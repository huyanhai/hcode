import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { successResponse, type ApiResponse } from '../common/api-response';
import {
  CreateWorkspaceDto,
  DeleteWorkspaceDto,
  UpdateWorkspaceDto,
  type WorkspaceSummary,
} from './workspaces.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('api/workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}
  @Get()
  async list(): Promise<ApiResponse<WorkspaceSummary[]>> {
    return successResponse(await this.service.list());
  }
  @Post('create')
  @HttpCode(200)
  async create(
    @Body() body: CreateWorkspaceDto,
  ): Promise<ApiResponse<WorkspaceSummary>> {
    return successResponse(await this.service.create(body));
  }

  @Post('update')
  @HttpCode(200)
  async update(
    @Body() body: UpdateWorkspaceDto,
  ): Promise<ApiResponse<WorkspaceSummary>> {
    return successResponse(await this.service.update(body));
  }

  @Post('delete')
  @HttpCode(200)
  async delete(
    @Body() body: DeleteWorkspaceDto,
  ): Promise<ApiResponse<{ id: string }>> {
    return successResponse(await this.service.delete(body.id));
  }

  @Post(':id/archive')
  @HttpCode(200)
  async archive(@Param('id') id: string): Promise<ApiResponse<WorkspaceSummary>> {
    return successResponse(await this.service.archive(id));
  }
}
