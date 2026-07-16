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
