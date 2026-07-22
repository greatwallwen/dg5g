const internalFieldLabels: Readonly<Record<string, string>> = Object.freeze({
  stationAndRoom: '站点与机房',
  locationEvidence: '位置证据',
  identityEvidence: '设备身份依据',
  connectionEvidence: '连接方向依据',
  judgement: '复核结论',
  sectorIdentity: '扇区标识',
  azimuth: '方位角记录',
  tilt: '下倾角记录',
  height: '挂高记录',
  environment: '现场环境',
  complaintBaseline: '投诉基本信息',
  reproductionConditions: '复现条件',
  businessEvidence: '业务侧证据',
  networkEvidence: '网络侧证据',
  comparison: '对照分析',
});

const containsChineseText = /[\u3400-\u9fff]/u;

export function studentRecordFieldLabel(field: string): string {
  const normalized = field.trim();
  const mappedLabel = internalFieldLabels[normalized];
  if (mappedLabel) return mappedLabel;
  if (containsChineseText.test(normalized)) return normalized;
  return '其他记录项';
}
