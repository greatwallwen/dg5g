import type {
  AssessmentDimensionKey,
  AssessmentOption,
  AssessmentPaper,
  ProfessionalConclusionAnswer,
  ProfessionalConclusionField,
  RemediationTarget,
} from './formal-assessment-contract.ts';
import type { PersistedAssessmentValidationPolicy } from './persisted-assessment-diagnostic.ts';

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

function conclusionChoices(
  correct: ProfessionalConclusionAnswer,
): Record<ProfessionalConclusionField, AssessmentOption[]> {
  return {
    confirmedFact: [
      { id: 'fact-overreach', label: '现场现象已经足够，可以直接确认全部事实。' },
      { id: 'fact-evidence-boundary', label: correct.confirmedFact },
    ],
    evidenceGap: [
      { id: 'gap-retain', label: correct.evidenceGap },
      { id: 'gap-hide', label: '暂时没有材料也不影响结论，不需要登记证据缺口。' },
    ],
    risk: [
      { id: 'risk-none', label: '当前记录不存在误判风险，可以直接作为最终结论。' },
      { id: 'risk-boundary', label: correct.risk },
    ],
    action: [
      { id: 'action-review', label: correct.action },
      { id: 'action-close', label: '保持现有记录不变，直接结束本次核验。' },
    ],
  };
}

const p01N02Definition: FormalAssessmentDefinition = {
  paper: {
    nodeId: 'P1T1-N02',
    title: '室内设备与链路证据正式测试',
    questionVersion: 'p01-n02-v2',
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
        prompt: '根据“设备铭牌可识别、源端口清晰、对端端口照片模糊”的情况，组成职业化复核结论。',
        helpText: '依次选择已确认事实、证据缺口、风险和下一步动作。',
        conclusionOptions: conclusionChoices({
          confirmedFact: '设备铭牌可识别，已确认设备身份；源端口照片清晰，源端连接已确认。',
          evidenceGap: '对端端口照片模糊，缺少可核验编号，对端连接仍待复核。',
          risk: '若直接判定链路完整，可能造成端口关系误判并影响后续配置。',
          action: '重新补拍对端端口与编号照片，完成核验后再更新证据表。',
        }),
      },
    ],
  },
  gameId: 'P1T1-N02-server-assessment',
  grading: {
    evidenceClassification: {
      acceptedOptionIds: ['nameplate-photo'],
      remediationTarget: {
        nodeId: 'P1T1-N02',
        sectionId: 'practice',
        activityId: 'P1T1-N02-foundation-01',
      },
    },
    linkReconstruction: {
      orderedOptionIds: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
      remediationTarget: {
        nodeId: 'P1T1-N02',
        sectionId: 'practice',
        activityId: 'P1T1-N02-application-01',
      },
    },
    defectiveOutputRevision: {
      requiredOptionIds: ['restore-source', 'add-photo-index', 'record-direction'],
      forbiddenOptionIds: ['erase-gap'],
      remediationTarget: {
        nodeId: 'P1T1-N02',
        sectionId: 'practice',
        activityId: 'P1T1-N02-remediation-revision-01',
      },
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
      remediationTarget: {
        nodeId: 'P1T1-N02',
        sectionId: 'practice',
        activityId: 'P1T1-N02-remediation-conclusion-01',
      },
    },
  },
};

