import { Module } from '@nestjs/common';
import { FileStorageController } from './file-storage.controller';
import { FileStorageService } from './file-storage.service';
import { ImageKitFileStorageProvider } from './imagekit.provider';
import { FILE_STORAGE_PROVIDER } from './file-storage.types';

@Module({
  controllers: [FileStorageController],
  providers: [
    FileStorageService,
    ImageKitFileStorageProvider,
    { provide: FILE_STORAGE_PROVIDER, useExisting: ImageKitFileStorageProvider },
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
