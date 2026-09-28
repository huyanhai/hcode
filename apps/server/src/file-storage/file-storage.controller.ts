import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { successResponse, type ApiResponse } from '../common/api-response';
import { FileStorageService } from './file-storage.service';
import type { StoredFile } from './file-storage.types';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

function isAllowedMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/') || ALLOWED_MIME_TYPES.has(mimeType);
}

@Controller('api/files')
export class FileStorageController {
  constructor(private readonly storage: FileStorageService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_SIZE },
      fileFilter: (_request, file, callback) => {
        callback(null, isAllowedMimeType(file.mimetype));
      },
    }),
  )
  async upload(
    @UploadedFile() file?: UploadedFile,
  ): Promise<ApiResponse<StoredFile>> {
    if (!file) throw new BadRequestException('请选择图片或文档文件');
    if (!isAllowedMimeType(file.mimetype))
      throw new BadRequestException('不支持的文件类型');
    return successResponse(
      await this.storage.upload({
        buffer: file.buffer,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      }),
    );
  }
}
