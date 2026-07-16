import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { openDatabase, resolveDatabasePath } from './database.ts';
import { resolveMigrationsDirectory } from './migrations.ts';
import { createTestDatabase } from './test-database.ts';

test('opens an isolated file database with the required SQLite pragmas', () => {
  const testDatabase = createTestDatabase();

  try {
    assert.equal(existsSync(testDatabase.databasePath), true);
    assert.equal(testDatabase.database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(testDatabase.database.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(testDatabase.database.pragma('busy_timeout', { simple: true }), 5_000);
    assert.equal(testDatabase.database.pragma('synchronous', { simple: true }), 1);
  } finally {
    testDatabase.cleanup();
  }
});

test('resolves one database and migration location from the repository and web app roots', () => {
  const startingDirectory = process.cwd();
  const repositoryRoot = startingDirectory.endsWith(join('apps', 'web'))
    ? resolve(startingDirectory, '..', '..')
    : startingDirectory;
  const webRoot = join(repositoryRoot, 'apps', 'web');
  const expectedDatabase = join(webRoot, '.data', 'dgbook-demo.sqlite');
  const expectedMigrations = join(webRoot, 'database', 'migrations');

  try {
    for (const directory of [repositoryRoot, webRoot]) {
      process.chdir(directory);
      assert.equal(resolveDatabasePath(), expectedDatabase);
      assert.equal(resolveMigrationsDirectory(), expectedMigrations);
    }
  } finally {
    process.chdir(startingDirectory);
  }
});

test('provides migrate, seed, reset, verify, and backup commands without sensitive output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dgbook-db-admin-'));
  const databasePath = join(directory, 'admin.sqlite');
  const backupPath = join(directory, 'admin-backup.sqlite');
  const commands = [
    ['migrate'],
    ['seed', 'base'],
    ['seed', 'demo'],
    ['reset', 'demo'],
    ['verify'],
    ['backup', backupPath],
  ];

  try {
    for (const command of commands) {
      const result = spawnSync(
        process.execPath,
        ['apps/web/scripts/db-admin.mjs', ...command],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, DGBOOK_SQLITE_PATH: databasePath },
        },
      );
      const output = `${result.stdout}${result.stderr}`;
      assert.equal(result.status, 0, `${command.join(' ')} failed:\n${output}`);
      assert.doesNotMatch(output, /password|hash|token|payload/i);
    }

    assert.equal(existsSync(databasePath), true);
    assert.equal(existsSync(backupPath), true);
    const database = openDatabase({ path: databasePath, fileMustExist: true });
    try {
      assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(database.prepare('SELECT COUNT(*) FROM users').pluck().get(), 4);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
