import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { DatabaseModule } from '../database/database.module';
import { ModelProfilesModule } from '../model-profiles/model-profiles.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from '../common/api-exception.filter';

@Module({
  imports: [DatabaseModule, ModelProfilesModule, WorkspacesModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
