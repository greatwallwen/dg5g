#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { openDatabase, resolveDatabasePath } from '../src/platform/db/database.ts';
import { resetDemo, seedBase, seedDemo } from '../src/platform/db/demo-seed.ts';
import {
  LATEST_SCHEMA_VERSION,
  migrateDatabase,
  verifyMigrationState,
} from '../src/platform/db/migrations.ts';

const args = process.argv.slice(2);
const command = args[0];
const database = openDatabase();

try {
  if (command === 'migrate' && args.length === 1) {
    const result = migrateDatabase(database);
    console.log(`Migration complete (schema ${result.currentVersion}).`);
  } else if (command === 'seed' && args[1] === 'base' && args.length === 2) {
    migrateDatabase(database);
    seedBase(database);
    console.log('Base seed complete.');
  } else if (command === 'seed' && args[1] === 'demo' && args.length === 2) {
    migrateDatabase(database);
    seedDemo(database);
    console.log('Demo seed complete.');
  } else if (command === 'reset' && args[1] === 'demo' && args.length === 2) {
    migrateDatabase(database);
    resetDemo(database);
    console.log('Demo reset complete.');
  } else if (command === 'verify' && args.length === 1) {
    verifyDatabase(database);
    console.log(`Verification passed (schema ${LATEST_SCHEMA_VERSION}, integrity ok).`);
  } else if (command === 'backup' && args.length <= 2) {
    verifyPhysicalIntegrity(database);
    database.pragma('wal_checkpoint(PASSIVE)');
    const destination = resolveBackupPath(args[1]);
    mkdirSync(dirname(destination), { recursive: true });
    await database.backup(destination);
    console.log(`Backup complete: ${destination}`);
  } else {
    printUsage();
    process.exitCode = 1;
  }
} catch {
  console.error('Database command failed.');
  process.exitCode = 1;
} finally {
  database.close();
}

function verifyDatabase(candidate) {
  const migrationState = verifyMigrationState(candidate);
  if (migrationState.currentVersion !== LATEST_SCHEMA_VERSION) {
    throw new Error('Unsupported schema.');
  }

  verifyPhysicalIntegrity(candidate);
}

function verifyPhysicalIntegrity(candidate) {
  const integrity = candidate.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') throw new Error('Integrity check failed.');

  const foreignKeyViolations = candidate.pragma('foreign_key_check');
  if (foreignKeyViolations.length > 0) throw new Error('Foreign key check failed.');
}

function resolveBackupPath(explicitPath) {
  const databasePath = resolveDatabasePath();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = explicitPath
    ? (isAbsolute(explicitPath) ? explicitPath : resolve(explicitPath))
    : join(dirname(databasePath), 'backups', `dgbook-demo-${timestamp}.sqlite`);
  if (resolve(destination) === resolve(databasePath)) throw new Error('Backup destination is invalid.');
  return destination;
}

function printUsage() {
  console.error('Usage: db-admin <migrate|seed base|seed demo|reset demo|verify|backup [path]>');
}