const p02N02Definition: FormalAssessmentDefinition = {
  paper: {
    nodeId: 'P1T2-N02',
    title: '室外站点与覆盖证据正式测试',
    questionVersion: 'p02-n02-v2',
    passScore: 80,
    durationMinutes: 15,
    questions: [
      {
        id: 'evidenceClassification',
        dimension: 'evidenceClassification',
        kind: 'single-choice',
        prompt: '要证明某条室外覆盖边界来自指定采样点，哪项材料是首要的可复核证据？',
        helpText: '选择同时固定空间位置、采样方向和测量值的材料。',
        options: [
          { id: 'site-panorama', label: '只显示站点外观的全景照片' },
          { id: 'gps-bearing-sample', label: '包含坐标、方向、时间和信号读数的采样记录' },
          { id: 'antenna-nameplate', label: '只显示天线型号的铭牌照片' },
          { id: 'coverage-screenshot', label: '没有采样点索引的覆盖截图' },
        ],
      },
      {
        id: 'linkReconstruction',
        dimension: 'linkReconstruction',
        kind: 'ordering',
        prompt: '按现场采集逻辑重建“站点—采样点—覆盖结论”的证据链。',
        helpText: '从站点锚点开始，依次连接采样事实、边界判断与异常登记。',
        options: [
          { id: 'site-anchor', label: '站点与扇区锚点' },
          { id: 'sample-point', label: '带坐标和方向的采样点' },
          { id: 'signal-reading', label: '对应时间窗的信号读数' },
          { id: 'coverage-boundary', label: '由连续采样形成的覆盖边界' },
          { id: 'anomaly-marker', label: '需要复测的异常点标记' },
        ],
      },
      {
        id: 'defectiveOutputRevision',
        dimension: 'defectiveOutputRevision',
        kind: 'multiple-choice',
        prompt: '一份覆盖成果把异常点直接平均掉，且缺少坐标与采样时间。应执行哪些修订？',
        helpText: '选择能够恢复采样记录可追溯性、同时保留异常事实的动作。',
        options: [
          { id: 'bind-coordinate', label: '为每条读数补挂坐标和采样方向' },
          { id: 'bind-time', label: '补录采样时间窗与路线序号' },
          { id: 'retain-anomaly', label: '保留异常点并登记复测要求' },
          { id: 'average-anomaly', label: '删除异常点并用均值替代原始读数' },
        ],
      },
      {
        id: 'professionalConclusion',
        dimension: 'professionalConclusion',
        kind: 'structured-conclusion',
        prompt: '根据“连续采样形成覆盖边界，但一个异常点缺少复测轨迹”的事实，组成职业化结论。',
        helpText: '依次选择已确认事实、证据缺口、误判风险和下一步复测动作。',
        conclusionOptions: conclusionChoices({
          confirmedFact: '已确认采样点坐标、采样时间和对应信号读数，连续数据形成覆盖边界。',
          evidenceGap: '异常点尚缺复测轨迹，当前证据缺口需要保留并标记待复核。',
          risk: '若忽略异常点，覆盖边界和优化结论存在误判风险。',
          action: '按原时间窗补做异常点复测，保存轨迹并更新成果记录。',
        }),
      },
    ],
  },
  gameId: 'P1T2-N02-server-assessment',
  grading: {
    evidenceClassification: {
      acceptedOptionIds: ['gps-bearing-sample'],
      remediationTarget: taskRemediation('P1T2-N02', 'foundation'),
    },
    linkReconstruction: {
      orderedOptionIds: ['site-anchor', 'sample-point', 'signal-reading', 'coverage-boundary', 'anomaly-marker'],
      remediationTarget: taskRemediation('P1T2-N02', 'application'),
    },
    defectiveOutputRevision: {
      requiredOptionIds: ['bind-coordinate', 'bind-time', 'retain-anomaly'],
      forbiddenOptionIds: ['average-anomaly'],
      remediationTarget: taskRemediation('P1T2-N02', 'transfer'),
    },
    professionalConclusion: {
      conclusionCriteria: {
        confirmedFact: [['采样点', '坐标', '时间'], ['覆盖边界', '信号读数']],
        evidenceGap: [['异常点'], ['复测', '缺口', '待复核']],
        risk: [['误判', '风险', '错误'], ['覆盖边界', '优化结论']],
        action: [['复测'], ['轨迹', '时间窗', '更新成果']],
        minimumCharacters: 14,
      },
      remediationTarget: taskRemediation('P1T2-N02', 'transfer'),
    },
  },
};

