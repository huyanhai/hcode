import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  path?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  folders?: string[];
}

export class UpdateWorkspaceDto extends CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class DeleteWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  folders: WorkspaceFolder[];
  status: string;
  createdAt: string;
  lastOpenedAt: string;
};

export type WorkspaceFolder = {
  path: string;
  isPrimary: boolean;
};
