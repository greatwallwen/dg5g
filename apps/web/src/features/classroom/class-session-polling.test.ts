import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const sourceUrl = new URL('./class-session-polling.ts', import.meta.url);

async function loadPolling(): Promise<any> {
  assert.equal(existsSync(sourceUrl), true, 'class session polling policy must exist');
  return import(sourceUrl.href);
}

test('selects 1s active and 10s passive tiers without magic per-screen intervals', async () => {
  const polling = await loadPolling();
  assert.equal(polling.pollIntervalFor('active'), 1000);
  assert.equal(polling.pollIntervalFor('passive'), 10000);
  assert.equal(polling.resolvePollTier({ role: 'teacher', visible: true, online: true }), 'active');
  assert.equal(polling.resolvePollTier({ role: 'projector', visible: false, online: true }), 'passive');
  assert.equal(polling.resolvePollTier({ role: 'student', visible: true, online: true, participationMode: 'follow' }), 'active');
  assert.equal(polling.resolvePollTier({ role: 'student', visible: true, online: true, participationMode: 'self' }), 'passive');
  assert.equal(polling.resolvePollTier({ role: 'student', visible: true, online: false, participationMode: 'follow' }), 'passive');
  assert.equal(polling.resolvePollTier({ role: 'student', visible: true, online: true, participationMode: 'follow', sessionStatus: 'paused' }), 'passive');
  assert.equal(polling.resolvePollTier({ role: 'teacher', visible: true, online: true, sessionStatus: 'closed' }), 'passive');
});

test('classifies stale, equal, and newer revisions without allowing shared-scene rollback', async () => {
  const polling = await loadPolling();
  assert.equal(polling.classifyRevision(4, 3), 'stale');
  assert.equal(polling.classifyRevision(4, 4), 'equal');
  assert.equal(polling.classifyRevision(4, 5), 'newer');
});

test('schedules after completion, never overlaps, and can refresh immediately', async () => {
  const polling = await loadPolling();
  const clock = new ManualClock();
  let calls = 0;
  let finish: (() => void) | undefined;
  const poller = polling.createClassSessionPoller({
    clock,
    getTier: () => 'active',
    poll: () => {
      calls += 1;
      return new Promise<void>((resolve) => { finish = resolve; });
    },
  });

  poller.start();
  assert.equal(calls, 1, 'start refreshes immediately');
  clock.advance(5000);
  assert.equal(calls, 1, 'in-flight request cannot re-enter');
  finish?.();
  await Promise.resolve();
  clock.advance(999);
  assert.equal(calls, 1);
  clock.advance(1);
  assert.equal(calls, 2);

  finish?.();
  await Promise.resolve();
  poller.refreshNow();
  assert.equal(calls, 3, 'visibility or broadcast refresh bypasses the timer');
  finish?.();
  await Promise.resolve();
  poller.stop();
  clock.advance(20000);
  assert.equal(calls, 3, 'stop cancels future work');
});

test('coalesces repeated wakes during one in-flight request into one follow-up', async () => {
  const polling = await loadPolling();
  const clock = new ManualClock();
  let calls = 0;
  const completions: Array<() => void> = [];
  const poller = polling.createClassSessionPoller({
    clock,
    getTier: () => 'active',
    poll: () => {
      calls += 1;
      return new Promise<void>((resolve) => completions.push(resolve));
    },
  });

  poller.start();
  poller.refreshNow();
  poller.refreshNow();
  poller.refreshNow();
  assert.equal(calls, 1, 'wakes cannot overlap the active request');

  completions.shift()?.();
  await settleAsyncWork();
  assert.equal(calls, 2, 'all in-flight wakes collapse into one immediate follow-up');

  completions.shift()?.();
  await settleAsyncWork();
  clock.advance(999);
  assert.equal(calls, 2);
  clock.advance(1);
  assert.equal(calls, 3, 'normal completion scheduling resumes after the follow-up');
  poller.stop();
});

test('uses the 10s passive tier for hidden, offline, self, paused, and closed states', async () => {
  const polling = await loadPolling();
  const passiveInputs = [
    { role: 'teacher', visible: false, online: true },
    { role: 'projector', visible: true, online: false },
    { role: 'student', visible: true, online: true, participationMode: 'self' },
    { role: 'teacher', visible: true, online: true, sessionStatus: 'paused' },
    { role: 'teacher', visible: true, online: true, sessionStatus: 'closed' },
  ];
  for (const context of passiveInputs) {
    assert.equal(polling.resolvePollTier(context), 'passive');
  }

  const clock = new ManualClock();
  let calls = 0;
  const poller = polling.createClassSessionPoller({
    clock,
    getTier: () => 'passive',
    poll: async () => { calls += 1; },
  });
  poller.start();
  await settleAsyncWork();
  clock.advance(9999);
  assert.equal(calls, 1);
  clock.advance(1);
  assert.equal(calls, 2);
  poller.stop();
});

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class ManualClock {
  #now = 0;
  #nextId = 1;
  #timers = new Map<number, { at: number; run: () => void }>();

  setTimeout = (run: () => void, delay: number): number => {
    const id = this.#nextId++;
    this.#timers.set(id, { at: this.#now + delay, run });
    return id;
  };

  clearTimeout = (id: number): void => { this.#timers.delete(id); };

  advance(ms: number): void {
    const target = this.#now + ms;
    while (true) {
      const due = [...this.#timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      this.#now = due[1].at;
      this.#timers.delete(due[0]);
      due[1].run();
    }
    this.#now = target;
  }
}
