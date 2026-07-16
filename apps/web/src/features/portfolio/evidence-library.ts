import type { AppDatabase } from '../../platform/db/database.ts';
import type { P1TaskId } from '../platform/p1-content.ts';
import type { P01OutputFieldKey } from './p01-output-definition.ts';

export type EvidenceKind = 'photo' | 'diagram' | 'document' | 'reading';
export type P01EvidenceKind = EvidenceKind;

export interface EvidenceDefinition<
  TaskId extends P1TaskId = P1TaskId,
  FieldKey extends string = string,
> {
  evidenceId: string;
  taskId: TaskId;
  kind: EvidenceKind;
  title: string;
  assetUrl: string;
  metadata: Record<string, string>;
  origin: 'demo';
  allowedFieldKeys: FieldKey[];
}

export type P01EvidenceDefinition = EvidenceDefinition<'P01', P01OutputFieldKey>;

const topologyAsset = '/media/5g/p01-n02-topology-stage-v1.png';

export const p01EvidenceLibrary: P01EvidenceDefinition[] = [
  {
    evidenceId: 'P01-EV-ROOM-OVERVIEW',
    taskId: 'P01',
    kind: 'photo',
    title: 'HY-01机房与采集环境全景',
    assetUrl: '/media/5g/image29.png',
    metadata: { evidenceType: '位置', annotation: '站点、机房与室内采集环境同框' },
    origin: 'demo',
    allowedFieldKeys: ['siteRoom', 'collectionScope', 'locationEvidence', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-BBU-NAMEPLATE',
    taskId: 'P01',
    kind: 'photo',
    title: 'BBU设备面板与身份标识',
    assetUrl: '/media/5g/image3.png',
    metadata: { evidenceType: '身份', annotation: '设备正面、板卡与端口标识可回查' },
    origin: 'demo',
    allowedFieldKeys: ['deviceIdentity', 'endpointA', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-BBU-LOCAL-END',
    taskId: 'P01',
    kind: 'diagram',
    title: 'BBU本端槽位与端口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '链路本端', annotation: '机柜、BBU槽位3与本端端口' },
    origin: 'demo',
    allowedFieldKeys: ['deviceIdentity', 'endpointA', 'connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-ODF-PATH',
    taskId: 'P01',
    kind: 'diagram',
    title: 'ODF中间路径与跳接关系',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '中间路径', annotation: 'BBU至AAU/RRU的连续走线与中间节点' },
    origin: 'demo',
    allowedFieldKeys: ['connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-AAU-FAR-END',
    taskId: 'P01',
    kind: 'diagram',
    title: 'AAU/RRU对端设备与端口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '链路对端', annotation: '对端设备身份及光口连接' },
    origin: 'demo',
    allowedFieldKeys: ['endpointB', 'connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-POWER-48V',
    taskId: 'P01',
    kind: 'diagram',
    title: '负48伏供电端子与方向',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '供电', annotation: '设备侧至负48伏配电端子的连接方向' },
    origin: 'demo',
    allowedFieldKeys: ['connectionDirection', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-GROUNDING-GAP',
    taskId: 'P01',
    kind: 'diagram',
    title: '保护接地证据缺口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '缺口', annotation: '接地路径需要补拍接地线与接地排标识' },
    origin: 'demo',
    allowedFieldKeys: ['evidenceGap', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-TEMPERATURE-CONFLICT',
    taskId: 'P01',
    kind: 'reading',
    title: '机房温控读数冲突记录',
    assetUrl: '/media/5g/image29.png',
    metadata: { evidenceType: '冲突', annotation: '环境读数与同时间窗告警需联合复核' },
    origin: 'demo',
    allowedFieldKeys: ['evidenceGap', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-SCOPE-REFERENCE',
    taskId: 'P01',
    kind: 'document',
    title: '室内信息采集范围参考',
    assetUrl: '/media/5g/image2.jpeg',
    metadata: { evidenceType: '范围', annotation: '室内环境信息、设备、供电与传输采集范围' },
    origin: 'demo',
    allowedFieldKeys: ['collectionScope', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-CLOSEOUT',
    taskId: 'P01',
    kind: 'diagram',
    title: '柜位同框与接地远端补采关闭证据',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '关闭缺口', annotation: '补采柜位同框及接地远端后，关闭原位置与接地证据缺口' },
    origin: 'demo',
    allowedFieldKeys: ['locationEvidence', 'evidenceGap'],
  },
];

export const p02EvidenceLibrary: EvidenceDefinition<'P02'>[] = [
  {
    evidenceId: 'P02-EV-SECTOR-IDENTITY',
    taskId: 'P02',
    kind: 'photo',
    title: 'AAU外观、接口与扇区身份照片',
    assetUrl: '/media/5g/image54.jpeg',
    metadata: { evidenceType: '扇区身份', annotation: '通过AAU外观与接口编号回查站点、扇区和天线身份' },
    origin: 'demo',
    allowedFieldKeys: ['sectorIdentity'],
  },
  {
    evidenceId: 'P02-EV-AZIMUTH-READING',
    taskId: 'P02',
    kind: 'photo',
    title: '罗盘北向基准与方位角读数',
    assetUrl: '/media/5g/image62.png',
    metadata: { evidenceType: '方位角', annotation: '以北向为基准记录天线主瓣方向，并与道路地标交叉复核' },
    origin: 'demo',
    allowedFieldKeys: ['azimuth'],
  },
  {
    evidenceId: 'P02-EV-TILT-READING',
    taskId: 'P02',
    kind: 'photo',
    title: '坡度仪机械下倾角读数',
    assetUrl: '/media/5g/image30.png',
    metadata: { evidenceType: '下倾角', annotation: '坡度仪测定面、指示针与刻度共同证明机械下倾读数' },
    origin: 'demo',
    allowedFieldKeys: ['tilt'],
  },
  {
    evidenceId: 'P02-EV-HEIGHT-RANGE',
    taskId: 'P02',
    kind: 'document',
    title: '不同环境的天线挂高参考',
    assetUrl: '/media/5g/image55.png',
    metadata: { evidenceType: '挂高', annotation: '以地面与天线参考点为测量基准，结合环境类型复核挂高' },
    origin: 'demo',
    allowedFieldKeys: ['height'],
  },
  {
    evidenceId: 'P02-EV-ENVIRONMENT-SCOPE',
    taskId: 'P02',
    kind: 'document',
    title: '覆盖环境与遮挡范围记录',
    assetUrl: '/media/5g/image56.png',
    metadata: { evidenceType: '环境遮挡', annotation: '记录遮挡体、相对方位和高度关系，界定覆盖环境范围' },
    origin: 'demo',
    allowedFieldKeys: ['environment'],
  },
  {
    evidenceId: 'P02-EV-COVERAGE-CONCLUSION',
    taskId: 'P02',
    kind: 'diagram',
    title: '室外站点勘察覆盖模型证据底图',
    assetUrl: '/media/manim/p02/p02-outdoor-site-survey/poster.png',
    metadata: { evidenceType: '覆盖结论', annotation: '把站点姿态、空间关系与遮挡变化合并为可复核的覆盖判断' },
    origin: 'demo',
    allowedFieldKeys: ['judgement'],
  },
];

const complaintPoster = '/media/manim/p03/p03-complaint-evidence-loop/poster.png';

export const p03EvidenceLibrary: EvidenceDefinition<'P03'>[] = [
  {
    evidenceId: 'P03-EV-COMPLAINT-BASELINE',
    taskId: 'P03',
    kind: 'document',
    title: '投诉时间、地点、业务与终端基线',
    assetUrl: complaintPoster,
    metadata: { evidenceType: '投诉基线', annotation: '锁定投诉时间窗、地点、业务、终端、现象与发生频次' },
    origin: 'demo',
    allowedFieldKeys: ['complaintBaseline'],
  },
  {
    evidenceId: 'P03-EV-REPRODUCTION-CONDITIONS',
    taskId: 'P03',
    kind: 'diagram',
    title: '投诉复现条件闭环',
    assetUrl: complaintPoster,
    metadata: { evidenceType: '复现条件', annotation: '用地点证据、业务步骤、终端配置和复测时间窗还原投诉条件' },
    origin: 'demo',
    allowedFieldKeys: ['reproductionConditions'],
  },
  {
    evidenceId: 'P03-EV-BUSINESS-TIMELINE',
    taskId: 'P03',
    kind: 'diagram',
    title: '业务操作与失败时刻时间轴',
    assetUrl: complaintPoster,
    metadata: { evidenceType: '业务证据', annotation: '把操作步骤、结果、失败或卡顿时刻与日志截图对齐' },
    origin: 'demo',
    allowedFieldKeys: ['businessEvidence'],
  },
  {
    evidenceId: 'P03-EV-NETWORK-SNAPSHOT',
    taskId: 'P03',
    kind: 'document',
    title: '服务小区与网络测量快照',
    assetUrl: '/media/5g/image57.png',
    metadata: { evidenceType: '网络证据', annotation: '关联服务小区、频点、RSRP、SINR以及切换或重选事实' },
    origin: 'demo',
    allowedFieldKeys: ['networkEvidence'],
  },
  {
    evidenceId: 'P03-EV-COMPARISON',
    taskId: 'P03',
    kind: 'diagram',
    title: '投诉条件与复测条件对照',
    assetUrl: complaintPoster,
    metadata: { evidenceType: '条件对照', annotation: '逐项标识相同条件、差异条件与对照测试结果' },
    origin: 'demo',
    allowedFieldKeys: ['comparison'],
  },
  {
    evidenceId: 'P03-EV-CLOSEOUT',
    taskId: 'P03',
    kind: 'diagram',
    title: '投诉复现与证据边界关闭结论',
    assetUrl: complaintPoster,
    metadata: { evidenceType: '职业结论', annotation: '明确已复现、未复现或条件不等价，并给出证据边界与下一步核查' },
    origin: 'demo',
    allowedFieldKeys: ['judgement'],
  },
];

export const evidenceLibrary: EvidenceDefinition[] = [
  ...p01EvidenceLibrary,
  ...p02EvidenceLibrary,
  ...p03EvidenceLibrary,
];

const evidenceByTaskAndId = new Map(evidenceLibrary.map((evidence) => [
  `${evidence.taskId}\u0000${evidence.evidenceId}`,
  evidence,
]));

export function evidenceLibraryForTask<TaskId extends P1TaskId>(
  taskId: TaskId,
): EvidenceDefinition<TaskId>[] {
  return evidenceLibrary.filter((evidence) => evidence.taskId === taskId) as EvidenceDefinition<TaskId>[];
}

export function readEvidenceDefinition<TaskId extends P1TaskId>(
  taskId: TaskId,
  evidenceId: string,
): EvidenceDefinition<TaskId> | undefined {
  return evidenceByTaskAndId.get(`${taskId}\u0000${evidenceId}`) as EvidenceDefinition<TaskId> | undefined;
}

export function readP01EvidenceDefinition(evidenceId: string): P01EvidenceDefinition | undefined {
  return readEvidenceDefinition('P01', evidenceId) as P01EvidenceDefinition | undefined;
}

export function seedP01EvidenceLibrary(database: AppDatabase): void {
  seedDefinitions(database, p01EvidenceLibrary);
}

export function seedEvidenceLibrary(database: AppDatabase): void {
  seedDefinitions(database, evidenceLibrary);
}

function seedDefinitions(database: AppDatabase, definitions: readonly EvidenceDefinition[]): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO evidence_library (
      evidence_id, kind, title, asset_url, metadata_json, origin
    ) VALUES (?, ?, ?, ?, ?, 'demo')
  `);
  database.transaction(() => {
    for (const evidence of definitions) {
      insert.run(
        evidence.evidenceId,
        evidence.kind,
        evidence.title,
        evidence.assetUrl,
        JSON.stringify({
          ...evidence.metadata,
          taskId: evidence.taskId,
          allowedFieldKeys: evidence.allowedFieldKeys,
        }),
      );
    }
  })();
}
