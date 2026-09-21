import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ModelProfilesService } from './model-profiles.service';
import {
  DeleteModelProfileDto,
  ListModelProfileModelsDto,
  UpsertModelProfileDto,
} from './model-profiles.dto';
import { successResponse, type ApiResponse } from '../common/api-response';

@Controller('api/model-profiles')
export class ModelProfilesController {
  constructor(private readonly service: ModelProfilesService) {}

  @Get()
  async list(): Promise<ApiResponse<unknown[]>> {
    return successResponse(await this.service.list());
  }

  @Post('upsert')
  @HttpCode(200)
  async upsert(
    @Body() body: UpsertModelProfileDto,
  ): Promise<ApiResponse<unknown>> {
    return successResponse(await this.service.upsert(body));
  }

  @Post('delete')
  @HttpCode(200)
  async remove(
    @Body() body: DeleteModelProfileDto,
  ): Promise<ApiResponse<{ id: string }>> {
    return successResponse(await this.service.remove(body.id));
  }

  @Post('models')
  @HttpCode(200)
  async models(
    @Body() body: ListModelProfileModelsDto,
  ): Promise<ApiResponse<{ models: string[] }>> {
    return successResponse(await this.service.listModels(body.profileId));
  }
}
