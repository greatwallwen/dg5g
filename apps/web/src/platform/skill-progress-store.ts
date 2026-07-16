import type { ProjectMasteryProgress, SkillProgress, TaskMasteryProgress } from './models.ts';
import { getDatabase, type AppDatabase } from './db/database.ts';
import { LearningRepository } from './learning-repository.ts';
import { LearningReadModel } from './learning-read-model.ts';
import { projectStudentLearningSnapshot } from './learning-compatibility-projection.ts';

const P1_TASK_IDS = ['P01', 'P02', 'P03'] as const;
export type ProjectMasteryProjection = Omit<ProjectMasteryProgress, 'provisionalScore'> & { provisionalScore?: number };

export class UnknownLearningNodeError extends Error {
  readonly nodeId: string;

  constructor(nodeId: string) {
    super(`Unknown learning node: ${nodeId}`);
    this.name = 'UnknownLearningNodeError';
    this.nodeId = nodeId;
  }
}

export function getSkillProgressForStudent(
  studentId: string,
  database: AppDatabase = getDatabase(),
): SkillProgress[] {
  return readCompatibilitySnapshot(studentId, database).progress;
}

export function getSkillProgress(
  studentId: string,
  nodeId: string,
  database: AppDatabase = getDatabase(),
): SkillProgress {
  const progress = getSkillProgressForStudent(studentId, database).find((item) => item.nodeId === nodeId);
  if (!progress) throw new UnknownLearningNodeError(nodeId);
  return progress;
}

export function getTaskMasteryForStudent(
  studentId: string,
  database: AppDatabase = getDatabase(),
): TaskMasteryProgress[] {
  return readCompatibilitySnapshot(studentId, database).tasks;
}

export function getProjectMasteryForStudent(
  studentId: string,
  database: AppDatabase = getDatabase(),
): ProjectMasteryProjection {
  const snapshot = readCompatibilitySnapshot(studentId, database);
  const completedTaskIds = snapshot.tasks
    .filter((task) => task.state === 'verified')
    .map((task) => task.taskId)
    .filter(isP1TaskId);
  const taskScores = snapshot.tasks.flatMap((task) => {
    if (!isP1TaskId(task.taskId) || task.provisionalScore === undefined) return [];
    return [{
      taskId: task.taskId,
      provisionalScore: task.provisionalScore,
      ...(task.officialScore === undefined ? {} : { officialScore: task.officialScore }),
    }];
  });
  const officialScore = completedTaskIds.length === P1_TASK_IDS.length
    ? snapshot.projectCompositeScore
    : undefined;
  return {
    studentId,
    projectId: 'P1',
    taskIds: [...P1_TASK_IDS],
    completedTaskIds,
    taskScores,
    ...(snapshot.projectCompositeScore === undefined ? {} : { provisionalScore: snapshot.projectCompositeScore }),
    ...(officialScore === undefined ? {} : { officialScore }),
    state: officialScore !== undefined
      ? 'completed'
      : snapshot.tasks.some((task) => task.evidenceSubmitted) ? 'awaiting-review' : 'learning',
    outcomeTitle: '5G网络信息采集成果包',
  };
}

function readCompatibilitySnapshot(studentId: string, database: AppDatabase) {
  const readModel = new LearningReadModel(new LearningRepository(database));
  return projectStudentLearningSnapshot(readModel.readStudentSnapshot(studentId));
}

function isP1TaskId(value: string): value is typeof P1_TASK_IDS[number] {
  return P1_TASK_IDS.some((taskId) => taskId === value);
}
