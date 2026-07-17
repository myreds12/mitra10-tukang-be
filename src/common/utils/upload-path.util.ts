import { mkdirSync } from 'fs';
import { resolve } from 'path';

export function resolveUploadPath(subFolder = ''): string {
  const uploadPath = resolve(__dirname, '..', '..', '..', 'uploads', subFolder);
  mkdirSync(uploadPath, { recursive: true });

  return uploadPath;
}
