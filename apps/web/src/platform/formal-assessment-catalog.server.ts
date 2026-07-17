import type {
  AssessmentDimensionKey,
  AssessmentPaper,
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
    questionVersion: 'p02-n02-v1',
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
        prompt: '根据“连续采样形成覆盖边界，但一个异常点缺少复测轨迹”的事实，提交职业化结论。',
        helpText: '分别写明已确认事实、证据缺口、误判风险和下一步复测动作。',
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
    questionVersion: 'p03-n02-v1',
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
        prompt: '根据“投诉能够复现，但终端日志与无线测量不一致”的事实，提交职业化结论。',
        helpText: '区分已确认事实、尚未闭合的原因证据、误归因风险和下一步动作。',
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

const p01N02VariantB = createEquivalentVariant(p01N02Definition, {
  questionVersion: 'p01-n02-v1-b',
  title: '室内设备与链路证据正式测试 · 等价案例B',
  questions: {
    evidenceClassification: {
      prompt: '设备完成迁架后，需要重新确认新机柜中的唯一设备身份。哪项材料是首要证据？',
      helpText: '选择能够把设备资产身份与本次迁架记录直接绑定的材料。',
      options: [
        { id: 'cabinet-panorama-b', label: '只显示新机柜位置的全景照片' },
        { id: 'asset-tag-b', label: '同时包含资产标签、型号和序列号的设备近照' },
        { id: 'loose-fiber-b', label: '没有端口编号的尾纤照片' },
        { id: 'migration-note-b', label: '未标设备编号的迁架口头记录' },
      ],
    },
    linkReconstruction: {
      prompt: '从对端设备返回源端设备，重建迁架后的反向复核链路。',
      helpText: '方向与案例A相反，但仍须保留两端设备、两端端口和中间纤缆标识。',
      options: [
        { id: 'fiber-label-b', label: '中间纤缆标签' },
        { id: 'source-device-b', label: '源端设备身份' },
        { id: 'peer-port-b', label: '对端端口编号' },
        { id: 'peer-device-b', label: '对端设备身份' },
        { id: 'source-port-b', label: '源端端口编号' },
      ],
    },
    defectiveOutputRevision: {
      prompt: '迁架成果表沿用了旧端口关系，且新照片没有字段索引。应执行哪些修订？',
      helpText: '选择能恢复新版本字段来源与反向链路可审计性的动作。',
      options: [
        { id: 'bind-asset-source-b', label: '将设备字段绑定到新资产标签照片' },
        { id: 'index-endpoints-b', label: '为两端设备和端口补充新照片索引' },
        { id: 'record-reverse-direction-b', label: '记录本次反向复核的源端与对端方向' },
        { id: 'suppress-gap-b', label: '隐藏仍未拍清的端口缺口' },
      ],
    },
    professionalConclusion: {
      prompt: '迁架后设备身份与源端口已确认，但对端端口标签被遮挡。写出职业化复核结论。',
      helpText: '分别写明已确认事实、对端证据缺口、错误关联风险和补拍核验动作。',
    },
  },
  evidenceOptionId: 'asset-tag-b',
  linkOrder: ['peer-device-b', 'peer-port-b', 'fiber-label-b', 'source-port-b', 'source-device-b'],
  requiredRevisionOptionIds: ['bind-asset-source-b', 'index-endpoints-b', 'record-reverse-direction-b'],
  forbiddenRevisionOptionIds: ['suppress-gap-b'],
});

const p02N02VariantB = createEquivalentVariant(p02N02Definition, {
  questionVersion: 'p02-n02-v1-b',
  title: '室外站点与覆盖证据正式测试 · 等价案例B',
  questions: {
    evidenceClassification: {
      prompt: '沿道路复测弱覆盖边界时，哪项记录能够证明读数属于指定路线与方向？',
      helpText: '选择同时包含路线序号、坐标、朝向、时间和测量值的记录。',
      options: [
        { id: 'road-photo-b', label: '只显示道路环境的照片' },
        { id: 'bearing-sample-b', label: '带路线序号、坐标、朝向、时间和读数的采样记录' },
        { id: 'tower-board-b', label: '只显示站名的标牌照片' },
        { id: 'heatmap-crop-b', label: '没有路线索引的热力图局部截图' },
      ],
    },
    linkReconstruction: {
      prompt: '重建“扇区锚点—道路路线—采样事实—边界—复测点”的证据链。',
      helpText: '材料显示顺序已打乱，请按现场复核逻辑排序。',
      options: [
        { id: 'resurvey-flag-b', label: '需要复测的离群点' },
        { id: 'coordinate-sample-b', label: '带坐标与时间的采样事实' },
        { id: 'sector-anchor-b', label: '扇区与道路起点锚点' },
        { id: 'boundary-segment-b', label: '连续采样形成的边界段' },
        { id: 'route-sequence-b', label: '道路路线与采样顺序' },
      ],
    },
    defectiveOutputRevision: {
      prompt: '道路复测表缺少路线序号和时间窗，并把一个离群点平滑掉。应如何修订？',
      helpText: '恢复路线可追溯性，并保留需要再次复测的异常事实。',
      options: [
        { id: 'bind-route-b', label: '为每组读数补挂路线和采样顺序' },
        { id: 'bind-sample-window-b', label: '补录坐标、方向与采样时间窗' },
        { id: 'retain-outlier-b', label: '保留离群点并登记复测要求' },
        { id: 'smooth-outlier-b', label: '用相邻均值覆盖离群点原始读数' },
      ],
    },
    professionalConclusion: {
      prompt: '道路覆盖边界基本连续，但一个离群点没有同路线复测记录。提交职业化结论。',
      helpText: '说明已确认边界、复测缺口、误判风险和补采动作。',
    },
  },
  evidenceOptionId: 'bearing-sample-b',
  linkOrder: [
    'sector-anchor-b', 'route-sequence-b', 'coordinate-sample-b',
    'boundary-segment-b', 'resurvey-flag-b',
  ],
  requiredRevisionOptionIds: ['bind-route-b', 'bind-sample-window-b', 'retain-outlier-b'],
  forbiddenRevisionOptionIds: ['smooth-outlier-b'],
});

const p03N02VariantB = createEquivalentVariant(p03N02Definition, {
  questionVersion: 'p03-n02-v1-b',
  title: '投诉复现与原因边界正式测试 · 等价案例B',
  questions: {
    evidenceClassification: {
      prompt: '复现室内掉线投诉前，哪项材料能够锁定投诉对象、楼层点位和发生时间？',
      helpText: '选择可将现场复现与原始投诉时间线直接关联的材料。',
      options: [
        { id: 'lobby-photo-b', label: '只显示楼宇大厅的环境照片' },
        { id: 'ticket-timeline-b', label: '包含工单号、楼层点位、用户描述和发生时间的投诉时间线' },
        { id: 'phone-shell-b', label: '只显示终端外观的照片' },
        { id: 'signal-crop-b', label: '没有工单与时间标记的信号截图' },
      ],
    },
    linkReconstruction: {
      prompt: '重建从投诉时间线到室内复现和原因边界的证据链。',
      helpText: '材料顺序已打乱，请先锁定投诉窗口，再连接终端与无线事实。',
      options: [
        { id: 'radio-trace-b', label: '同一时间的无线测量轨迹' },
        { id: 'ticket-window-b', label: '投诉工单与发生时间窗' },
        { id: 'attribution-boundary-b', label: '证据支持的归因边界' },
        { id: 'terminal-trace-b', label: '复现时的终端业务日志' },
        { id: 'indoor-reproduction-b', label: '楼层内的现场复现点位' },
      ],
    },
    defectiveOutputRevision: {
      prompt: '调查单缺少复现时间窗，并忽略终端日志与无线轨迹冲突。应如何修订？',
      helpText: '恢复工单关联和矛盾证据，避免直接越界归因。',
      options: [
        { id: 'bind-ticket-b', label: '补挂工单号、楼层点位与原始描述' },
        { id: 'bind-reproduction-window-b', label: '补录复现时间窗和复现路线' },
        { id: 'record-conflict-b', label: '登记终端日志与无线轨迹的冲突' },
        { id: 'assign-cause-b', label: '不补证据，直接判定网络责任' },
      ],
    },
    professionalConclusion: {
      prompt: '掉线能够复现，但终端业务日志与无线轨迹的时间点不一致。提交职业化结论。',
      helpText: '区分已确认投诉事实、时间证据缺口、误归因风险和联合复测动作。',
    },
  },
  evidenceOptionId: 'ticket-timeline-b',
  linkOrder: [
    'ticket-window-b', 'indoor-reproduction-b', 'terminal-trace-b',
    'radio-trace-b', 'attribution-boundary-b',
  ],
  requiredRevisionOptionIds: ['bind-ticket-b', 'bind-reproduction-window-b', 'record-conflict-b'],
  forbiddenRevisionOptionIds: ['assign-cause-b'],
});

const definitionsByNode = new Map([
  [p01N02Definition, p01N02VariantB],
  [p02N02Definition, p02N02VariantB],
  [p03N02Definition, p03N02VariantB],
].map((definitions) => [definitions[0].paper.nodeId, definitions] as const));

const definitionsByVersion = new Map(
  [...definitionsByNode.values()].flatMap((definitions) => definitions.map((definition) => [
    `${definition.paper.nodeId}:${definition.paper.questionVersion}`,
    definition,
  ] as const)),
);

export function getFormalAssessmentDefinition(nodeId: string): FormalAssessmentDefinition | undefined {
  return definitionsByNode.get(nodeId)?.[0];
}

export function getFormalAssessmentDefinitions(nodeId: string): readonly FormalAssessmentDefinition[] {
  return definitionsByNode.get(nodeId) ?? [];
}

export function getFormalAssessmentDefinitionByVersion(
  nodeId: string,
  questionVersion: string,
): FormalAssessmentDefinition | undefined {
  return definitionsByVersion.get(`${nodeId}:${questionVersion}`);
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

interface EquivalentVariantSpec {
  questionVersion: string;
  title: string;
  questions: Record<AssessmentDimensionKey, {
    prompt: string;
    helpText: string;
    options?: Array<{ id: string; label: string }>;
  }>;
  evidenceOptionId: string;
  linkOrder: string[];
  requiredRevisionOptionIds: string[];
  forbiddenRevisionOptionIds: string[];
}

function createEquivalentVariant(
  source: FormalAssessmentDefinition,
  spec: EquivalentVariantSpec,
): FormalAssessmentDefinition {
  return {
    gameId: source.gameId,
    paper: {
      ...source.paper,
      title: spec.title,
      questionVersion: spec.questionVersion,
      questions: source.paper.questions.map((question) => ({
        ...question,
        ...spec.questions[question.dimension],
        ...(spec.questions[question.dimension].options
          ? { options: spec.questions[question.dimension].options?.map((option) => ({ ...option })) }
          : {}),
      })),
    },
    grading: {
      evidenceClassification: {
        ...source.grading.evidenceClassification,
        acceptedOptionIds: [spec.evidenceOptionId],
      },
      linkReconstruction: {
        ...source.grading.linkReconstruction,
        orderedOptionIds: [...spec.linkOrder],
      },
      defectiveOutputRevision: {
        ...source.grading.defectiveOutputRevision,
        requiredOptionIds: [...spec.requiredRevisionOptionIds],
        forbiddenOptionIds: [...spec.forbiddenRevisionOptionIds],
      },
      professionalConclusion: {
        ...source.grading.professionalConclusion,
      },
    },
  };
}
