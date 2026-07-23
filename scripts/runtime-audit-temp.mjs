import { rm } from 'node:fs/promises';

export function removeRuntimeAuditDirectory(directory, { remove = rm } = {}) {
  return remove(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
}
