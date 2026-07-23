import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { verifyWebRuntimeMedia } from './web-runtime-media-contract.mjs';

const execFileAsync = promisify(execFile);

export async function auditAcceptedMediaGitCheckout({ repositoryRoot } = {}) {
  const root = path.resolve(repositoryRoot);
  const verified = await verifyWebRuntimeMedia({ repositoryRoot: root });
  const entries = verified.contract.entries;
  const targetPaths = entries.map(({ targetPath }) => targetPath);
  const issues = [];

  const { stdout } = await execFileAsync(
    'git',
    ['check-attr', '--cached', 'text', 'diff', '--', ...targetPaths],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  const attributes = parseGitAttributes(stdout);
  for (const targetPath of targetPaths) {
    for (const attribute of ['text', 'diff']) {
      const actual = attributes.get(`${targetPath}:${attribute}`);
      if (actual !== 'unset') {
        issues.push({
          code: 'unsafe-cached-attribute',
          path: targetPath,
          attribute,
          expected: 'unset',
          actual: actual ?? 'missing',
        });
      }
    }
  }

  let committedBlobChecks = 0;
  for (const entry of entries) {
    try {
      const { stdout: blob } = await execFileAsync(
        'git',
        ['cat-file', 'blob', `HEAD:${entry.targetPath}`],
        { cwd: root, encoding: 'buffer', maxBuffer: Math.max(entry.bytes + 1024, 1024 * 1024) },
      );
      committedBlobChecks += 1;
      if (blob.byteLength !== entry.bytes) {
        issues.push({
          code: 'committed-byte-mismatch',
          path: entry.targetPath,
          expected: entry.bytes,
          actual: blob.byteLength,
        });
      }
      const digest = sha256(blob);
      if (digest !== entry.sha256) {
        issues.push({
          code: 'committed-sha256-mismatch',
          path: entry.targetPath,
          expected: entry.sha256,
          actual: digest,
        });
      }
    } catch (error) {
      issues.push({
        code: 'unreadable-committed-blob',
        path: entry.targetPath,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Object.freeze({
    passed: issues.length === 0,
    fileCount: entries.length,
    cachedAttributeChecks: attributes.size,
    committedBlobChecks,
    issues: Object.freeze(issues),
  });
}

function parseGitAttributes(stdout) {
  const attributes = new Map();
  for (const line of stdout.trim().split(/\r?\n/u)) {
    const match = /^(.*): ([^:]+): (.*)$/u.exec(line);
    if (match) attributes.set(`${match[1]}:${match[2]}`, match[3]);
  }
  return attributes;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}
