export type StoredFile = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type FileUpload = {
  buffer: Buffer;
  name: string;
  mimeType: string;
  size: number;
};

export interface FileStorageProvider {
  upload(file: FileUpload): Promise<StoredFile>;
  isManagedUrl(url: string): boolean;
}

export const FILE_STORAGE_PROVIDER = Symbol('FILE_STORAGE_PROVIDER');