const p03N02Definition: FormalAssessmentDefinition = {
  paper: {
    nodeId: 'P1T3-N02',
    title: '投诉复现与原因边界正式测试',
    questionVersion: 'p03-n02-v2',
    passScore: 80,
    durationMinutes: 15,
    questions: [
      {
        id: 'evidenceClassification',
        dimension: 'evidenceClassification',
        kind: 'single-choice',
        prompt: '开始现场投诉复现前，哪项材料能够唯一约束投诉对象、时间窗和问题描述？',
        helpText: '选择能够把现场采集动作与原始投诉事实绑定的材料。',
        options: [
          { id: 'neighbour-photo', label: '投诉地点附近的环境照片' },
          { id: 'complaint-ticket', label: '包含工单号、用户描述、地址和时间窗的投诉工单' },
          { id: 'terminal-model', label: '只记录终端型号的便签' },
          { id: 'signal-screenshot', label: '没有工单号和时间的信号截图' },
        ],
      },
      {
        id: 'linkReconstruction',
        dimension: 'linkReconstruction',
        kind: 'ordering',
        prompt: '重建从投诉事实到原因边界的现场复现证据链。',
        helpText: '先锁定投诉地点，再连接终端状态、无线测量与可证明的原因边界。',
        options: [
          { id: 'complaint-address', label: '投诉地址与时间窗' },
          { id: 'reproduction-point', label: '现场复现点位' },
          { id: 'terminal-state', label: '复现时终端与业务状态' },
          { id: 'radio-measurement', label: '同一时刻的无线测量' },
          { id: 'cause-boundary', label: '由证据支持的原因边界' },
        ],
      },
      {
        id: 'defectiveOutputRevision',
        dimension: 'defectiveOutputRevision',
        kind: 'multiple-choice',
        prompt: '调查单直接写“网络故障”，但没有工单关联、时间窗和矛盾证据登记。应如何修订？',
        helpText: '选择能够恢复投诉调查可追溯性，并避免越过证据边界的动作。',
        options: [
          { id: 'bind-ticket', label: '补挂投诉工单号与原始问题描述' },
          { id: 'bind-time-window', label: '补录复现时间窗和点位' },
          { id: 'retain-contradiction', label: '登记终端日志与无线测量的矛盾' },
          { id: 'close-without-evidence', label: '不补证据，直接关闭为网络故障' },
        ],
      },
      {
        id: 'professionalConclusion',
        dimension: 'professionalConclusion',
        kind: 'structured-conclusion',
        prompt: '根据“投诉能够复现，但终端日志与无线测量不一致”的事实，组成职业化结论。',
        helpText: '依次选择已确认事实、尚未闭合的原因证据、误归因风险和下一步动作。',
        conclusionOptions: conclusionChoices({
          confirmedFact: '已核对投诉工单与投诉地址，现场可以复现用户描述的问题。',
          evidenceGap: '终端日志与无线测量结果矛盾，原因边界仍待复核。',
          risk: '直接归为网络故障会造成投诉结论误归因，并影响责任判断。',
          action: '在相同时间窗重新复测，联合核验终端日志并更新调查记录。',
        }),
      },
    ],
  },
  gameId: 'P1T3-N02-server-assessment',
  grading: {
    evidenceClassification: {
      acceptedOptionIds: ['complaint-ticket'],
      remediationTarget: taskRemediation('P1T3-N02', 'foundation'),
    },
    linkReconstruction: {
      orderedOptionIds: ['complaint-address', 'reproduction-point', 'terminal-state', 'radio-measurement', 'cause-boundary'],
      remediationTarget: taskRemediation('P1T3-N02', 'application'),
    },
    defectiveOutputRevision: {
      requiredOptionIds: ['bind-ticket', 'bind-time-window', 'retain-contradiction'],
      forbiddenOptionIds: ['close-without-evidence'],
      remediationTarget: taskRemediation('P1T3-N02', 'transfer'),
    },
    professionalConclusion: {
      conclusionCriteria: {
        confirmedFact: [['投诉', '工单'], ['地址', '复现']],
        evidenceGap: [['日志', '无线测量'], ['矛盾', '待复核', '原因边界']],
        risk: [['误判', '误归因', '错误'], ['责任', '投诉结论']],
        action: [['时间窗', '复测'], ['日志', '核验', '更新']],
        minimumCharacters: 14,
      },
      remediationTarget: taskRemediation('P1T3-N02', 'transfer'),
    },
  },
};

const definitionsByNode = new Map([
  p01N02Definition,
  p02N02Definition,
  p03N02Definition,
].map((definition) => [definition.paper.nodeId, definition]));

export function getFormalAssessmentDefinition(nodeId: string): FormalAssessmentDefinition | undefined {
  return definitionsByNode.get(nodeId);
}

export function getFormalAssessmentValidationPolicy(
  nodeId: string,
): PersistedAssessmentValidationPolicy | undefined {
  const definition = getFormalAssessmentDefinition(nodeId);
  if (!definition) return undefined;
  const seen = new Set<string>();
  return {
    passScore: definition.paper.passScore,
    allowedRemediationTargets: Object.values(definition.grading)
      .map(({ remediationTarget }) => remediationTarget)
      .filter((target) => {
        const key = `${target.nodeId}:${target.sectionId}:${target.activityId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
  };
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

function taskRemediation(
  nodeId: 'P1T2-N02' | 'P1T3-N02',
  level: 'foundation' | 'application' | 'transfer',
): RemediationTarget {
  return {
    nodeId,
    sectionId: 'practice',
    activityId: `${nodeId}-${level}-01`,
  };
}
