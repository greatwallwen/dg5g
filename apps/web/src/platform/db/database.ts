import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type AppDatabase = BetterSqlite3.Database;

export interface OpenDatabaseOptions {
  path?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
}

let sharedDatabase: AppDatabase | undefined;

export function resolveDatabasePath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? process.env.DGBOOK_SQLITE_PATH;
  if (configuredPath === ':memory:') return configuredPath;
  if (configuredPath) return isAbsolute(configuredPath) ? configuredPath : resolve(configuredPath);
  return join(resolveWebAppRoot(), '.data', 'dgbook-demo.sqlite');
}

export function openDatabase(
  input: string | OpenDatabaseOptions = {},
): AppDatabase {
  const options = typeof input === 'string' ? { path: input } : input;
  const databasePath = resolveDatabasePath(options.path);

  if (databasePath !== ':memory:' && !options.readonly) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const driverOptions = {
    timeout: 5_000,
    ...(options.readonly === undefined ? {} : { readonly: options.readonly }),
    ...(options.fileMustExist === undefined ? {} : { fileMustExist: options.fileMustExist }),
  };
  const database = new BetterSqlite3(databasePath, driverOptions);

  try {
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('synchronous = NORMAL');
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function getDatabase(): AppDatabase {
  if (!sharedDatabase?.open) sharedDatabase = openDatabase();
  return sharedDatabase;
}

export function closeDatabase(): void {
  if (sharedDatabase?.open) sharedDatabase.close();
  sharedDatabase = undefined;
}

function resolveWebAppRoot(): string {
  const cwd = process.cwd();
  const workspaceApp = join(cwd, 'apps', 'web');
  if (existsSync(join(workspaceApp, 'package.json'))) return workspaceApp;
  if (existsSync(join(cwd, 'database')) && existsSync(join(cwd, 'src'))) return cwd;
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}
