import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type AppDatabase } from './database.ts';

export interface TestDatabase {
  database: AppDatabase;
  databasePath: string;
  cleanup: () => void;
}

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'dgbook-sqlite-'));
  const databasePath = join(directory, 'test.sqlite');
  const database = openDatabase(databasePath);
  let cleaned = false;

  return {
    database,
    databasePath,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
