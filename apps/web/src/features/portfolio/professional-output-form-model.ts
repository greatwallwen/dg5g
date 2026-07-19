import type { ProfessionalOutputEnvelope } from '@/platform/learning-command-service';
import type {
  ProfessionalOutputAggregate,
  ProfessionalOutputFieldSource,
  ProfessionalOutputStatus,
  ProfessionalOutputUpstreamRef,
} from '@/platform/professional-output-repository';
import type { EvidenceDefinition } from './evidence-library';
import type { ProfessionalOutputFields, ProfessionalOutputSchema } from './output-schema';
import {
  projectOutputWorkflow,
  type OutputWorkflowProjection,
  type OutputWorkflowState,
} from './output-workflow-state';

export interface ProfessionalOutputFormState {
  fields: ProfessionalOutputFields;
  evidenceLinks: Record<string, string[]>;
  fieldSources: ProfessionalOutputFieldSource[];
  evidenceLibrary: EvidenceDefinition[];
  outputId?: string;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
  workflow: OutputWorkflowProjection;
  readOnly: boolean;
  teacherFeedback?: string;
}

export interface ProfessionalOutputClientCommand {
  outputId?: string;
  expectedStateRevision: number;
  fields: ProfessionalOutputFields;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  evidenceLinks: Record<string, string[]>;
}

export type ProfessionalOutputFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class ProfessionalOutputRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ProfessionalOutputRequestError';
  }
}

export function createProfessionalOutputClient(
  taskId: ProfessionalOutputSchema['taskId'],
  request: ProfessionalOutputFetch = (input, init) => fetch(input, init),
) {
  const base = `/api/outputs/${taskId}`;
  return {
    read: () => requestJson<ProfessionalOutputEnvelope>(request, base, { cache: 'no-store' }),
    saveDraft: (command: ProfessionalOutputClientCommand) => requestJson<ProfessionalOutputAggregate>(
      request, `${base}/draft`, jsonPost(command),
    ),
    submit: (command: ProfessionalOutputClientCommand) => requestJson<ProfessionalOutputAggregate>(
      request, `${base}/submit`, jsonPost(command),
    ),
  };
}

export function projectProfessionalOutputFormState(
  schema: ProfessionalOutputSchema,
  envelope: ProfessionalOutputEnvelope | null | undefined,
): ProfessionalOutputFormState {
  const output = envelope?.output ?? null;
  const allowedKeys = new Set(schema.fields.map(({ key }) => key));
  const fields: ProfessionalOutputFields = {};
  const projectedSources: ProfessionalOutputFieldSource[] = [];
  for (const [fieldKey, field] of Object.entries(envelope?.prefill ?? {})) {
    if (!allowedKeys.has(fieldKey) || !field) continue;
    fields[fieldKey] = field.value;
    for (const source of field.sources) projectedSources.push({ fieldKey, ...source });
  }
  const current = output?.versions.find(({ version }) => version === output.head.currentVersion);
  for (const [key, value] of Object.entries(current?.fields ?? {})) {
    if (allowedKeys.has(key)) fields[key] = value;
  }
  const workflow = output
    ? projectOutputWorkflow(output)
    : { state: 'editing', label: '编辑中' } as const;
  const returnedFeedback = [...(output?.reviewHistory ?? [])]
    .reverse()
    .find(({ status, feedback }) => status === 'returned' && feedback)?.feedback;
  return {
    fields,
    evidenceLinks: filterEvidenceLinks(current?.evidenceLinks ?? {}, allowedKeys),
    fieldSources: normalizeFieldSources([
      ...projectedSources,
      ...(current?.fieldSources ?? []).filter(({ fieldKey }) => allowedKeys.has(fieldKey)),
    ]),
    evidenceLibrary: envelope?.evidenceLibrary ?? [],
    ...(output ? { outputId: output.head.outputId } : {}),
    currentVersion: output?.head.currentVersion ?? 0,
    stateRevision: output?.head.stateRevision ?? 0,
    status: output?.head.status ?? 'draft',
    workflow,
    readOnly: output?.head.status === 'submitted' || output?.head.status === 'verified',
    ...(returnedFeedback ? { teacherFeedback: returnedFeedback } : {}),
  };
}

