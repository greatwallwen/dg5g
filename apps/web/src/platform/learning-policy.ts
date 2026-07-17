import type { LearningPrerequisite } from './learning-projection.ts';

export type P1TaskId = 'P01' | 'P02' | 'P03';
export type P1NodeId = `P1T${1 | 2 | 3}-N0${1 | 2 | 3 | 4}`;
export type AssessmentRole = 'none' | 'node-test' | 'task-pixi';
export type PublicationStatus = 'published' | 'not-open';

export interface NodeLearningPolicy {
  nodeId: P1NodeId;
  taskId: P1TaskId;
  publicationStatus: PublicationStatus;
  prerequisites: LearningPrerequisite[];
  /** @deprecated Legacy readers use this until the SQLite service migration is complete. */
  prerequisiteNodeIds: string[];
  requiresMicroPractice: boolean;
  requiredActivityIds: readonly string[];
  requiresFormalTest: boolean;
  assessmentRole: AssessmentRole;
  formalPassScore?: number;
  requiresProfessionalOutput: boolean;
  requiresTeacherVerification: boolean;
  professionalOutputTitle?: string;
}

const taskDefinitions: Array<{
  taskId: P1TaskId;
  prefix: 'P1T1' | 'P1T2' | 'P1T3';
  upstreamPrefix?: 'P1T1' | 'P1T2';
  outputTitle: string;
}> = [
  { taskId: 'P01', prefix: 'P1T1', outputTitle: '室内设备与链路证据表' },
  { taskId: 'P02', prefix: 'P1T2', upstreamPrefix: 'P1T1', outputTitle: '室外站点与覆盖采集表' },
  { taskId: 'P03', prefix: 'P1T3', upstreamPrefix: 'P1T2', outputTitle: '投诉信息调查单' },
];

const requiredActivityIdsByNode: Record<P1NodeId, readonly string[]> = {
  'P1T1-N01': ['P1T1-N01-micro-01'],
  'P1T1-N02': [
    'P1T1-N02-foundation-01',
    'P1T1-N02-application-01',
    'P1T1-N02-transfer-01',
  ],
  'P1T1-N03': ['P1T1-N03-micro-01'],
  'P1T1-N04': ['P1T1-N04-micro-01'],
  'P1T2-N01': ['P1T2-N01-micro-01'],
  'P1T2-N02': [
    'P1T2-N02-foundation-01',
    'P1T2-N02-application-01',
    'P1T2-N02-transfer-01',
  ],
  'P1T2-N03': ['P1T2-N03-micro-01'],
  'P1T2-N04': ['P1T2-N04-micro-01'],
  'P1T3-N01': ['P1T3-N01-micro-01'],
  'P1T3-N02': [
    'P1T3-N02-foundation-01',
    'P1T3-N02-application-01',
    'P1T3-N02-transfer-01',
  ],
  'P1T3-N03': ['P1T3-N03-micro-01'],
  'P1T3-N04': ['P1T3-N04-micro-01'],
};

export const nodeLearningPolicies: NodeLearningPolicy[] = taskDefinitions.flatMap((task) =>
  Array.from({ length: 4 }, (_, offset): NodeLearningPolicy => {
    const index = offset + 1;
    const nodeId = `${task.prefix}-N0${index}` as P1NodeId;
    const isTaskEntry = index === 1;
    const isNodeTest = index === 2;
    const isTaskEnd = index === 4;
    const prerequisites: LearningPrerequisite[] = isTaskEntry
      ? task.upstreamPrefix
        ? [
            { nodeId: `${task.upstreamPrefix}-N02`, condition: 'formal-test-passed' },
            { nodeId: `${task.upstreamPrefix}-N04`, condition: 'professional-output-submitted-once' },
          ]
        : []
      : index === 2
        ? [{ nodeId: `${task.prefix}-N01`, condition: 'micro-practice-passed' }]
        : index === 3
          ? [
              { nodeId: `${task.prefix}-N02`, condition: 'micro-practice-passed' },
              { nodeId: `${task.prefix}-N02`, condition: 'formal-test-passed' },
            ]
          : [{ nodeId: `${task.prefix}-N03`, condition: 'micro-practice-passed' }];
    return {
      nodeId,
      taskId: task.taskId,
      publicationStatus: 'published',
      prerequisites,
      prerequisiteNodeIds: [...new Set(prerequisites.map((item) => item.nodeId))],
      requiresMicroPractice: true,
      requiredActivityIds: requiredActivityIdsByNode[nodeId],
      requiresFormalTest: isNodeTest,
      assessmentRole: isNodeTest ? 'node-test' : 'none',
      formalPassScore: isNodeTest ? 80 : undefined,
      requiresProfessionalOutput: isTaskEnd,
      requiresTeacherVerification: isTaskEnd,
      professionalOutputTitle: isTaskEnd ? task.outputTitle : undefined,
    };
  }),
);

const policyByNode = new Map(nodeLearningPolicies.map((policy) => [policy.nodeId, policy]));

export function getNodeLearningPolicy(nodeId: string): NodeLearningPolicy | undefined {
  return policyByNode.get(nodeId as P1NodeId);
}
