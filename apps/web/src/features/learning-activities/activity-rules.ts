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
    };

export type RevisionConstraint =
  | { type: 'new-photo-id'; accepted: string[]; forbidden: string[] }
  | { type: 'evidence-source'; accepted: string[] }
  | { type: 'required-term-groups'; groups: string[][] };

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
