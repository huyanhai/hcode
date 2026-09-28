import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import ImageKit, { toFile } from '@imagekit/nodejs';
import type {
  FileStorageProvider,
  FileUpload,
  StoredFile,
} from './file-storage.types';

@Injectable()
export class ImageKitFileStorageProvider implements FileStorageProvider {
  isManagedUrl(url: string): boolean {
    const configuredHost = process.env.UPLOAD_IMAGE_HOST?.trim();
    if (!configuredHost) return false;
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'https:' &&
        parsed.host === new URL(configuredHost).host
      );
    } catch {
      return false;
    }
  }

  async upload(file: FileUpload): Promise<StoredFile> {
    const privateKey = process.env.UPLOAD_IMAGE_PRIVATE_KEY?.trim();
    if (!privateKey || !process.env.UPLOAD_IMAGE_HOST?.trim()) {
      throw new ServiceUnavailableException('文件存储未配置');
    }

    try {
      const client = new ImageKit({ privateKey });
      const response = await client.files.upload({
        file: await toFile(file.buffer, file.name, { type: file.mimeType }),
        fileName: file.name,
        useUniqueFileName: true,
      });
      if (!response.fileId || !response.url)
        throw new BadRequestException('文件存储返回结果无效');
      return {
        id: response.fileId,
        url: response.url,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(
        `文件存储请求失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