export function reviseProfessionalOutputField(
  state: ProfessionalOutputFormState,
  key: string,
  value: string,
): ProfessionalOutputFormState {
  if (state.readOnly || state.fields[key] === value) return state;
  return markLocallyRevising({ ...state, fields: { ...state.fields, [key]: value } });
}

export function reviseProfessionalOutputEvidence(
  state: ProfessionalOutputFormState,
  fieldKey: string,
  evidenceIds: string[],
): ProfessionalOutputFormState {
  if (state.readOnly) return state;
  const normalized = [...new Set(evidenceIds)].sort();
  const current = state.evidenceLinks[fieldKey] ?? [];
  if (current.length === normalized.length && current.every((id, index) => id === normalized[index])) {
    return state;
  }
  return markLocallyRevising({
    ...state,
    evidenceLinks: { ...state.evidenceLinks, [fieldKey]: normalized },
  });
}

export async function loadUpstreamReference(
  taskId: ProfessionalOutputSchema['taskId'],
): Promise<ProfessionalOutputUpstreamRef[]> {
  const upstreamTaskId = ({ P02: 'P01', P03: 'P02' } as const)[taskId as 'P02' | 'P03'];
  if (!upstreamTaskId) return [];
  const { output } = await createProfessionalOutputClient(upstreamTaskId).read();
  return output ? [{ outputId: output.head.outputId, version: output.head.currentVersion }] : [];
}

export function professionalOutputStatusCopy(
  state: OutputWorkflowState,
  taskId: ProfessionalOutputSchema['taskId'],
) {
  if (state === 'submitted') return { title: '已提交 · 等待教师复核', description: '当前版本已锁定；教师退回后才能继续修订。' };
  if (state === 'returned') return { title: '教师退回 · 等待实质修订', description: '历史版本保持不变；修改字段或证据后才能再次提交。' };
  if (state === 'revising') return { title: '修订中 · 正在补齐证据', description: '本次修改将形成新版本，原退回版本仍可追溯。' };
  if (state === 'resubmitted') return { title: '再次提交 · 等待教师复核', description: '修订版本已锁定并重新进入教师复核队列。' };
  if (state === 'verified') return { title: '教师确认 · 成果已认证', description: '当前职业成果已由教师确认并进入项目成果包。' };
  return editingStatusCopy[taskId];
}

const editingStatusCopy: Record<ProfessionalOutputSchema['taskId'], { title: string; description: string }> = {
  P01: {
    title: '编辑中 · 室内设备与链路证据表',
    description: '核对活动预填，挂接可回查证据，完成十项职业字段。',
  },
  P02: {
    title: '编辑中 · 室外站点与覆盖采集表',
    description: '核对扇区、方位、下倾、挂高与覆盖边界，挂接可回查证据后形成岗位成果。',
  },
  P03: {
    title: '编辑中 · 投诉信息调查单',
    description: '核对投诉时间、地点、业务与终端复现条件，关联多源证据后形成调查记录。',
  },
};

export function professionalOutputErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '专业产出请求失败，请稍后重试。';
}

async function requestJson<T>(request: ProfessionalOutputFetch, input: string, init?: RequestInit) {
  const response = await request(input, init);
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Professional output request failed (${response.status}).`;
    throw new ProfessionalOutputRequestError(response.status, message);
  }
  return body as T;
}

function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function markLocallyRevising(state: ProfessionalOutputFormState): ProfessionalOutputFormState {
  return state.workflow.state === 'returned'
    ? { ...state, workflow: { ...state.workflow, state: 'revising', label: '修订中' } }
    : state;
}

function filterEvidenceLinks(links: Record<string, string[]>, allowedKeys: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(links)
    .filter(([fieldKey]) => allowedKeys.has(fieldKey))
    .map(([fieldKey, ids]) => [fieldKey, [...new Set(ids)].sort()]));
}

function normalizeFieldSources(sources: ProfessionalOutputFieldSource[]) {
  const unique = new Map(sources.map((source) => [
    `${source.fieldKey}\u0000${source.sourceNodeId}\u0000${source.sourceAttemptId}`,
    source,
  ]));
  return [...unique.values()].sort((left, right) => (
    left.fieldKey.localeCompare(right.fieldKey)
    || left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.sourceAttemptId.localeCompare(right.sourceAttemptId)
  ));
}
