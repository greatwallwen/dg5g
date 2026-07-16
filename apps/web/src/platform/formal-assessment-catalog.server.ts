import type {
  AssessmentDimensionKey,
  AssessmentPaper,
  RemediationTarget,
} from './formal-assessment-contract.ts';

interface AssessmentGradingRule {
  acceptedOptionIds?: string[];
  orderedOptionIds?: string[];
  requiredOptionIds?: string[];
  forbiddenOptionIds?: string[];
  conclusionCriteria?: {
    confirmedFact: string[][];
    evidenceGap: string[][];
    risk: string[][];
    action: string[][];
    minimumCharacters: number;
  };
  remediationTarget: RemediationTarget;
}

export interface FormalAssessmentDefinition {
  paper: AssessmentPaper;
  gameId: string;
  grading: Record<AssessmentDimensionKey, AssessmentGradingRule>;
}

const p01N02Definition: FormalAssessmentDefinition = {
  paper: {
    nodeId: 'P1T1-N02',
    title: '室内设备与链路证据正式测试',
    questionVersion: 'p01-n02-v1',
    passScore: 80,
    durationMinutes: 15,
    questions: [
      {
        id: 'evidenceClassification',
        dimension: 'evidenceClassification',
        kind: 'single-choice',
        prompt: '需要确认机柜内设备的唯一身份时，哪项材料应作为首要证据？',
        helpText: '选择与设备身份直接对应、可复核的一项材料。',
        options: [
          { id: 'location-photo', label: '能够看见机柜位置的远景照片' },
          { id: 'nameplate-photo', label: '清晰包含厂家、型号和序列号的铭牌照片' },
          { id: 'port-photo', label: '只拍到一个未编号端口的近景照片' },
          { id: 'environment-note', label: '现场温度与照明情况记录' },
        ],
      },
      {
        id: 'linkReconstruction',
        dimension: 'linkReconstruction',
        kind: 'ordering',
        prompt: '按证据链的连接方向，重建一条可审计的室内设备链路。',
        helpText: '将五个对象从源端到对端依次排列。',
        options: [
          { id: 'source-device', label: '源设备身份' },
          { id: 'source-port', label: '源端口编号' },
          { id: 'cable-label', label: '线缆标签与走向' },
          { id: 'peer-port', label: '对端端口编号' },
          { id: 'peer-device', label: '对端设备身份' },
        ],
      },
      {
        id: 'defectiveOutputRevision',
        dimension: 'defectiveOutputRevision',
        kind: 'multiple-choice',
        prompt: '成果表只有“已连接”结论，却缺少字段来源与复核依据。应执行哪些修订？',
        helpText: '可多选。选择能够恢复证据链和审计性的动作。',
        options: [
          { id: 'restore-source', label: '为设备、端口字段补充来源证据' },
          { id: 'add-photo-index', label: '补充照片编号并与字段逐项对应' },
          { id: 'record-direction', label: '明确记录源端、对端和连接方向' },
          { id: 'erase-gap', label: '删除证据缺口，使成果表看起来完整' },
        ],
      },
      {
        id: 'professionalConclusion',
        dimension: 'professionalConclusion',
        kind: 'structured-conclusion',
        prompt: '根据“设备铭牌可识别、源端口清晰、对端端口照片模糊”的情况，写出职业化复核结论。',
        helpText: '结论应说明已确认事实、证据缺口、风险和下一步动作。',
      },
    ],
  },
  gameId: 'P1T1-N02-server-assessment',
  grading: {
    evidenceClassification: {
      acceptedOptionIds: ['nameplate-photo'],
      remediationTarget: { nodeId: 'P1T1-N02', sectionId: 'evidence' },
    },
    linkReconstruction: {
      orderedOptionIds: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
      remediationTarget: { nodeId: 'P1T1-N02', sectionId: 'explain' },
    },
    defectiveOutputRevision: {
      requiredOptionIds: ['restore-source', 'add-photo-index', 'record-direction'],
      forbiddenOptionIds: ['erase-gap'],
      remediationTarget: { nodeId: 'P1T1-N02', sectionId: 'practice' },
    },
    professionalConclusion: {
      conclusionCriteria: {
        confirmedFact: [
          ['铭牌', '设备身份', '序列号'],
          ['源端口', '源端'],
        ],
        evidenceGap: [
          ['对端口', '对端端口', '对端'],
          ['模糊', '缺口', '无法确认', '待复核'],
        ],
        risk: [
          ['风险', '错误', '误判', '影响', '无法交付'],
          ['链路', '配置', '成果', '端口'],
        ],
        action: [
          ['补拍', '重新拍摄', '复核', '核验', '整改'],
          ['对端口', '对端端口', '照片', '编号'],
        ],
        minimumCharacters: 14,
      },
      remediationTarget: { nodeId: 'P1T1-N02', sectionId: 'understand' },
    },
  },
};

export function getFormalAssessmentDefinition(nodeId: string): FormalAssessmentDefinition | undefined {
  return nodeId === p01N02Definition.paper.nodeId ? p01N02Definition : undefined;
}

export function projectAssessmentPaper(definition: FormalAssessmentDefinition): AssessmentPaper {
  return {
    ...definition.paper,
    questions: definition.paper.questions.map((question) => ({
      ...question,
      ...(question.options ? { options: question.options.map((option) => ({ ...option })) } : {}),
    })),
  };
}
