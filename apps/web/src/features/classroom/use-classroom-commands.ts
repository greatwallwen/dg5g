'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassroomAssessmentCommand } from '@/platform/classroom-assessment-run-service.ts';
import type { ClassroomLessonIntent } from '@/platform/classroom-state.ts';
import {
  createClassroomCommandRunner,
  type ClassroomCommandAuthority,
  type ClassroomCommandRunner,
} from './classroom-command-client.ts';

export interface ClassroomCommandState {
  busy: boolean;
  error?: string;
  submitLessonIntent(intent: ClassroomLessonIntent): Promise<boolean>;
  submitAssessment(command: ClassroomAssessmentCommand): Promise<boolean>;
  submitLessonLifecycle(
    command: { type: 'start' | 'pause' | 'resume' } | { type: 'close'; collectAssessment: boolean },
  ): Promise<boolean>;
}

export function useClassroomCommands(
  authority: ClassroomCommandAuthority,
  refreshNow: () => void,
): ClassroomCommandState {
  const runnerRef = useRef<ClassroomCommandRunner>();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [awaitingCut, setAwaitingCut] = useState(false);
  const [error, setError] = useState<string>();
  if (!runnerRef.current) {
    runnerRef.current = createClassroomCommandRunner({ authority, refreshNow });
  }
  useEffect(() => {
    runnerRef.current?.synchronizeAuthority(authority);
    setAwaitingCut(runnerRef.current?.isAwaitingAuthoritativeCut() ?? false);
  }, [authority]);

  const execute = useCallback(async (
    operation: (runner: ClassroomCommandRunner) => Promise<boolean>,
  ) => {
    const runner = runnerRef.current;
    if (!runner || busyRef.current || runner.isAwaitingAuthoritativeCut()) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const accepted = await operation(runner);
      setError(runner.lastError());
      setAwaitingCut(runner.isAwaitingAuthoritativeCut());
      return accepted;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return {
    busy: busy || awaitingCut,
    ...(error ? { error } : {}),
    submitLessonIntent: (intent) => execute((runner) => runner.submitLessonIntent(intent)),
    submitAssessment: (command) => execute((runner) => runner.submitAssessment(command)),
    submitLessonLifecycle: (command) => execute((runner) => runner.submitLessonLifecycle(command)),
  };
}
