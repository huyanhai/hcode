import { Module } from '@nestjs/common';
import { ModelProfilesController } from './model-profiles.controller';
import { ModelProfilesService } from './model-profiles.service';

@Module({
  controllers: [ModelProfilesController],
  providers: [ModelProfilesService],
})
export class ModelProfilesModule {}
