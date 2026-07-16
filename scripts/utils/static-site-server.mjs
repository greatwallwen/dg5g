import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.wasm', 'application/wasm'],
]);

export async function startStaticSiteServerIfNeeded(args, rootDir) {
  if (args.baseUrl) return null;
  const siteRoot = path.resolve(args.staticRoot ?? path.join(rootDir, 'site', 'dist'));
  await assertDirectory(siteRoot);

  const server = createServer(async (request, response) => {
    try {
      const filePath = await resolveStaticFile(siteRoot, request.url ?? '/');
      response.setHeader('Content-Type', contentType(filePath));
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start static site audit server');
  args.baseUrl = `http://127.0.0.1:${address.port}`;
  return server;
}

export async function closeStaticSiteServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function resolveStaticFile(siteRoot, requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const candidate = safeJoin(siteRoot, pathname);
  const direct = await fileIfExists(candidate);
  if (direct) return direct;
  const index = await fileIfExists(path.join(candidate, 'index.html'));
  if (index) return index;
  if (!path.extname(candidate)) {
    const html = await fileIfExists(`${candidate}.html`);
    if (html) return html;
  }
  throw new Error(`Static file not found: ${pathname}`);
}

function safeJoin(siteRoot, pathname) {
  const relativePath = pathname.replace(/^\/+/, '');
  const candidate = path.resolve(siteRoot, relativePath);
  if (candidate !== siteRoot && !candidate.startsWith(`${siteRoot}${path.sep}`)) {
    throw new Error(`Path escapes site root: ${pathname}`);
  }
  return candidate;
}

async function fileIfExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function assertDirectory(dirPath) {
  try {
    const info = await stat(dirPath);
    if (info.isDirectory()) return;
  } catch {
    // handled below
  }
  throw new Error(`Static site output not found at ${dirPath}. Run pnpm --filter @dgbook/site build first.`);
}

function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';
}
