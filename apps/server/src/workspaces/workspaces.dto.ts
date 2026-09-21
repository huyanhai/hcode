import { IsNotEmpty, IsString } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  path!: string;
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
};
