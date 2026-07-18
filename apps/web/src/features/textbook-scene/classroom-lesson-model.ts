import type { LessonPhase } from '@/platform/models';

export type LessonSegmentId =
  | 'learning-case'
  | 'learning-visual'
  | 'learning-procedure'
  | 'learning-correction'
  | 'learning-practice'
  | 'learning-output';

export interface ClassroomLessonSegment {
  id: LessonSegmentId;
  label: string;
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  checkpoint: string;
  evidence: string;
}

export const p01n02LessonSegments: ClassroomLessonSegment[] = [
  {
    id: 'learning-case',
    label: '问题',
    eyebrow: '现场任务',
    title: '照片怎样证明设备、槽位与端口属于同一条链？',
    lead: '机房照片不是“拍到设备”就完成。必须先确定对象，再把机柜位置、设备身份和端口去向串成可复核证据。',
    points: ['先判断照片中的对象和空间位置', '再确认设备型号与槽位编号', '最后追踪端口标签和走线方向'],
    checkpoint: '只拍设备近景，为什么不能证明它属于机柜02？',
    evidence: '机柜全景、设备铭牌、槽位编号和端口近景必须能够互相回指。',
  },
  {
    id: 'learning-visual',
    label: '看图',
    eyebrow: '拓扑读图',
    title: '沿物理链识别四类关键对象',
    lead: '从左向右阅读设备链：机柜02提供空间定位，BBU槽位3确认基带设备，AAU/RRU承接射频链路，端口与供电接地完成运行关系。',
    points: ['蓝绿色光纤链路连接 BBU 与 AAU/RRU', '射频端口必须同时看端口号和线缆去向', '-48V供电与接地属于运行条件，不可遗漏'],
    checkpoint: '当前高亮对象是 BBU 槽位3，它需要哪两类照片才能被复核？',
    evidence: '全景确定位置，铭牌确定身份，端口近景确定连接。三类证据缺一不可。',
  },
  {
    id: 'learning-procedure',
    label: '步骤',
    eyebrow: '工程方法',
    title: '按“定位—核验—追踪”完成判断',
    lead: '判断顺序不能颠倒。先用全景定位机柜，再用铭牌和槽位号核验设备，最后沿端口标签追踪光纤、射频、电源与接地。',
    points: ['定位：站点、机房、机柜编号同时入镜', '核验：设备铭牌与槽位编号一一对应', '追踪：端口标签、出线方向和对端对象连续可见'],
    checkpoint: '如果先拍端口、后补机柜全景，最容易丢失哪种关系？',
    evidence: '每一步都形成可回查索引，照片序号与采集表字段保持一致。',
  },
  {
    id: 'learning-correction',
    label: '纠偏',
    eyebrow: '反例诊断',
    title: '“设备拍清楚了”仍可能是不合格证据',
    lead: '常见错误是只有设备近景，没有柜号、槽位号或端口去向。照片清晰不等于关系清晰，无法回到现场对象的照片不能支撑结论。',
    points: ['反例：铭牌清楚，但不知道设备位于哪个机柜', '反例：端口清楚，但没有线缆去向和对端标签', '修正：补拍带参照物的中景与连续走线近景'],
    checkpoint: '找出当前证据链中最可能造成“设备孤证”的缺口。',
    evidence: '纠偏后的证据应同时回答“是谁、在哪里、连向哪里”。',
  },
  {
    id: 'learning-practice',
    label: '练习',
    eyebrow: '即时练习',
    title: '把照片证据连接到正确对象',
    lead: '先完成课堂连线、选择与翻卡练习，再进入设备证据链 Pixi 测试。系统记录正确率、用时和错因，用于教师讲评。',
    points: ['连线：对象与照片证据建立对应', '选择：判断缺失字段会造成什么风险', '翻卡：匹配设备铭牌、端口标签和采集字段'],
    checkpoint: '练习不是背答案，而是验证你能否独立恢复设备关系。',
    evidence: '练习过程形成辅助证据；正式 Pixi 测试分数达到80分才通过。',
  },
  {
    id: 'learning-output',
    label: '产出',
    eyebrow: '节点证据',
    title: '整理一条可复核的设备拓扑节点证据记录',
    lead: '本节点把对象、位置、链路和影像索引整理为节点证据记录，汇入P01 N04成果表；它用于支撑后续任务归档，不在N02单独形成任务级专业产出。',
    points: ['对象：机柜02、BBU槽位3、AAU/RRU和端口链', '证据：照片编号、铭牌字段、端口标签和走线方向', '结论：关系是否闭合、缺口在哪里、下一步怎么复核'],
    checkpoint: '用一句职业化结论说明当前链路是否具备复核条件。',
    evidence: '记录完成后保留为N02学习证据；到P01 N04再与运行条件、影像索引和归档结论合并。',
  },
];

export function lessonSegmentAt(actionIndex: number | undefined): ClassroomLessonSegment {
  const index = Math.max(0, Math.min(p01n02LessonSegments.length - 1, Math.trunc(actionIndex ?? 0)));
  return p01n02LessonSegments[index]!;
}

export function phaseLabel(phase: LessonPhase | undefined): string {
  const labels: Record<LessonPhase, string> = {
    prepare: '课前准备',
    lecture: '教师讲解',
    question: '课堂提问',
    practice: '学生练习',
    challenge: '正式测试',
    review: '教师讲评',
    close: '本课完成',
  };
  return labels[phase ?? 'prepare'];
}

export {
  p01TeachingPackage,
  teachingPageAt,
  type P01TeachingLesson,
  type P01TeachingPage,
} from './p01-teaching-package.ts';

export {
  p1TeachingPackage,
  pageWithFormalAssessment,
  pageWithProfessionalOutput,
  teachingLessonFor,
  teachingPageCountFor,
  teachingPageFor,
  type P1TeachingLesson,
  type P1TeachingLessonId,
  type P1TeachingNodeId,
  type P1TeachingPage,
  type P1TeachingTaskId,
  type P1FormalAssessmentNodeId,
  type P1FormalAssessmentTarget,
  type P1ProfessionalOutputTarget,
  type TeachingScaffoldLevel,
} from './p1-teaching-package.ts';
