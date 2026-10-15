import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class ListFilesDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  recursive?: boolean;

  /** 逗号分隔的忽略模式，例如 `.git,node_modules,*.log` */
  @IsOptional()
  @IsString()
  ignore?: string;
}

export class ReadFileDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

export class WriteFileDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overwrite?: boolean;
}

export class RenameFileDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  @IsNotEmpty()
  newPath!: string;
}

export class RemoveFileDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  recursive?: boolean;
}

export class MakeDirectoryDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

export interface FileNodePayload {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
  children?: FileNodePayload[] | null;
}

export interface ReadFileResult {
  content: string;
  mtimeMs: number;
}
