import type {
  AssessmentDraftAnswers,
  AssessmentDraftDto,
} from '@/platform/formal-assessment-contract';

interface AssessmentDraftSaverOptions {
  nodeId: string;
  attemptToken: string;
  isCurrent: () => boolean;
  onExpired: () => void;
  onSaved: (draft: AssessmentDraftDto) => void;
}

export function createAssessmentDraftSaver(options: AssessmentDraftSaverOptions) {
  return async (
    answers: AssessmentDraftAnswers,
    expectedRevision: number,
  ): Promise<{ revision: number; retry?: boolean }> => {
    const response = await fetch(
      `/api/learning/nodes/${encodeURIComponent(options.nodeId)}/assessment`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-assessment-token': options.attemptToken,
        },
        body: JSON.stringify({ answers, expectedRevision }),
      },
    );
    const body = await response.json().catch(() => ({})) as {
      error?: string;
      authoritativeDraft?: AssessmentDraftDto;
    } & Partial<AssessmentDraftDto>;
    if (!options.isCurrent()) return { revision: expectedRevision };
    if (!response.ok) {
      if (response.status === 410) options.onExpired();
      if (response.status === 409
        && body.authoritativeDraft
        && Number.isSafeInteger(body.authoritativeDraft.revision)
        && body.authoritativeDraft.revision >= 0) {
        options.onSaved(body.authoritativeDraft);
        return { revision: body.authoritativeDraft.revision, retry: true };
      }
      throw new Error(body.error ?? `草稿保存失败：${response.status}`);
    }
    const saved = body as AssessmentDraftDto;
    options.onSaved(saved);
    return saved;
  };
}
