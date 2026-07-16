import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function readGitInfo(rootDir = process.cwd()) {
  try {
    const [commit, branch, remote, status] = await Promise.all([
      gitOutput(rootDir, ['rev-parse', 'HEAD']),
      gitOutput(rootDir, ['branch', '--show-current']),
      gitOutput(rootDir, ['config', '--get', 'remote.origin.url']).catch(() => ''),
      gitOutput(rootDir, ['status', '--short']).catch(() => ''),
    ]);
    const statusEntries = status
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => line.slice(3).replace(/^.* -> /, ''));
    const ignoredLocalChanges = statusEntries.filter(isIgnoredLocalChange);
    const dirtyFiles = statusEntries.filter((entry) => !isIgnoredLocalChange(entry));
    return {
      commit: commit.trim(),
      branch: branch.trim() || '(detached)',
      remote: remote.trim() || null,
      sourceDirty: dirtyFiles.length > 0,
      dirtyFiles,
      ignoredLocalChanges,
    };
  } catch (error) {
    return {
      commit: null,
      branch: null,
      remote: null,
      sourceDirty: null,
      dirtyFiles: [],
      ignoredLocalChanges: [],
      error: error.message,
    };
  }
}

async function gitOutput(rootDir, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: rootDir });
  return stdout;
}

function isIgnoredLocalChange(entry) {
  return entry === '.codex/config.toml'
    || entry.startsWith('artifacts/')
    || entry.startsWith('output/')
    || entry.startsWith('site/dist/');
}
