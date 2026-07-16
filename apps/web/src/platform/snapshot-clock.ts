import type { AppDatabase } from './db/database.ts';

export type SnapshotTopic = 'global' | `learning:${string}` | `classroom:${string}`;
export type ScopedSnapshotTopic = Exclude<SnapshotTopic, 'global'>;

export interface SnapshotVersion {
  version: number;
  updatedAt: string;
}

export interface SnapshotAdvanceResult {
  globalVersion: number;
  topicVersions: Record<ScopedSnapshotTopic, number>;
}

export class SnapshotTopicNotFoundError extends Error {
  constructor(readonly topic: SnapshotTopic) {
    super(`Snapshot topic was not found: ${topic}`);
    this.name = 'SnapshotTopicNotFoundError';
  }
}

interface SnapshotVersionRow {
  version: number;
  updatedAt: string;
}

/**
 * Monotonic snapshot version helper. Mutations intentionally do not open their
 * own transaction: callers use this clock inside the same SQLite transaction
 * that persists the business fact.
 */
export class SnapshotClock {
  constructor(private readonly database: AppDatabase) {}

  read(topic: SnapshotTopic): SnapshotVersion {
    const row = this.database.prepare(`
      SELECT version, updated_at AS updatedAt
      FROM snapshot_versions
      WHERE topic = ?
    `).get(topic) as SnapshotVersionRow | undefined;
    if (!row) throw new SnapshotTopicNotFoundError(topic);
    return { version: row.version, updatedAt: row.updatedAt };
  }

  advance(
    scopedTopics: readonly ScopedSnapshotTopic[],
    updatedAt = new Date().toISOString(),
  ): SnapshotAdvanceResult {
    const topics = [...new Set(scopedTopics)];
    if (topics.length === 0) {
      throw new TypeError('Snapshot advance requires at least one scoped topic.');
    }
    for (const topic of topics) assertScopedTopic(topic);
    if (updatedAt.trim().length === 0) throw new TypeError('Snapshot timestamp is required.');

    const ensure = this.database.prepare(`
      INSERT INTO snapshot_versions (topic, version, updated_at)
      VALUES (?, 0, ?)
      ON CONFLICT(topic) DO NOTHING
    `);
    ensure.run('global', updatedAt);
    for (const topic of topics) ensure.run(topic, updatedAt);

    const increment = this.database.prepare(`
      UPDATE snapshot_versions
      SET version = version + 1, updated_at = ?
      WHERE topic = ?
    `);
    for (const topic of topics) increment.run(updatedAt, topic);
    increment.run(updatedAt, 'global');

    const topicVersions = Object.fromEntries(
      topics.map((topic) => [topic, this.read(topic).version]),
    ) as Record<ScopedSnapshotTopic, number>;
    return {
      globalVersion: this.read('global').version,
      topicVersions,
    };
  }
}

function assertScopedTopic(topic: string): asserts topic is ScopedSnapshotTopic {
  if (!/^(learning|classroom):[^\s:][^\s]*$/.test(topic)) {
    throw new TypeError(`Invalid scoped snapshot topic: ${topic}`);
  }
}
