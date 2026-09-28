import { ImageKitFileStorageProvider } from './imagekit.provider';

describe('ImageKitFileStorageProvider', () => {
  const originalHost = process.env.UPLOAD_IMAGE_HOST;

  afterEach(() => {
    if (originalHost === undefined) delete process.env.UPLOAD_IMAGE_HOST;
    else process.env.UPLOAD_IMAGE_HOST = originalHost;
  });

  it('accepts only HTTPS URLs from the configured ImageKit host', () => {
    process.env.UPLOAD_IMAGE_HOST = 'https://ik.imagekit.io/hyh';
    const provider = new ImageKitFileStorageProvider();

    expect(provider.isManagedUrl('https://ik.imagekit.io/hyh/file.pdf')).toBe(true);
    expect(provider.isManagedUrl('http://ik.imagekit.io/hyh/file.pdf')).toBe(false);
    expect(provider.isManagedUrl('https://example.com/file.pdf')).toBe(false);
  });

  it('rejects every URL when the provider is not configured', () => {
    delete process.env.UPLOAD_IMAGE_HOST;
    expect(new ImageKitFileStorageProvider().isManagedUrl('https://ik.imagekit.io/hyh/file.pdf')).toBe(false);
  });
});
