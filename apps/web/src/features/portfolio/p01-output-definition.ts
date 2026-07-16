import type { ActivityArtifact } from '../learning-activities/activity-definition.ts';
import type { ServerActivityDefinition } from '../learning-activities/activity-rules.ts';

export const p01OutputFieldKeys = [
  'siteRoom',
  'collectionScope',
  'locationEvidence',
  'deviceIdentity',
  'endpointA',
  'endpointB',
  'connectionDirection',
  'photoIndex',
  'evidenceGap',
  'riskAndReviewConclusion',
] as const;

export type P01OutputFieldKey = typeof p01OutputFieldKeys[number];
export type P01OutputFields = Record<P01OutputFieldKey, string>;

export const p01OutputFieldDefinitions: Array<{ key: P01OutputFieldKey; label: string }> = [
  { key: 'siteRoom', label: '站点与机房位置证据' },
  { key: 'collectionScope', label: '采集范围与排除对象' },
  { key: 'locationEvidence', label: '设备位置证据' },
  { key: 'deviceIdentity', label: '设备身份与铭牌证据' },
  { key: 'endpointA', label: '链路本端设备与端口' },
  { key: 'endpointB', label: '链路对端设备与端口' },
  { key: 'connectionDirection', label: '连接方向与中间路径' },
  { key: 'photoIndex', label: '照片与证据索引' },
  { key: 'evidenceGap', label: '证据缺口与补采动作' },
  { key: 'riskAndReviewConclusion', label: '风险与复核结论' },
];

export interface P01OutputFieldSource {
  fieldKey: P01OutputFieldKey;
  sourceNodeId: string;
  sourceAttemptId: string;
}

export interface P01OutputPrefillField {
  value: string;
  sources: Array<Omit<P01OutputFieldSource, 'fieldKey'>>;
}

export type P01OutputPrefill = Partial<Record<P01OutputFieldKey, P01OutputPrefillField>>;

export interface P01ActivityAttemptFact {
  attemptId: string;
  studentId: string;
  activityId: string;
  nodeId: string;
  passed: boolean;
  origin: 'demo' | 'user';
  attemptedAt: string;
  artifact: ActivityArtifact;
}

export interface PersistedP01Draft {
  fields: Partial<Record<P01OutputFieldKey, string>>;
  fieldSources: P01OutputFieldSource[];
}

const p01OutputFieldKeySet = new Set<string>(p01OutputFieldKeys);
const sourceNodes = new Set(['P1T1-N01', 'P1T1-N02', 'P1T1-N03']);

export function isP01OutputFieldKey(value: string): value is P01OutputFieldKey {
  return p01OutputFieldKeySet.has(value);
}

