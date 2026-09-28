import { Inject, Injectable } from '@nestjs/common';
import type { FileUpload, FileStorageProvider, StoredFile } from './file-storage.types';
import { FILE_STORAGE_PROVIDER } from './file-storage.types';

@Injectable()
export class FileStorageService {
  constructor(
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly provider: FileStorageProvider,
  ) {}

  upload(file: FileUpload): Promise<StoredFile> {
    return this.provider.upload(file);
  }

  isManagedUrl(url: string): boolean {
    return this.provider.isManagedUrl(url);
  }
}
