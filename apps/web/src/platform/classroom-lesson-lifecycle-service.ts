import type { AppDatabase } from './db/database.ts';
import {
  ClassroomLessonRunConflictError,
  ClassroomLessonRunRepository,
  type LessonRunTransitionContext,
  type StoredClassroomLessonRun,
} from './classroom-lesson-run-repository.ts';

export type LessonLifecycleCommand =
  | { type: 'start'; expectedRevision: number }
  | { type: 'pause'; expectedRevision: number }
  | { type: 'resume'; expectedRevision: number }
  | { type: 'close'; expectedRevision: number; collectAssessment: boolean };

export class ClassroomLessonLifecycleConflictError extends Error {
  override readonly name = 'ClassroomLessonLifecycleConflictError';
}

export interface ClassroomAssessmentRunToCollect {
  runId: string;
  status: 'running' | 'paused' | 'reviewing';
  revision: number;
}

export interface ClassroomAssessmentCollectionContext {
  database: AppDatabase;
  lessonRun: StoredClassroomLessonRun;
  assessmentRun: ClassroomAssessmentRunToCollect;
  at: string;
}

export type ClassroomAssessmentCollector = (
  context: ClassroomAssessmentCollectionContext,
) => void;

export class ClassroomLessonLifecycleService {
  constructor(
    private readonly repository: ClassroomLessonRunRepository,
    private readonly collectAssessment: ClassroomAssessmentCollector = collectRelationalAssessment,
  ) {}

  execute(
    input: {
      sessionId: string;
      lessonRunId: string;
      command: LessonLifecycleCommand;
    },
    now = new Date(),
  ) {
    const run = this.repository.readLessonRun(input.lessonRunId);
    if (run?.status === 'closed') {
      throw new ClassroomLessonLifecycleConflictError('Closed lesson runs are immutable.');
    }
    const nextStatus = statusFor(input.command);
    const beforeClose = input.command.type === 'close'
      ? (context: LessonRunTransitionContext) => this.beforeClose(context, input.command.type === 'close' && input.command.collectAssessment)
      : undefined;
    try {
      return this.repository.transitionLessonRun(
        {
          sessionId: input.sessionId,
          lessonRunId: input.lessonRunId,
          expectedRevision: input.command.expectedRevision,
          nextStatus,
        },
        now,
        beforeClose,
      );
    } catch (error) {
      if (error instanceof ClassroomLessonRunConflictError) {
        throw new ClassroomLessonLifecycleConflictError(error.message);
      }
      throw error;
    }
  }

  private beforeClose(context: LessonRunTransitionContext, collectAssessment: boolean): void {
    const assessmentRun = context.database.prepare(`
      SELECT run_id AS runId, status, revision
      FROM classroom_assessment_runs
      WHERE lesson_run_id = ? AND session_id = ?
        AND status IN ('running', 'paused', 'reviewing')
      ORDER BY julianday(started_at) DESC, run_id DESC
      LIMIT 1
    `).get(
      context.run.lessonRunId,
      context.run.sessionId,
    ) as ClassroomAssessmentRunToCollect | undefined;
    if (!assessmentRun) return;
    if (!collectAssessment) {
      throw new ClassroomLessonLifecycleConflictError(
        'Collect the running assessment before closing this lesson.',
      );
    }
    this.collectAssessment({
      database: context.database,
      lessonRun: context.run,
      assessmentRun,
      at: context.at,
    });
  }
}

function statusFor(command: LessonLifecycleCommand) {
  if (command.type === 'start' || command.type === 'resume') return 'active' as const;
  if (command.type === 'pause') return 'paused' as const;
  return 'closed' as const;
}

function collectRelationalAssessment(context: ClassroomAssessmentCollectionContext): void {
  const assessment = context.database.prepare(`
    UPDATE classroom_assessment_runs
    SET status = 'closed', closed_at = ?, closed_reason = 'teacher-collected',
      remaining_seconds_when_paused = NULL, revision = revision + 1
    WHERE run_id = ? AND lesson_run_id = ? AND session_id = ? AND revision = ?
      AND status IN ('running', 'paused', 'reviewing')
  `).run(
    context.at,
    context.assessmentRun.runId,
    context.lessonRun.lessonRunId,
    context.lessonRun.sessionId,
    context.assessmentRun.revision,
  );
  if (assessment.changes !== 1) {
    throw new ClassroomLessonLifecycleConflictError('Assessment collection revision conflict.');
  }
  context.database.prepare(`
    UPDATE formal_assessment_instances
    SET status = 'closed', closed_at = ?, closure_reason = 'cancelled'
    WHERE session_id = ? AND classroom_run_id = ? AND status = 'running'
  `).run(context.at, context.lessonRun.sessionId, context.assessmentRun.runId);
  context.database.prepare(`
    UPDATE formal_assessment_tokens
    SET used_at = ?
    WHERE used_at IS NULL AND assessment_id IN (
      SELECT assessment_id FROM formal_assessment_instances
      WHERE session_id = ? AND classroom_run_id = ?
    )
  `).run(context.at, context.lessonRun.sessionId, context.assessmentRun.runId);
}
