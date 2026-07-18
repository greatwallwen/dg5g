import type { ActivityPublicDto } from './activity-definition.ts';

export type ActivityEvaluationRule =
  | {
      type: 'exact-map';
      responseKey: 'assignments' | 'fields' | 'states';
      expected: Record<string, string>;
    }
  | {
      type: 'exact-sequence';
      responseKey: 'order';
      expected: string[];
    }
  | {
      type: 'revision-constraints';
      responseKey: 'revisions';
      constraints: Record<string, RevisionConstraint>;
    }
  | {
      type: 'text-criteria-map';
      responseKey: 'fields';
      constraints: Record<string, TextFieldConstraint>;
    };

export type RevisionConstraint =
  | { type: 'new-photo-id'; accepted: string[]; forbidden: string[] }
  | { type: 'evidence-source'; accepted: string[] }
  | { type: 'required-term-groups'; groups: string[][] };

export interface TextFieldConstraint {
  groups: string[][];
  minimumCharacters: number;
}

export interface ServerActivityDefinition {
  activity: ActivityPublicDto;
  rule: ActivityEvaluationRule;
}

export const p01ActivityRules: Record<string, ActivityEvaluationRule> = {
  'P1T1-N01-micro-01': {
    type: 'exact-map',
    responseKey: 'assignments',
    expected: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
  },
  'P1T1-N02-foundation-01': {
    type: 'exact-map',
    responseKey: 'assignments',
    expected: {
      'room-overview': 'location',
      'device-nameplate': 'identity',
      'two-ended-port-trace': 'link',
    },
  },
  'P1T1-N02-application-01': {
    type: 'exact-sequence',
    responseKey: 'order',
    expected: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'],
  },
  'P1T1-N02-transfer-01': {
    type: 'exact-map',
    responseKey: 'fields',
    expected: {
      siteId: 'HY-01',
      roomId: '01',
      cabinetId: 'K02',
      deviceId: 'BBU-01',
      nearPort: 'BBU-1/0',
      farPort: 'AAU-1',
    },
  },
  'P1T1-N02-remediation-revision-01': {
    type: 'revision-constraints',
    responseKey: 'revisions',
    constraints: {
      sourceEvidenceRevision: {
        type: 'required-term-groups',
        groups: [
          ['缺少', '无来源', '未填写'],
          ['IMG-031'],
          ['IMG-032'],
        ],
      },
      photoIndexRevision: {
        type: 'required-term-groups',
        groups: [
          ['对应', '映射'],
          ['IMG-031'],
          ['IMG-032'],
          ['IMG-033'],
        ],
      },
      directionRevision: {
        type: 'required-term-groups',
        groups: [
          ['BBU-01', 'CPRI-1'],
          ['AAU-01', 'OPT-1'],
          ['至', '到', '方向', '→'],
        ],
      },
    },
  },
  'P1T1-N02-remediation-conclusion-01': {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      confirmedFact: {
        groups: [
          ['铭牌', '设备身份', '序列号'],
          ['源端口', '源端'],
        ],
        minimumCharacters: 8,
      },
      evidenceGap: {
        groups: [
          ['对端口', '对端端口', '对端'],
          ['模糊', '缺口', '无法确认', '待复核'],
        ],
        minimumCharacters: 8,
      },
      risk: {
        groups: [
          ['风险', '错误', '误判', '影响', '无法交付'],
          ['链路', '配置', '成果', '端口'],
        ],
        minimumCharacters: 8,
      },
      action: {
        groups: [
          ['补拍', '重新拍摄', '复核', '核验', '整改'],
          ['对端口', '对端端口', '照片', '编号'],
        ],
        minimumCharacters: 8,
      },
    },
  },
  'P1T1-N03-micro-01': {
    type: 'exact-map',
    responseKey: 'states',
    expected: {
      power: 'confirmed',
      grounding: 'missing',
      transport: 'confirmed',
      environment: 'conflicting',
    },
  },
  'P1T1-N04-micro-01': {
    type: 'revision-constraints',
    responseKey: 'revisions',
    constraints: {
      duplicatePhotoId: {
        type: 'new-photo-id',
        accepted: ['IMG-024B', 'IMG-025'],
        forbidden: ['IMG-024'],
      },
      missingSource: { type: 'evidence-source', accepted: ['IMG-021', 'IMG-022'] },
      openGap: {
        type: 'required-term-groups',
        groups: [
          ['GAP-03', 'GAP03'],
          ['补拍', '补采', '重拍', 'RESHOOT', 'RECAPTURE'],
          ['接地', 'GROUNDING'],
        ],
      },
    },
  },
};

