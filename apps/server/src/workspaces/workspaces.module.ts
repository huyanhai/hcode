import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { SessionsModule } from '../sessions/sessions.module';
import { FilesModule } from '../files/files.module';
@Module({
  imports: [SessionsModule, FilesModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