export function projectP01OutputPrefill(
  attempts: readonly P01ActivityAttemptFact[],
  activityCatalog: readonly ServerActivityDefinition[],
): P01OutputPrefill {
  const catalog = new Map(activityCatalog.map((definition) => [definition.activity.id, definition]));
  const selected = selectLatestPassedAttempts(attempts, catalog);
  const result: P01OutputPrefill = {};

  for (const attempt of selected) {
    const definition = catalog.get(attempt.activityId)!;
    const response = attempt.artifact.response;
    const source = { sourceNodeId: attempt.nodeId, sourceAttemptId: attempt.attemptId };
    const materialById = new Map(definition.activity.materials.map((material) => [material.id, material]));

    switch (definition.activity.kind) {
      case 'scope-classification': {
        const assignments = stringMap(response.assignments);
        if (!assignments) break;
        const included = materialDescriptions(assignments, 'in-scope', materialById);
        const excluded = materialDescriptions(assignments, 'out-of-scope', materialById);
        if (included.length > 0) appendProjected(result, 'siteRoom', included.join('；'), source);
        if (included.length > 0 || excluded.length > 0) {
          appendProjected(
            result,
            'collectionScope',
            `纳入：${included.join('；') || '无'}；排除：${excluded.join('；') || '无'}`,
            source,
          );
        }
        break;
      }
      case 'evidence-classification': {
        const assignments = stringMap(response.assignments);
        if (!assignments) break;
        const photoEntries: string[] = [];
        for (const [materialId, category] of Object.entries(assignments)) {
          const material = materialById.get(materialId);
          if (!material) continue;
          const description = `${material.label}（${material.detail}）`;
          if (category === 'location') appendProjected(result, 'locationEvidence', description, source);
          if (category === 'identity') appendProjected(result, 'deviceIdentity', description, source);
          if (category === 'link') appendProjected(result, 'connectionDirection', description, source);
          photoEntries.push(`${category}：${materialId}`);
        }
        if (photoEntries.length > 0) appendProjected(result, 'photoIndex', photoEntries.join('；'), source);
        break;
      }
      case 'link-reconstruction': {
        const order = stringArray(response.order);
        if (!order) break;
        const labels = order.map((id) => materialById.get(id)?.label).filter(isString);
        if (labels.length === order.length) {
          appendProjected(result, 'connectionDirection', labels.join(' → '), source);
        }
        break;
      }
      case 'structured-record': {
        const fields = stringMap(response.fields);
        if (!fields) break;
        const siteId = fields.siteId;
        const roomId = fields.roomId;
        const cabinetId = fields.cabinetId;
        if (siteId && roomId && cabinetId) {
          appendProjected(result, 'siteRoom', `${siteId} / ${roomId}号机房 / ${cabinetId}`, source);
          appendProjected(
            result,
            'locationEvidence',
            `站点 ${siteId}、${roomId}号机房、${cabinetId} 机柜三项位置标识一致`,
            source,
          );
        }
        if (fields.deviceId) appendProjected(result, 'deviceIdentity', fields.deviceId, source);
        if (fields.nearPort) appendProjected(result, 'endpointA', fields.nearPort, source);
        if (fields.farPort) appendProjected(result, 'endpointB', fields.farPort, source);
        break;
      }
      case 'four-state-judgement': {
        const states = stringMap(response.states);
        if (!states) break;
        const categoryLabels = new Map(
          definition.activity.interaction.type === 'state-matrix'
            ? definition.activity.interaction.categories.map(({ id, label }) => [id, label])
            : [],
        );
        const confirmed: string[] = [];
        const missing: string[] = [];
        const conflicting: string[] = [];
        const other: string[] = [];
        for (const [materialId, state] of Object.entries(states)) {
          const material = materialById.get(materialId);
          if (!material) continue;
          const entry = `${material.label}：${categoryLabels.get(state) ?? state}（${material.detail}）`;
          if (state === 'confirmed') confirmed.push(entry);
          else if (state === 'missing') missing.push(entry);
          else if (state === 'conflicting') conflicting.push(entry);
          else other.push(entry);
        }
        const gaps = [...missing, ...conflicting, ...other];
        if (gaps.length > 0) appendProjected(result, 'evidenceGap', gaps.join('；'), source);
        const conclusionParts = [
          confirmed.length > 0 ? `已确认：${confirmed.join('；')}` : undefined,
          missing.length > 0 ? `缺证：${missing.join('；')}` : undefined,
          conflicting.length > 0 ? `冲突：${conflicting.join('；')}` : undefined,
          other.length > 0 ? `待复核：${other.join('；')}` : undefined,
        ].filter(isString);
        if (conclusionParts.length > 0) {
          appendProjected(
            result,
            'riskAndReviewConclusion',
            `${conclusionParts.join('；')}；须补采或消除冲突后再形成正常性结论`,
            source,
          );
        }
        break;
      }
      case 'defective-sheet-revision':
        break;
    }
  }

  return sortPrefillSources(result);
}