export const p23ActivityRules: Record<string, ActivityEvaluationRule> = {
  'P1T2-N01-micro-01': {
    type: 'exact-map',
    responseKey: 'assignments',
    expected: {
      'sector-0': 'in-scope',
      'hotspot-h2': 'in-scope',
      'other-operator': 'out-of-scope',
      'west-road': 'out-of-scope',
      'unclear-sector': 'pending',
    },
  },
  'P1T2-N02-foundation-01': {
    type: 'exact-map',
    responseKey: 'assignments',
    expected: {
      'sector-label': 'sector-identity',
      'compass-north': 'azimuth',
      'bracket-scale': 'mechanical-tilt',
      'ret-current': 'electrical-tilt',
      'height-reference': 'mounting-height',
    },
  },
  'P1T2-N02-application-01': {
    type: 'exact-sequence',
    responseKey: 'order',
    expected: ['sector-s2', 'azimuth-120', 'tilt-2-4', 'height-32', 'hotspot-125'],
  },
  'P1T2-N02-transfer-01': {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      objectIdentity: criteria([['HY-02'], ['S2', '扇区2'], ['工单'], ['标签']]),
      externalDirection: criteria([['罗盘', '测向'], ['真北', '北向'], ['120'], ['照片', '挂接', '材料']]),
      retAndHeight: criteria([['RET'], ['4度', '4°'], ['32米', '32M'], ['塔基', '地面', '起算']]),
      permissionBoundary: criteria([['美化罩'], ['禁止', '无权'], ['拆'], ['不可见', '不能看']]),
      reviewAction: criteria([['授权'], ['复核'], ['外部测向', '工参', '对照采样', '替代']]),
    },
  },
  'P1T2-N03-micro-01': {
    type: 'exact-map',
    responseKey: 'states',
    expected: {
      obstruction: 'pending',
      'parameter-conflict': 'anomaly',
      'stale-ret': 'pending',
      'locked-ladder': 'unauthorized',
    },
  },
  'P1T2-N04-micro-01': {
    type: 'revision-constraints',
    responseKey: 'revisions',
    constraints: {
      routeRevision: terms([['路线B', 'B路线'], ['风险'], ['边界'], ['H2']]),
      comparisonPoints: terms([['楼前'], ['边界'], ['楼后'], ['H2', '热点'], ['CQT', '对照']]),
      samplingWindow: terms([['18:00', '18时'], ['终端'], ['业务'], ['小区', 'S2']]),
      acceptanceMetrics: terms([['RSRP'], ['SINR'], ['卡顿', '业务现象'], ['验收', '指标', '接通率']]),
      versionDifference: terms([['V1'], ['V2'], ['路线A'], ['路线B'], ['依据', '原因']]),
    },
  },
  'P1T3-N01-micro-01': {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      occurrenceWindow: criteria([['工作日'], ['18:00', '18时'], ['19:00', '19时']]),
      location: criteria([['A座'], ['18层'], ['会议室']]),
      business: criteria([['视频会议'], ['入会', '共享屏幕', '重进']]),
      symptomFrequency: criteria([['卡顿'], ['5次'], ['4次'], ['重进', '恢复']]),
      terminalNetwork: criteria([['终端'], ['5G'], ['缺', '追问', '未知']]),
      excludedGuess: criteria([['删除', '排除'], ['猜测', '原因'], ['未支持', '尚未支持', '无证据']]),
    },
  },
  'P1T3-N02-foundation-01': {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      recordAComparison: criteria([['会议室', '地点'], ['视频会议', '业务'], ['原终端', '同终端'], ['未卡顿', '未复现']]),
      recordBComparison: criteria([['一层大厅', '大厅'], ['地点'], ['不等价']]),
      recordCComparison: criteria([['网页测速', '测速'], ['业务'], ['不等价']]),
      recordDComparison: criteria([['工程测试机', '工程机'], ['终端'], ['不等价']]),
      comparableConclusion: criteria([['记录A', 'A'], ['可比'], ['未复现'], ['不能否定', '不否定']]),
    },
  },
  'P1T3-N02-application-01': {
    type: 'exact-sequence',
    responseKey: 'order',
    expected: [
      'enter-meeting', 'share-screen', 'freeze', 'retransmission',
      'radio-sample', 'recovery', 'clock-check',
    ],
  },
  'P1T3-N02-transfer-01': {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      trainDirection: criteria([['G218'], ['方向']]),
      routeSection: criteria([['区段'], ['起止', '至'], ['里程', '定位']]),
      timeWindow: criteria([['18:40'], ['晚点'], ['校正']]),
      deviceBusiness: criteria([['同一终端', '终端'], ['通话'], ['一致', '保持']]),
      cellTrajectory: criteria([['服务小区'], ['切换'], ['掉线时刻', '掉线'], ['连续']]),
      repeatPlan: criteria([['同车次', '车次'], ['同方向', '方向'], ['重复'], ['路线'], ['回访']]),
    },
  },
  'P1T3-N03-micro-01': {
    type: 'exact-map',
    responseKey: 'states',
    expected: {
      'business-freeze': 'supports',
      'low-sinr': 'cannot-conclude',
      'high-load': 'supports',
      'no-alarm': 'conflicts',
      'late-recovery': 'needs-correlation',
    },
  },
  'P1T3-N04-micro-01': {
    type: 'revision-constraints',
    responseKey: 'revisions',
    constraints: {
      evidenceLinks: terms([['18:07'], ['业务日志'], ['无线采样'], ['KPI'], ['索引', '挂接']]),
      boundedConclusion: terms([['无线质量', '容量'], ['线索'], ['根因'], ['未确定', '尚未确定']]),
      responsibleOwner: terms([['无线优化'], ['负责人'], ['测试', '复测']]),
      deadline: terms([['24小时'], ['完成', '核查', '反馈']]),
      retestPlan: terms([['同地点'], ['同业务'], ['同终端'], ['复测'], ['两次', '2次']]),
      callback: terms([['回访'], ['用户'], ['复测后', '复测完成'], ['卡顿', '恢复']]),
      acceptance: terms([['无卡顿', '不卡顿'], ['无重传', '日志'], ['指标'], ['达标', '验收']]),
    },
  },
};

function criteria(groups: string[][], minimumCharacters = 8): TextFieldConstraint {
  return { groups, minimumCharacters };
}

function terms(groups: string[][]): RevisionConstraint {
  return { type: 'required-term-groups', groups };
}

export const p1ActivityRules: Record<string, ActivityEvaluationRule> = {
  ...p01ActivityRules,
  ...p23ActivityRules,
};
