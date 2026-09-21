import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export type ModelProfileSummary = {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  apiKeyHint: string;
};

export class UpsertModelProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  baseUrl!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class DeleteModelProfileDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class ListModelProfileModelsDto {
  @IsString()
  @IsNotEmpty()
  profileId!: string;
}