export function mergePrefillWithPersistedDraft(
  prefill: P01OutputPrefill,
  persisted: PersistedP01Draft,
): P01OutputPrefill {
  const merged: P01OutputPrefill = Object.fromEntries(Object.entries(prefill).map(([fieldKey, field]) => [
    fieldKey,
    { value: field.value, sources: [...field.sources] },
  ])) as P01OutputPrefill;

  for (const source of persisted.fieldSources) {
    if (!isP01OutputFieldKey(source.fieldKey)) continue;
    const field = merged[source.fieldKey] ?? { value: persisted.fields[source.fieldKey] ?? '', sources: [] };
    field.sources = uniqueSources([
      ...field.sources,
      { sourceNodeId: source.sourceNodeId, sourceAttemptId: source.sourceAttemptId },
    ]);
    merged[source.fieldKey] = field;
  }
  for (const [fieldKey, value] of Object.entries(persisted.fields)) {
    if (!isP01OutputFieldKey(fieldKey) || typeof value !== 'string') continue;
    const field = merged[fieldKey] ?? { value, sources: [] };
    field.value = value;
    merged[fieldKey] = field;
  }
  return sortPrefillSources(merged);
}

function selectLatestPassedAttempts(
  attempts: readonly P01ActivityAttemptFact[],
  catalog: ReadonlyMap<string, ServerActivityDefinition>,
): P01ActivityAttemptFact[] {
  const selected = new Map<string, P01ActivityAttemptFact>();
  for (const attempt of attempts) {
    const definition = catalog.get(attempt.activityId);
    if (!attempt.passed || !sourceNodes.has(attempt.nodeId) || !definition) continue;
    const artifact = attempt.artifact;
    if (artifact.type !== 'learning-activity-artifact'
      || artifact.activityId !== attempt.activityId
      || artifact.nodeId !== attempt.nodeId
      || artifact.kind !== definition.activity.kind
      || definition.activity.nodeId !== attempt.nodeId
      || !isRecord(artifact.response)) continue;
    const current = selected.get(attempt.activityId);
    if (!current || compareAttemptPriority(attempt, current) > 0) {
      selected.set(attempt.activityId, attempt);
    }
  }
  return [...selected.values()].sort((left, right) => left.activityId.localeCompare(right.activityId));
}

function compareAttemptPriority(left: P01ActivityAttemptFact, right: P01ActivityAttemptFact): number {
  const origin = Number(left.origin === 'user') - Number(right.origin === 'user');
  if (origin !== 0) return origin;
  const leftTime = Date.parse(left.attemptedAt);
  const rightTime = Date.parse(right.attemptedAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  const attemptedAt = left.attemptedAt.localeCompare(right.attemptedAt);
  return attemptedAt !== 0 ? attemptedAt : left.attemptId.localeCompare(right.attemptId);
}

function appendProjected(
  result: P01OutputPrefill,
  fieldKey: P01OutputFieldKey,
  value: string,
  source: Omit<P01OutputFieldSource, 'fieldKey'>,
): void {
  const normalized = value.trim();
  if (!normalized) return;
  const current = result[fieldKey];
  result[fieldKey] = {
    value: current && current.value !== normalized
      ? `${current.value}；${normalized}`
      : normalized,
    sources: uniqueSources([...(current?.sources ?? []), source]),
  };
}

function materialDescriptions(
  assignments: Record<string, string>,
  category: string,
  materialById: ReadonlyMap<string, { label: string; detail: string }>,
): string[] {
  return Object.entries(assignments)
    .filter(([, assigned]) => assigned === category)
    .map(([materialId]) => materialById.get(materialId))
    .filter((material): material is { label: string; detail: string } => material !== undefined)
    .map(({ label, detail }) => `${label}（${detail}）`);
}

function sortPrefillSources(prefill: P01OutputPrefill): P01OutputPrefill {
  for (const field of Object.values(prefill)) field.sources = uniqueSources(field.sources);
  return prefill;
}

function uniqueSources(
  sources: Array<Omit<P01OutputFieldSource, 'fieldKey'>>,
): Array<Omit<P01OutputFieldSource, 'fieldKey'>> {
  const byIdentity = new Map(sources.map((source) => [
    `${source.sourceNodeId}\u0000${source.sourceAttemptId}`,
    source,
  ]));
  return [...byIdentity.values()].sort((left, right) => (
    left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.sourceAttemptId.localeCompare(right.sourceAttemptId)
  ));
}

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'string')) return undefined;
  return value as Record<string, string>;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: string | undefined): value is string {
  return value !== undefined;
}
