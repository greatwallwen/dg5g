import type { AuthoritativeSnapshot } from '../../platform/authoritative-snapshot.ts';

export interface AuthoritativeDomFacts {
  snapshotVersion: number;
  classroomRevision: number;
  classSize: number;
  formalSubmitted: number;
  formalPassed: number;
}

export function authoritativeDomFacts(snapshot: AuthoritativeSnapshot): AuthoritativeDomFacts {
  return {
    snapshotVersion: snapshot.snapshotVersion,
    classroomRevision: snapshot.classroom.revision,
    classSize: snapshot.membership.classSize,
    formalSubmitted: snapshot.submissions.activeAssessment.submittedCount,
    formalPassed: snapshot.submissions.activeAssessment.passedCount,
  };
}
