const AUTHORITATIVE_ROOTS = [
  '.git',
  '.agents',
  '.codex',
  '.codegraph',
  '.playwright-cli',
  '.pnpm-store',
  'content',
  'textbook',
  'packages',
  'apps/web/database',
  'apps/web/.data',
  'apps/web/public/media',
  'site/public/media',
  'artifacts/media-cutover',
  'runtime/tts',
  'runtime/voice-profiles',
  'runtime/vendor-research',
  'scripts/import_5g',
];

const AUTHORITATIVE_FILES = new Set(['scripts/import-5g-docx.py']);
const PROTECTED_EVIDENCE_ROLES = new Set(['current', 'previous', 'final', 'unknown']);
const DOS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i;

export class WorkspacePolicyError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'WorkspacePolicyError';
    this.code = code;
    this.details = details;
  }
}

function unsafePath(message, inputPath) {
  throw new WorkspacePolicyError('UNSAFE_PATH', message, { inputPath });
}

export function normalizeWorkspacePath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.trim().length === 0) {
    unsafePath('Workspace path must be a non-empty string.', inputPath);
  }

  if (/[\u0000-\u001f\u007f]/.test(inputPath)) {
    unsafePath('Workspace path contains a control character.', inputPath);
  }

  if (inputPath.startsWith('/') || inputPath.startsWith('\\')) {
    unsafePath('Workspace path must be repository-relative.', inputPath);
  }

  if (/^[a-z]:/i.test(inputPath)) {
    unsafePath('Drive-qualified and drive-relative paths are forbidden.', inputPath);
  }

  if (/%[0-9a-f]{2}/i.test(inputPath)) {
    unsafePath('Percent-encoded path bytes are forbidden.', inputPath);
  }

  const path = inputPath.replaceAll('\\', '/');
  const segments = path.split('/');

  if (segments.some((segment) => segment.length === 0)) {
    unsafePath('Workspace path contains an empty segment.', inputPath);
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      unsafePath('Workspace path traversal is forbidden.', inputPath);
    }

    if (segment.includes(':')) {
      unsafePath('Alternate data streams and colon-bearing segments are forbidden.', inputPath);
    }

    if (/[. ]$/.test(segment)) {
      unsafePath('Workspace path segments may not end in a dot or space.', inputPath);
    }

    if (DOS_RESERVED_BASENAME.test(segment)) {
      unsafePath('Workspace path contains a reserved DOS device name.', inputPath);
    }
  }

  return path;
}

function isAtOrBelow(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function authoritativeReason(path) {
  if (AUTHORITATIVE_FILES.has(path)) {
    return `authoritative:${path}`;
  }

  const root = AUTHORITATIVE_ROOTS.find((candidate) => isAtOrBelow(path, candidate));
  if (root) {
    return `authoritative:${root}`;
  }

  if (path.split('/').includes('node_modules')) {
    return 'authoritative:node_modules';
  }

  if (/^apps\/web\/public\/media\.(?:staging|rollback|quarantine)-[^/]+(?:\/|$)/.test(path)) {
    return 'authoritative:media-cutover-sibling';
  }

  return undefined;
}

function regenerableReason(path) {
  if (isAtOrBelow(path, 'apps/web/.next')) {
    return 'regenerable:next-build-cache';
  }

  if (/^scripts(?:\/.*)?\/__pycache__(?:\/|$)/.test(path)) {
    return 'regenerable:python-bytecode-cache';
  }

  if (/^scripts\/.*\.pyc$/i.test(path)) {
    return 'regenerable:python-bytecode';
  }

  if (isAtOrBelow(path, 'artifacts/web-source-release/dgbook-web-source')) {
    return 'regenerable:unpacked-release-staging';
  }

  return undefined;
}

function isApprovedEvidencePath(path) {
  return path.startsWith('output/playwright/');
}

function isExactSourceReleaseHistoryRoot(path) {
  return /^artifacts\/web-source-release-history\/[^/]+$/u.test(path);
}

export function classifyWorkspacePath(inputPath, metadata = {}) {
  const path = normalizeWorkspacePath(inputPath);
  if (metadata?.isReparsePoint || metadata?.hasReparseAncestor) {
    throw new WorkspacePolicyError(
      'REPARSE_POINT',
      'Reparse points and paths below reparse points are never cleanup candidates.',
      { path },
    );
  }

  const regenerable = regenerableReason(path);
  const authoritative = authoritativeReason(path);

  if (authoritative && !regenerable) {
    return { path, disposition: 'protected', reason: authoritative };
  }

  if (metadata?.evidenceRole !== undefined && metadata.evidenceRole !== 'superseded') {
    const role = PROTECTED_EVIDENCE_ROLES.has(metadata.evidenceRole)
      ? metadata.evidenceRole
      : 'unknown';
    return { path, disposition: 'protected', reason: `evidence:${role}` };
  }

  if (regenerable) {
    return { path, disposition: 'removable', reason: regenerable };
  }

  if (isApprovedEvidencePath(path)) {
    const role = PROTECTED_EVIDENCE_ROLES.has(metadata.evidenceRole)
      ? metadata.evidenceRole
      : metadata.evidenceRole === 'superseded'
        ? 'superseded'
        : 'unknown';

    if (role === 'superseded') {
      return {
        path,
        disposition: 'removable',
        reason: 'superseded-evidence:playwright-output',
      };
    }

    return { path, disposition: 'protected', reason: `evidence:${role}` };
  }

  if (metadata.evidenceRole === 'superseded' && isExactSourceReleaseHistoryRoot(path)) {
    return {
      path,
      disposition: 'removable',
      reason: 'superseded-evidence:web-source-release-history',
    };
  }

  return { path, disposition: 'protected', reason: 'unknown-default' };
}

export function classifyWorkspacePaths(entries) {
  if (!Array.isArray(entries)) {
    throw new WorkspacePolicyError('UNSAFE_PATH', 'Batch candidates must be an array.');
  }

  const normalizedEntries = entries.map((entry) => {
    const metadata = typeof entry === 'string' ? {} : entry;
    const inputPath = typeof entry === 'string' ? entry : entry?.path;
    return {
      path: normalizeWorkspacePath(inputPath),
      metadata,
    };
  });

  const exactPaths = new Set();
  const foldedPaths = new Map();

  for (const { path } of normalizedEntries) {
    if (exactPaths.has(path)) {
      throw new WorkspacePolicyError('DUPLICATE_PATH', 'Batch contains a duplicate normalized path.', {
        path,
      });
    }

    const foldedPath = path.toLowerCase();
    const conflictingPath = foldedPaths.get(foldedPath);
    if (conflictingPath !== undefined) {
      throw new WorkspacePolicyError(
        'CASE_COLLISION',
        'Batch contains paths that collide on a case-insensitive filesystem.',
        { path, conflictingPath },
      );
    }

    exactPaths.add(path);
    foldedPaths.set(foldedPath, path);
  }

  return normalizedEntries.map(({ path, metadata }) => classifyWorkspacePath(path, metadata));
}
