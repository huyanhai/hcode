import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { successResponse, type ApiResponse } from '../common/api-response';
import {
  ListFilesDto,
  MakeDirectoryDto,
  ReadFileDto,
  RemoveFileDto,
  RenameFileDto,
  WriteFileDto,
  type FileNodePayload,
  type ReadFileResult,
} from './files.dto';
import { FilesService } from './files.service';

/**
 * 为 @hcode/file-manager 的 HttpFileProvider 提供接口。
 *
 * 路径：/api/files/*
 * - GET  /api/files/list?path=&recursive=&ignore=
 * - GET  /api/files/read?path=
 * - POST /api/files/write
 * - POST /api/files/rename
 * - POST /api/files/remove
 * - POST /api/files/mkdir
 */
@Controller('api/files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get('list')
  async list(
    @Query() query: ListFilesDto,
  ): Promise<ApiResponse<FileNodePayload[]>> {
    return successResponse(
      await this.service.list({
        path: query.path,
        recursive: query.recursive ?? false,
        ignore: query.ignore,
      }),
    );
  }

  @Get('read')
  async read(@Query() query: ReadFileDto): Promise<ApiResponse<ReadFileResult>> {
    return successResponse(await this.service.read(query));
  }

  @Post('write')
  @HttpCode(200)
  async write(
    @Body() body: WriteFileDto,
  ): Promise<ApiResponse<{ mtimeMs: number }>> {
    return successResponse(await this.service.write(body));
  }

  @Post('rename')
  @HttpCode(200)
  async rename(@Body() body: RenameFileDto): Promise<ApiResponse<null>> {
    await this.service.rename(body);
    return successResponse(null);
  }

  @Post('remove')
  @HttpCode(200)
  async remove(@Body() body: RemoveFileDto): Promise<ApiResponse<null>> {
    await this.service.remove(body);
    return successResponse(null);
  }

  @Post('mkdir')
  @HttpCode(200)
  async mkdir(@Body() body: MakeDirectoryDto): Promise<ApiResponse<null>> {
    await this.service.mkdir(body);
    return successResponse(null);
  }
}
