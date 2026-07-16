import type { AppDatabase } from '../../platform/db/database.ts';
import type { P01OutputFieldKey } from './p01-output-definition.ts';

export type P01EvidenceKind = 'photo' | 'diagram' | 'document' | 'reading';

export interface P01EvidenceDefinition {
  evidenceId: string;
  kind: P01EvidenceKind;
  title: string;
  assetUrl: string;
  metadata: Record<string, string>;
  origin: 'demo';
  allowedFieldKeys: P01OutputFieldKey[];
}

const topologyAsset = '/media/5g/p01-n02-topology-stage-v1.png';

export const p01EvidenceLibrary: P01EvidenceDefinition[] = [
  {
    evidenceId: 'P01-EV-ROOM-OVERVIEW',
    kind: 'photo',
    title: 'HY-01机房与采集环境全景',
    assetUrl: '/media/5g/image29.png',
    metadata: { evidenceType: '位置', annotation: '站点、机房与室内采集环境同框' },
    origin: 'demo',
    allowedFieldKeys: ['siteRoom', 'collectionScope', 'locationEvidence', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-BBU-NAMEPLATE',
    kind: 'photo',
    title: 'BBU设备面板与身份标识',
    assetUrl: '/media/5g/image3.png',
    metadata: { evidenceType: '身份', annotation: '设备正面、板卡与端口标识可回查' },
    origin: 'demo',
    allowedFieldKeys: ['deviceIdentity', 'endpointA', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-BBU-LOCAL-END',
    kind: 'diagram',
    title: 'BBU本端槽位与端口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '链路本端', annotation: '机柜、BBU槽位3与本端端口' },
    origin: 'demo',
    allowedFieldKeys: ['deviceIdentity', 'endpointA', 'connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-ODF-PATH',
    kind: 'diagram',
    title: 'ODF中间路径与跳接关系',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '中间路径', annotation: 'BBU至AAU/RRU的连续走线与中间节点' },
    origin: 'demo',
    allowedFieldKeys: ['connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-AAU-FAR-END',
    kind: 'diagram',
    title: 'AAU/RRU对端设备与端口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '链路对端', annotation: '对端设备身份及光口连接' },
    origin: 'demo',
    allowedFieldKeys: ['endpointB', 'connectionDirection', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-POWER-48V',
    kind: 'diagram',
    title: '负48伏供电端子与方向',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '供电', annotation: '设备侧至负48伏配电端子的连接方向' },
    origin: 'demo',
    allowedFieldKeys: ['connectionDirection', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-GROUNDING-GAP',
    kind: 'diagram',
    title: '保护接地证据缺口标注',
    assetUrl: topologyAsset,
    metadata: { evidenceType: '缺口', annotation: '接地路径需要补拍接地线与接地排标识' },
    origin: 'demo',
    allowedFieldKeys: ['evidenceGap', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-TEMPERATURE-CONFLICT',
    kind: 'reading',
    title: '机房温控读数冲突记录',
    assetUrl: '/media/5g/image29.png',
    metadata: { evidenceType: '冲突', annotation: '环境读数与同时间窗告警需联合复核' },
    origin: 'demo',
    allowedFieldKeys: ['evidenceGap', 'riskAndReviewConclusion', 'photoIndex'],
  },
  {
    evidenceId: 'P01-EV-SCOPE-REFERENCE',
    kind: 'document',
    title: '室内信息采集范围参考',
    assetUrl: '/media/5g/image2.jpeg',
    metadata: { evidenceType: '范围', annotation: '室内环境信息、设备、供电与传输采集范围' },
    origin: 'demo',
    allowedFieldKeys: ['collectionScope', 'photoIndex'],
  },
];

const evidenceById = new Map(p01EvidenceLibrary.map((evidence) => [evidence.evidenceId, evidence]));

export function readP01EvidenceDefinition(evidenceId: string): P01EvidenceDefinition | undefined {
  return evidenceById.get(evidenceId);
}

export function seedP01EvidenceLibrary(database: AppDatabase): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO evidence_library (
      evidence_id, kind, title, asset_url, metadata_json, origin
    ) VALUES (?, ?, ?, ?, ?, 'demo')
  `);
  database.transaction(() => {
    for (const evidence of p01EvidenceLibrary) {
      insert.run(
        evidence.evidenceId,
        evidence.kind,
        evidence.title,
        evidence.assetUrl,
        JSON.stringify({
          ...evidence.metadata,
          allowedFieldKeys: evidence.allowedFieldKeys,
        }),
      );
    }
  })();
}
