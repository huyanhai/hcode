import { Controller, Get } from '@nestjs/common';
import { AgentService } from './agent.service';
import { successResponse, type ApiResponse } from '../common/api-response';

@Controller()
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  getHello(): ApiResponse<string> {
    return successResponse(this.agentService.getHello());
  }
}
