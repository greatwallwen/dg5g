import { createRequire, register as registerLoader } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPackageUrl = pathToFileURL(path.join(repositoryRoot, 'apps', 'web', 'package.json'));
const requireFromWeb = createRequire(webPackageUrl);
const tsxApiUrl = pathToFileURL(requireFromWeb.resolve('tsx/esm/api')).href;
const { register: registerTsx } = await import(tsxApiUrl);
const inheritedPreload = `--import=${import.meta.url}`;
const currentNodeOptions = process.env.NODE_OPTIONS?.trim() ?? '';

if (!currentNodeOptions.split(/\s+/u).includes(inheritedPreload)) {
  process.env.NODE_OPTIONS = [currentNodeOptions, inheritedPreload].filter(Boolean).join(' ');
}

registerTsx({
  tsconfig: path.join(repositoryRoot, 'apps', 'web', 'tsconfig.json'),
});
registerLoader('./web-test-loader.mjs', import.meta.url);
