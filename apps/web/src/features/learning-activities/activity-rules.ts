import type { ActivityPublicDto } from './activity-definition.ts';

export type ActivityEvaluationRule =
  | {
      type: 'exact-map';
      responseKey: 'assignments' | 'fields' | 'states';
      expected: Record<string, string>;
    }
  | {
      type: 'exact-map-with-reasons';
      responseKey: 'assignments';
      expected: Record<string, string>;
      reasonsKey: 'reasons';
      reasonConstraints: Record<string, TextFieldConstraint>;
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
    type: 'exact-map-with-reasons',
    responseKey: 'assignments',
    expected: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
    reasonsKey: 'reasons',
    reasonConstraints: {
      'shared-operator-cabinet': {
        groups: [['其他运营商', '他网', '不属于本运营商'], ['排除', '不混入', '不能混入', '不进入']],
        minimumCharacters: 8,
      },
      'room-02-cabinets': {
        groups: [['02号机房', '02 号机房'], ['任务单', '01号机房', '01 号机房'], ['排除', '不在范围']],
        minimumCharacters: 8,
      },
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
      power: 'satisfied',
      grounding: 'pendingReview',
      transport: 'satisfied',
      environment: 'abnormal',
      unauthorizedOperation: 'noAuthority',
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

function structuredResponseRule(groups: string[][]): ActivityEvaluationRule {
  return {
    type: 'text-criteria-map',
    responseKey: 'fields',
    constraints: {
      response: {
        groups,
        minimumCharacters: 20,
      },
    },
  };
}

export const p23ActivityRules: Record<string, ActivityEvaluationRule> = {
  'P1T2-N01-micro-01': structuredResponseRule([
    ['坐标', '经纬度'], ['扇区'], ['方向'], ['热点', 'H1', 'H2'], ['边界', '范围'],
  ]),
  'P1T2-N02-foundation-01': structuredResponseRule([
    ['扇区2', '扇区'], ['方位角', '正北'], ['机械下倾', '支架'],
    ['电下倾', 'RET'], ['挂高', '地面'], ['照片', '证据'],
  ]),
  'P1T2-N02-application-01': structuredResponseRule([
    ['扇区2'], ['方位角'], ['投诉路段'], ['机械下倾', '电下倾'],
    ['挂高'], ['罗盘', 'RET'], ['缺', '补', '待复核'],
  ]),
  'P1T2-N02-transfer-01': structuredResponseRule([
    ['不拆'], ['美化罩'], ['扇区', '身份'], ['罗盘', '测向'],
    ['RET', '网管'], ['挂高', '遮挡'], ['不确定', '待复核'],
  ]),
  'P1T2-N03-micro-01': structuredResponseRule([
    ['扇区', '主瓣'], ['遮挡', '楼体'], ['热点', 'H2'],
    ['风险点'], ['对照点'], ['验证', '假设'],
  ]),
  'P1T2-N04-micro-01': structuredResponseRule([
    ['路线B', 'B路线'], ['风险', '边界'], ['CQT', '热点'],
    ['对照点'], ['时间', '18:00'], ['RSRP'], ['SINR', '指标'],
  ]),
  'P1T3-N01-micro-01': structuredResponseRule([
    ['18', '时间'], ['A座', '会议室'], ['视频会议'], ['卡顿'],
    ['终端', '5G'], ['追问', '缺'], ['复测'],
  ]),
  'P1T3-N02-foundation-01': structuredResponseRule([
    ['同地点'], ['同业务'], ['同终端'], ['记录B', '地点不同'],
    ['记录C', '业务不同'], ['记录D', '终端不同'], ['不等价'], ['未复现'],
  ]),
  'P1T3-N02-application-01': structuredResponseRule([
    ['分钟'], ['地点', '终端'], ['视频会议', '业务'], ['服务小区'],
    ['RSRP'], ['SINR'], ['日志', '时间轴'],
  ]),
  'P1T3-N02-transfer-01': structuredResponseRule([
    ['车次'], ['区段', '路线'], ['通话'], ['终端'],
    ['服务小区'], ['掉线', '时刻'], ['重复'],
  ]),
  'P1T3-N03-micro-01': structuredResponseRule([
    ['18:07', '时窗'], ['SINR'], ['服务小区'], ['KPI', '告警'],
    ['业务侧'], ['网络侧'], ['冲突', '无告警'],
  ]),
  'P1T3-N04-micro-01': structuredResponseRule([
    ['业务日志', '证据'], ['网络KPI', 'KPI'], ['负责人'], ['24小时', '时限'],
    ['复测'], ['回访'], ['验收', '闭环'],
  ]),
};

export const p1ActivityRules: Record<string, ActivityEvaluationRule> = {
  ...p01ActivityRules,
  ...p23ActivityRules,
};
