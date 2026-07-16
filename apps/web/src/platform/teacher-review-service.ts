export interface TeacherReviewActor {
  userId: string;
  role: 'student' | 'teacher';
  classIds: string[];
}

export interface ReviewableProfessionalOutput {
  outputId: string;
  studentId: string;
  classId: string;
  nodeId: string;
  version: number;
  status: 'draft' | 'submitted' | 'returned' | 'verified';
}

export type TeacherReviewAction =
  | { type: 'return'; feedback: string }
  | { type: 'verify'; score: number };

export interface TeacherReviewCommand {
  actor: TeacherReviewActor;
  outputId: string;
  expectedVersion: number;
  action: TeacherReviewAction;
}

export interface AuthorizedTeacherReview {
  outputId: string;
  studentId: string;
  classId: string;
  nodeId: string;
  outputVersion: number;
  teacherId: string;
  action: TeacherReviewAction;
}

export interface TeacherReviewRepository<Result = unknown> {
  findCurrentOutput(outputId: string): Promise<ReviewableProfessionalOutput | undefined>;
  appendReview(command: AuthorizedTeacherReview): Promise<Result>;
}

export class TeacherReviewAuthorizationError extends Error {
  constructor(message = 'Teacher review authorization failed') {
    super(message);
    this.name = 'TeacherReviewAuthorizationError';
  }
}

export async function reviewProfessionalOutput<Result>(
  command: TeacherReviewCommand,
  repository: TeacherReviewRepository<Result>,
): Promise<Result> {
  if (command.actor.role !== 'teacher') throw new TeacherReviewAuthorizationError();

  const output = await repository.findCurrentOutput(command.outputId);
  if (!output) throw new TeacherReviewAuthorizationError('Review target is unavailable');
  if (!command.actor.classIds.includes(output.classId)) {
    throw new TeacherReviewAuthorizationError('Teacher is outside the output class scope');
  }
  const policy = getNodeLearningPolicy(output.nodeId);
  if (!policy?.requiresProfessionalOutput || !policy.requiresTeacherVerification) {
    throw new TeacherReviewAuthorizationError('Node policy does not permit teacher review');
  }
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion !== output.version) {
    throw new TeacherReviewAuthorizationError('Output version is stale');
  }
  if (output.status !== 'submitted') {
    throw new TeacherReviewAuthorizationError('Only the current submitted output can be reviewed');
  }
  if (command.action.type === 'verify'
    && (!Number.isFinite(command.action.score) || command.action.score < 0 || command.action.score > 100)) {
    throw new TeacherReviewAuthorizationError('Verification score is outside the rubric range');
  }
  if (command.action.type === 'return' && !command.action.feedback.trim()) {
    throw new TeacherReviewAuthorizationError('Return feedback is required');
  }

  return repository.appendReview({
    outputId: output.outputId,
    studentId: output.studentId,
    classId: output.classId,
    nodeId: output.nodeId,
    outputVersion: output.version,
    teacherId: command.actor.userId,
    action: command.action,
  });
}
import { getNodeLearningPolicy } from './learning-policy';
