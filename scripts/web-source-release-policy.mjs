export const MAX_WEB_SOURCE_RELEASE_BYTES = 256 * 1024 * 1024;

export const REQUIRED_WEB_SOURCE_RUNTIME_FILES = Object.freeze([
  'textbook/5g/generated/p1-demo-content.json',
  'textbook/5g/generated/lesson-ast/P01.json',
  'textbook/5g/generated/lesson-ast/P02.json',
  'textbook/5g/generated/lesson-ast/P03.json',
]);

const requiredRuntimeFiles = new Set(
  REQUIRED_WEB_SOURCE_RUNTIME_FILES.map((file) => file.toLowerCase()),
);

export const WEB_SOURCE_DIRECTORY_ROOTS = Object.freeze([
  'apps/web/',
  'packages/animation/',
  'packages/edugame-assets/',
  'packages/edugame-core/',
  'packages/shared/',
  'packages/widgets/',
]);

const transientMediaRootPrefixes = [
  'apps/web/public/media.staging',
  'apps/web/public/media.rollback',
  'apps/web/public/media.quarantine',
  'apps/web/public/media.failed',
  'apps/web/public/.media-staging',
  'apps/web/public/.media-rollback',
  'apps/web/public/.media-quarantine',
];

export const WEB_SOURCE_ROOT_FILES = Object.freeze([
  '.node-version',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]);

const rootFiles = new Set(WEB_SOURCE_ROOT_FILES);
const credentialPayloadName = /(?:^|[-_.])(?:credentials?|service[-_]?account|deploy[-_]?token)(?:[-_.]|$)/u;
const sourceCodeExtension = /\.(?:[cm]?[jt]sx?)$/u;
const compressedArchiveExtension = /\.(?:7z|br|bz2|cab|gz|rar|tar|tbz2?|tgz|txz|xz|zip|zst)$/u;
const reproducibleDirectoryNames = new Set([
  '.data',
  '.next',
  '.turbo',
  'artifacts',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'temp',
  'tmp',
]);

function isReproducibleDirectory(segment) {
  return reproducibleDirectoryNames.has(segment)
    || segment.startsWith('.next-')
    || segment.startsWith('.next.');
}

export function shouldPackageWebSourceFile(file) {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  const segments = normalized.split('/').filter(Boolean);
  if (rootFiles.has(normalized)) return true;
  if (transientMediaRootPrefixes.some((root) => normalized.startsWith(`${root}/`) || normalized.startsWith(`${root}-`))) return false;
  if (segments.some((segment) => segment.startsWith('.'))) return false;
  if (segments.some(isReproducibleDirectory)) return false;
  if (
    basename === '.env'
    || basename.startsWith('.env.')
    || basename === '.npmrc'
    || basename === 'id_rsa'
    || basename === 'id_dsa'
    || basename === 'id_ecdsa'
    || basename === 'id_ed25519'
    || /\.(?:key|pem|p12|pfx)$/u.test(basename)
    || /\.(?:sqlite3?|sqlite3?-(?:wal|shm|journal)|db|db-(?:wal|shm|journal))$/u.test(basename)
    || /\.(?:bak|backup|log|old|orig|swp|temp|tmp)$/u.test(basename)
    || compressedArchiveExtension.test(basename)
    || (credentialPayloadName.test(basename) && !sourceCodeExtension.test(basename))
    || basename.endsWith('~')
  ) return false;
  if (requiredRuntimeFiles.has(normalized)) return true;
  if (normalized.endsWith('.tsbuildinfo')) return false;
  return WEB_SOURCE_DIRECTORY_ROOTS.some((root) => normalized.startsWith(root));
}
