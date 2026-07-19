import {
  p01TeachingPackage,
  type P01TeachingPage,
} from './p01-teaching-package.ts';
import type { SceneVisualId } from './scene-visual-contract.ts';

export type P1TeachingLessonId = 'P01-L1' | 'P01-L2' | 'P02-L1' | 'P03-L1';
export type P1TeachingTaskId = 'P01' | 'P02' | 'P03';
export type TeachingScaffoldLevel = 'full' | 'guided' | 'reduced' | 'independent';
export type ClassroomPageVisualRenderer = 'scene-visual';
export type P1TeachingNodeId =
  | 'P1T1-N01' | 'P1T1-N02' | 'P1T1-N03' | 'P1T1-N04'
  | 'P1T2-N01' | 'P1T2-N02' | 'P1T2-N03' | 'P1T2-N04'
  | 'P1T3-N01' | 'P1T3-N02' | 'P1T3-N03' | 'P1T3-N04';
export type P1FormalAssessmentNodeId = 'P1T1-N02' | 'P1T2-N02' | 'P1T3-N02';

export interface P1FormalAssessmentTarget {
  kind: 'formal-assessment';
  nodeId: P1FormalAssessmentNodeId;
  gameId: `${P1FormalAssessmentNodeId}-server-assessment`;
  href: `/learn/${P1FormalAssessmentNodeId}/test`;
}

export interface P1ProfessionalOutputTarget {
  kind: 'professional-output';
  taskId: P1TeachingTaskId;
  nodeId: P1TeachingNodeId;
  href: `/learn/${P1TeachingNodeId}?mode=challenge`;
}

export interface P1TeachingPage extends P01TeachingPage {
  lessonId: P1TeachingLessonId;
  taskId: P1TeachingTaskId;
  nodeId: P1TeachingNodeId;
  canonicalActivityId?: string;
  canonicalActivityIds: string[];
  formalAssessmentNodeId?: P1FormalAssessmentNodeId;
  formalAssessment?: P1FormalAssessmentTarget;
  professionalOutputTaskId?: P1TeachingTaskId;
  professionalOutput?: P1ProfessionalOutputTarget;
  interactiveRenderer?: 'pixi-topology';
  classroomVisual: {
    renderer: ClassroomPageVisualRenderer;
    visualId: SceneVisualId;
  };
  scaffoldLevel: TeachingScaffoldLevel;
}

export interface P1TeachingLesson {
  id: P1TeachingLessonId;
  taskId: P1TeachingTaskId;
  lessonNumber: 1 | 2;
  title: string;
  objective: string;
  suggestedMinutes: 45;
  pages: P1TeachingPage[];
}

const formalAssessmentByPageId: Partial<Record<string, P1FormalAssessmentTarget>> = {
  'P01-L2-P06': formalAssessmentTarget('P1T1-N02'),
  'P02-L1-P06': formalAssessmentTarget('P1T2-N02'),
  'P03-L1-P06': formalAssessmentTarget('P1T3-N02'),
};

const professionalOutputByPageId: Partial<Record<string, P1ProfessionalOutputTarget>> = {
  'P01-L2-P05': professionalOutputTarget('P01', 'P1T1-N04'),
  'P02-L1-P05': professionalOutputTarget('P02', 'P1T2-N04'),
  'P03-L1-P05': professionalOutputTarget('P03', 'P1T3-N04'),
};

const p01NodeIdByPageId: Record<string, P1TeachingNodeId> = {
  'P01-L1-P01': 'P1T1-N01',
  'P01-L1-P02': 'P1T1-N02',
  'P01-L1-P03': 'P1T1-N02',
  'P01-L1-P04': 'P1T1-N02',
  'P01-L1-P05': 'P1T1-N02',
  'P01-L1-P06': 'P1T1-N02',
  'P01-L2-P01': 'P1T1-N02',
  'P01-L2-P02': 'P1T1-N02',
  'P01-L2-P03': 'P1T1-N03',
  'P01-L2-P04': 'P1T1-N02',
  'P01-L2-P05': 'P1T1-N04',
  'P01-L2-P06': 'P1T1-N02',
};

const p01VisualByPageId: Record<string, P1TeachingPage['classroomVisual']> = {
  'P01-L1-P01': { renderer: 'scene-visual', visualId: 'indoor-boundary' },
  'P01-L1-P02': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L1-P03': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L1-P04': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L1-P05': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L1-P06': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L2-P01': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L2-P02': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L2-P03': { renderer: 'scene-visual', visualId: 'indoor-condition' },
  'P01-L2-P04': { renderer: 'scene-visual', visualId: 'indoor-topology' },
  'P01-L2-P05': { renderer: 'scene-visual', visualId: 'indoor-evidence' },
  'P01-L2-P06': { renderer: 'scene-visual', visualId: 'indoor-topology' },
};

function formalAssessmentTarget(nodeId: P1FormalAssessmentNodeId): P1FormalAssessmentTarget {
  return {
    kind: 'formal-assessment',
    nodeId,
    gameId: `${nodeId}-server-assessment`,
    href: `/learn/${nodeId}/test`,
  };
}

function professionalOutputTarget(
  taskId: P1TeachingTaskId,
  nodeId: P1TeachingNodeId,
): P1ProfessionalOutputTarget {
  return {
    kind: 'professional-output',
    taskId,
    nodeId,
    href: `/learn/${nodeId}?mode=challenge`,
  };
}

function adaptP01Page(
  lessonId: 'P01-L1' | 'P01-L2',
  page: P01TeachingPage,
): P1TeachingPage {
  const canonicalActivityIds = page.canonicalActivityId ? [page.canonicalActivityId] : [];
  const canonicalActivityId = canonicalActivityIds.length === 1
    ? canonicalActivityIds[0]
    : undefined;
  const formalAssessment = formalAssessmentByPageId[page.id];
  const professionalOutput = professionalOutputByPageId[page.id];
  return {
    ...page,
    lessonId,
    taskId: 'P01',
    nodeId: p01NodeIdByPageId[page.id]!,
    canonicalActivityId,
    canonicalActivityIds,
    formalAssessmentNodeId: formalAssessment?.nodeId,
    formalAssessment,
    professionalOutputTaskId: professionalOutput?.taskId,
    professionalOutput,
    interactiveRenderer: canonicalActivityIds.includes('P1T1-N02-application-01')
      ? 'pixi-topology'
      : undefined,
    classroomVisual: p01VisualByPageId[page.id]!,
    scaffoldLevel: lessonId === 'P01-L1' ? 'full' : 'guided',
  };
}

type WorkplacePageContent = Pick<P1TeachingPage,
  | 'title'
  | 'projectorContent'
  | 'teacherExplanation'
  | 'caseQuestion'
  | 'typicalAnswer'
  | 'commonErrors'
  | 'followUpPrompts'
  | 'studentAction'
  | 'transition'
>;

function workplacePage(
  lessonId: 'P02-L1' | 'P03-L1',
  taskId: 'P02' | 'P03',
  nodeId: P1TeachingNodeId,
  pageNumber: number,
  suggestedMinutes: number,
  segmentId: P01TeachingPage['segmentId'],
  canonicalActivityId: string,
  classroomVisual: P1TeachingPage['classroomVisual'],
  content: WorkplacePageContent,
): P1TeachingPage {
  const id = `${lessonId}-P${String(pageNumber).padStart(2, '0')}`;
  const formalAssessment = formalAssessmentByPageId[id];
  const professionalOutput = professionalOutputByPageId[id];
  return {
    ...content,
    id,
    lessonId,
    taskId,
    nodeId,
    lessonNumber: 1,
    pageNumber,
    globalPageNumber: taskId === 'P02' ? 12 + pageNumber : 18 + pageNumber,
    suggestedMinutes,
    segmentId,
    canonicalActivityId,
    canonicalActivityIds: [canonicalActivityId],
    formalAssessmentNodeId: formalAssessment?.nodeId,
    formalAssessment,
    professionalOutputTaskId: professionalOutput?.taskId,
    professionalOutput,
    classroomVisual,
    scaffoldLevel: taskId === 'P02' ? 'reduced' : 'independent',
  };
}

const p01Lessons: P1TeachingLesson[] = p01TeachingPackage.map((lesson) => ({
  ...lesson,
  id: lesson.id as 'P01-L1' | 'P01-L2',
  taskId: 'P01',
  pages: lesson.pages.map((page) => adaptP01Page(lesson.id as 'P01-L1' | 'P01-L2', page)),
}));

const p02Pages: P1TeachingPage[] = [
  workplacePage('P02-L1', 'P02', 'P1T2-N01', 1, 5, 'learning-case', 'P1T2-N01-micro-01', { renderer: 'scene-visual', visualId: 'outdoor-boundary' }, {
    title: '接单定界：把室外采集对象落到底图',
    projectorContent: {
      title: 'HY-02室外采集底图与工单',
      material: '工单给出站点坐标、0/120/240度三个扇区、道路热点H1与H2及邻区边界；候选对象还包含站外广告牌、共享铁塔他网天线和未列入工单的河西支路。',
      visualCallouts: ['先圈定工单空间边界', '排除对象必须写明依据'],
      prompt: '哪些对象进入本次采集范围，哪些对象排除或登记待复核？',
    },
    teacherExplanation: '室外采集首先解决“到哪里、采什么”，不能看到天线就全部记录。请学生把每个候选对象回到工单坐标、扇区编号、道路热点和邻区边界；工单未授权的他网设备只记录外部环境，不进入设备采集，更不能攀爬或拆卸。教师只给边界条件，不替学生完成分类。',
    caseQuestion: '河西支路位于站点附近但不在工单边界内，共享铁塔他网天线又与目标扇区同塔，应怎样分类并说明理由？',
    typicalAnswer: '0/120/240度目标扇区、H1/H2热点及工单边界内道路进入采集范围；河西支路排除并注明“工单未授权”，他网天线只作为遮挡和共址环境记录，不采铭牌、不触碰设备；边界不清的对象登记待复核并请求工单确认。',
    commonErrors: ['把同一铁塔上的全部设备都纳入采集', '只在地图圈线，不记录排除和待复核理由'],
    followUpPrompts: ['道路跨越工单边界时，采样终点怎样确定？', '无法辨认运营商标识时，现场人员可以做什么、不能做什么？'],
    studentAction: '在底图分类六个候选对象，逐项填写纳入、排除或待复核依据。',
    transition: '范围确定后，下一页核对每个目标扇区的身份和姿态证据。',
  }),
  workplacePage('P02-L1', 'P02', 'P1T2-N02', 2, 8, 'learning-visual', 'P1T2-N02-foundation-01', { renderer: 'scene-visual', visualId: 'antenna-posture' }, {
    title: '扇区核验：把姿态参数挂到唯一对象',
    projectorContent: {
      title: '扇区2姿态证据包',
      material: '工参记录方位角120度、机械下倾2度、电下倾4度、挂高32米；现场材料为罗盘北向照片、支架刻度、RET网管截面、地面起算全景和扇区标签S2。',
      visualCallouts: ['每项数值必须带测量基准', '扇区标签把材料挂到同一对象'],
      prompt: '五份材料分别能支持哪些参数，哪一份不能被另一份替代？',
    },
    teacherExplanation: '减少支架后不再逐项报答案，让学生先建立“对象—参数—基准—材料”关系。方位角来自相对真北的水平指向，机械下倾来自支架物理刻度，电下倾来自对应扇区的RET记录，挂高必须说明起算面。相同数值并不自动属于同一扇区，S2标签和采集时间负责回指。',
    caseQuestion: 'RET显示4度、支架刻度显示2度时，能否写“总下倾6度”并结束记录？还需要核对哪些对象和基准？',
    typicalAnswer: '可分别记录机械下倾2度和电下倾4度，但合并解释前必须确认二者都属于扇区2、采集时间一致、RET未锁定旧配置，并说明挂高以塔基还是地面为起算面；不能用RET截面替代现场支架刻度，也不能只写一个总数。',
    commonErrors: ['把机械下倾和电下倾混成一个无来源数值', '挂高只写32米，不写起算面和测量材料'],
    followUpPrompts: ['罗盘照片没有真北校准记录时，方位角状态是什么？', 'RET时间比现场照片早一周，怎样登记一致性缺口？'],
    studentAction: '把五份材料挂接到方位角、机械下倾、电下倾和挂高字段，并登记基准缺口。',
    transition: '单项参数已核验；下一页把水平指向、垂直姿态与道路热点重建成关系。',
  }),
  workplacePage('P02-L1', 'P02', 'P1T2-N02', 3, 8, 'learning-procedure', 'P1T2-N02-application-01', { renderer: 'scene-visual', visualId: 'antenna-posture' }, {
    title: '关系重建：判断主瓣是否覆盖目标道路',
    projectorContent: {
      title: '扇区2与投诉道路方向关系',
      material: '扇区2方位角120度，道路中心线125度，机械下倾2度、电下倾4度、挂高32米；热点H2位于站点东南620米，现场罗盘校准记录缺失。',
      visualCallouts: ['先处理水平夹角，再检查垂直姿态', '缺基准时结论保留证据缺口'],
      prompt: '按什么顺序重建方位角、下倾、挂高与H2的关系？',
    },
    teacherExplanation: '要求学生按岗位顺序推理：确认扇区身份，计算120度主瓣与125度道路中心线的水平关系，再结合机械与电下倾、挂高和距离判断垂直覆盖可能性，最后检查测量基准。这里不能把5度夹角直接等同于覆盖良好；缺少罗盘校准时，最多形成待复核假设。',
    caseQuestion: '主瓣与道路仅相差5度，为什么仍不能直接写“扇区2覆盖H2满足”？请给出关系链和结论状态。',
    typicalAnswer: '120度与125度说明H2大致处于水平主瓣方向，但覆盖还受6度组合下倾、32米挂高、620米距离及遮挡影响；罗盘又缺校准记录，因此当前只能写“方向关系初步一致、覆盖效果待复核”，并补做校准测向和H2对照采样。',
    commonErrors: ['只比较方位角，忽略下倾、挂高和距离', '看到5度夹角较小就把覆盖假设写成测量事实'],
    followUpPrompts: ['若道路中心线改为205度，判断如何变化？', '若H2处于楼体背后，哪组对照点能验证遮挡影响？'],
    studentAction: '排序五个关系要素，写出每一步依据、结论边界和最小补证动作。',
    transition: '关系链形成后，下一页把现场风险转换为满足、异常、待复核或无权操作。',
  }),
  workplacePage('P02-L1', 'P02', 'P1T2-N03', 4, 7, 'learning-correction', 'P1T2-N03-micro-01', { renderer: 'scene-visual', visualId: 'outdoor-obstacle' }, {
    title: '风险判断：区分事实异常与无权操作',
    projectorContent: {
      title: '遮挡、美化罩与登塔限制',
      material: '楼体位于主瓣与H2之间；美化罩遮住天线刻度且工单禁止拆罩；塔梯安全锁未授权开启；RET记录可读但时间早于现场采集七天。',
      visualCallouts: ['风险结论必须对应可见事实', '安全与权限边界优先于补采便利'],
      prompt: '四项材料分别应判为满足、异常、待复核还是无权操作？',
    },
    teacherExplanation: '教师先让学生独立判定，再追问触发条件。楼体遮挡是可见风险事实，但是否造成指标劣化仍需采样；美化罩和塔梯限制属于权限边界，不得通过拆罩或强行登塔补证；过期RET是待复核，不等同于当前异常。课堂讲评必须把“看见问题”“证据不足”“禁止操作”分开。',
    caseQuestion: '面对遮挡楼体、禁止拆卸的美化罩、未授权塔梯和过期RET，四条记录应怎样写才可执行又不越权？',
    typicalAnswer: '楼体登记为覆盖风险并布设楼前、楼后对照点；美化罩和塔梯均记“无权操作”，改用外部测向、工参和授权复核；七天前RET记“待复核”，请求当前截面。只有发现参数与当前授权工参冲突时才写异常，不能把不可见直接写成异常。',
    commonErrors: ['为了读刻度建议拆除美化罩或强行登塔', '把过期记录、缺照片和真实参数冲突都统称异常'],
    followUpPrompts: ['无权操作状态下仍可采集哪些外围证据？', '什么新材料会把待复核升级为异常？'],
    studentAction: '为四项现场材料选择状态，填写触发事实、禁止动作和替代复核路径。',
    transition: '风险与权限已明确；下一页修订一份无法验证风险假设的路线表。',
  }),
  workplacePage('P02-L1', 'P02', 'P1T2-N04', 5, 10, 'learning-practice', 'P1T2-N04-micro-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '成果修订：让路线真正穿过风险边界',
    projectorContent: {
      title: 'V1路线与覆盖采集表缺陷',
      material: 'V1选择路线A并绕开H2遮挡区，只安排一个热点CQT点，未设楼前楼后对照点，缺少时间窗、服务小区锁定条件和RSRP/SINR验收字段。',
      visualCallouts: ['路线要能验证前页风险假设', '修订字段需支持现场执行与复核'],
      prompt: '请把V1改成可验证遮挡影响的路线和采样表。',
    },
    teacherExplanation: '真实成果修订不是把路线名称换掉，而是让采样设计回答问题。路线应穿过遮挡边界，CQT点覆盖H2，并设置楼体两侧对照点；同时固定时间窗、终端业务和服务小区口径，记录RSRP、SINR及业务现象。教师要求学生逐字段说明V1缺陷与V2改动，保留版本差异。',
    caseQuestion: '路线A、B、C中，为什么穿过遮挡边界且含热点和对照点的路线B更适合？V2还必须补哪些字段？',
    typicalAnswer: '选择路线B，因为它从楼前经过遮挡边界到楼后并覆盖H2，可形成风险点与对照点；V2补充楼前、边界、楼后和H2点位，固定晚高峰时间窗、同终端同业务和服务小区，采集RSRP、SINR、吞吐及现象，并保留V1/V2字段差异。',
    commonErrors: ['选择最短路线而不是能验证风险的路线', '只增加采样点，不补时间窗、对照条件和验收指标'],
    followUpPrompts: ['路线受施工封闭时，替代路线怎样保持同一验证逻辑？', '哪些字段缺失会让V2仍无法复核？'],
    studentAction: '修订路线、点位、时间窗、对照条件和指标字段，提交V1/V2差异说明。',
    transition: '路线表可执行后，最后把美化罩场景的替代证据并入任务成果。',
  }),
  workplacePage('P02-L1', 'P02', 'P1T2-N02', 6, 7, 'learning-output', 'P1T2-N02-transfer-01', { renderer: 'scene-visual', visualId: 'antenna-posture' }, {
    title: '任务收束：形成室外站点与覆盖采集表',
    projectorContent: {
      title: '美化罩站点迁移材料包',
      material: '新站点天线藏于美化罩内且禁止拆卸，可获得站点工单、扇区标签、外部罗盘测向、当前RET参数、挂高测量、周边遮挡记录和修订后采样路线。',
      visualCallouts: ['不得用不可见读数冒充现场事实', '成果同时保留结论、缺口与替代动作'],
      prompt: '怎样在不拆罩前提下完成可复核记录并交付任务成果？',
    },
    teacherExplanation: '收束时让学生独立把范围、扇区姿态、方向关系、风险状态和路线修订合并。美化罩内读数不可见，就明确写无权操作与不可见边界，再用工单、外部测向、当前RET、挂高及对照采样交叉复核。最终成果是室外站点与覆盖采集表，不是“现场正常”一句话。',
    caseQuestion: '哪些字段可以由外部材料确认，哪些字段必须保留待复核或无权操作，最终成果如何体现这一边界？',
    typicalAnswer: '工单与扇区标签确认对象，外部罗盘和当前RET分别支持水平指向与电下倾，挂高和遮挡记录描述环境；罩内机械刻度无法读取，记“无权操作/待授权复核”。成果表挂接每项材料、路线与点位，列出缺口、责任动作和验收指标。',
    commonErrors: ['把替代证据写成已经看到罩内机械刻度', '成果只列参数，不含路线、风险、缺口和复核动作'],
    followUpPrompts: ['教师复核时怎样快速定位每个参数来源？', '什么事件发生后才能把待复核字段改为满足？'],
    studentAction: '汇总六页记录，生成室外站点与覆盖采集表并完成证据挂接。',
    transition: 'P02成果保留为项目中间产出；下一课时用同样的可复核原则处理投诉材料。',
  }),
];

const p03Pages: P1TeachingPage[] = [
  workplacePage('P03-L1', 'P03', 'P1T3-N01', 1, 5, 'learning-case', 'P1T3-N01-micro-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '受理投诉：从口述中提取可复测事实',
    projectorContent: {
      title: '用户原始口述（未整理）',
      material: '“最近开会老卡，尤其下班前，在公司高层最明显，有时重进就好了。”工单另附工作日18:00—19:00、A座18层会议室、视频会议5次中4次卡顿；终端型号和5G模式未记录。',
      visualCallouts: ['材料未经分类，请独立提取', '不要提前假设网络原因'],
      prompt: '请把口述改写为可执行的投诉事实和追问清单。',
    },
    teacherExplanation: 'P03进入独立支架：投屏只给原始材料，不先显示分类答案。教师让学生自己提取发生时间、地点、业务、现象、频次和缺失条件，并删除“网络差”等原因猜测。可复测事实必须让另一名工程师知道何时、何地、用什么终端业务、观察什么现象。',
    caseQuestion: '原口述中哪些是可直接记录的投诉事实，哪些仍模糊，至少要向用户追问哪两项信息？',
    typicalAnswer: '可记录工作日18:00—19:00、A座18层会议室、视频会议、5次中4次卡顿以及重进后偶尔恢复；“最近”“高层”“老卡”需替换为明确口径。必须追问终端型号、系统版本、是否锁定5G、账号或会议业务版本及最近一次发生时刻。',
    commonErrors: ['把用户感受直接改写成“网络拥塞”原因', '遗漏终端和网络模式仍宣布可以复现'],
    followUpPrompts: ['“下班前”怎样转成可执行时间窗？', '用户无法提供终端型号时，现场如何补采而不猜测？'],
    studentAction: '独立填写投诉事实、模糊项和追问清单，保留原话与结构化记录对应。',
    transition: '事实边界明确后，下一页判断四份复测记录是否真正保持同条件。',
  }),
  workplacePage('P03-L1', 'P03', 'P1T3-N02', 2, 8, 'learning-visual', 'P1T3-N02-foundation-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '复测比对：判断条件等价而非只看结果',
    projectorContent: {
      title: 'A、B、C、D四份复测记录',
      material: 'A在原会议室用原终端运行同一视频会议；B移到一层大厅；C改为网页测速；D换用工程测试机。A未出现卡顿，B、C、D均流畅。',
      visualCallouts: ['四份记录等待逐项比对', '“流畅”不自动等于未复现'],
      prompt: '哪份记录可以支持“同条件未复现”，其余记录为什么不能？',
    },
    teacherExplanation: '不要先向学生展示“同地点、同业务、同终端”三栏，让他们从材料中自己建立比较维度。只有地点、业务和终端等关键条件保持一致，结果未出现时才能写同条件未复现；条件变化的记录只能作为旁证。教师追问每个“不等价”具体改变了什么。',
    caseQuestion: 'A、B、C、D中哪一份具有同条件复测资格？其余三份即使流畅，为什么也不能否定投诉？',
    typicalAnswer: 'A保持原会议室、原终端和同一视频会议，可记录“本次同条件未复现”；B改变地点，C改变业务，D改变终端，都只能说明相应新条件下流畅，不能用于否定原投诉。四份记录仍需同时注明时段、网络模式和服务小区。',
    commonErrors: ['看到任一流畅结果就写投诉不成立', '只核对地点，忽略业务、终端和时段变化'],
    followUpPrompts: ['A的复测时段改到上午，结论还成立吗？', '怎样利用B、C、D帮助设计后续排查而不误作结论？'],
    studentAction: '逐份标出变化条件，选择可比记录并写出结论边界和补测要求。',
    transition: '可比条件确定后，下一页把用户操作、业务现象和网络采样重建到同一时间轴。',
  }),
  workplacePage('P03-L1', 'P03', 'P1T3-N02', 3, 8, 'learning-procedure', 'P1T3-N02-application-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '复现脚本：重建15分钟事件时间轴',
    projectorContent: {
      title: '18:00—18:15现场复测原始记录',
      material: '18:00进入会议，18:04开始共享屏幕，18:07画面卡顿；业务日志在18:07:12报重传，采样记录18:07服务小区S2、RSRP -93dBm、SINR -3dB，18:09恢复。',
      visualCallouts: ['先自行排列事件', '每个时刻需能回到原始材料'],
      prompt: '请形成可重复执行并能定位18:07现象的复测脚本。',
    },
    teacherExplanation: '时间轴不是把日志复制到一列，而是把用户动作、业务事件、服务小区和无线指标按统一时钟对齐。教师要求学生说明采样间隔、设备时钟校准和每一步复测动作；若日志时间源不同，应登记偏差，不能强行把相近时刻当成因果。',
    caseQuestion: '怎样安排15分钟步骤并对齐18:07的业务重传、服务小区和无线指标，使另一组能够重复执行？',
    typicalAnswer: '18:00核对地点终端网络模式并入会，18:04执行共享屏幕，按秒级统一时钟连续采集业务日志、服务小区、RSRP和SINR；18:07:12标记卡顿与重传并保留前后至少两分钟窗口，18:09记录恢复，最后校验设备时钟偏差并重复一次。',
    commonErrors: ['只记卡顿时刻，不保留前后窗口和用户动作', '不同设备时间未校准却直接写成因果链'],
    followUpPrompts: ['若业务日志慢20秒，时间轴怎样标记？', '复测一次未出现卡顿时，下一轮应保持哪些条件不变？'],
    studentAction: '排序原始事件，补齐15分钟操作、采样、校时和重复步骤并提交时间轴。',
    transition: '时间轴建立后，下一页用同窗材料进行交叉判断，并保留支持与冲突。',
  }),
  workplacePage('P03-L1', 'P03', 'P1T3-N03', 4, 8, 'learning-correction', 'P1T3-N03-micro-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '交叉判断：保留支持线索与冲突证据',
    projectorContent: {
      title: '18:07同窗材料组',
      material: '业务日志记录卡顿和重传；同窗SINR为-3dB；服务小区拥塞KPI升高；告警系统无当前告警；18:09业务恢复但拥塞KPI仍高。',
      visualCallouts: ['材料可能相互支持也可能冲突', '请先形成自己的判断链'],
      prompt: '哪些结论能由多源材料支持，哪些仍不能确定？',
    },
    teacherExplanation: '独立学习阶段不预先给材料贴“业务侧”“网络侧”答案标签。学生要自己识别来源、对齐时窗和服务小区，再判断证据是否独立。SINR低和拥塞KPI高与卡顿同窗，只能形成无线质量或容量相关线索；无告警不等于网络正常，恢复时刻不一致也必须保留。',
    caseQuestion: '现有五条材料可以支持怎样的职业结论？为什么不能直接写“拥塞导致卡顿”或“无告警所以网络正常”？',
    typicalAnswer: '卡顿、重传、低SINR和拥塞KPI在18:07同窗且服务小区一致，支持“无线质量或容量问题相关”的排查线索；无当前告警不能排除性能劣化，18:09恢复与KPI仍高又提示单因果不足。结论应保留两种假设并安排同条件复测和小区负荷核查。',
    commonErrors: ['用单一KPI直接宣布根因', '把无告警解释为全部网络指标正常'],
    followUpPrompts: ['哪条新证据能增强拥塞假设？', '如果SINR正常但重传持续，应把排查转向哪里？'],
    studentAction: '组织五条材料，写出支持、冲突、当前结论边界和下一步验证动作。',
    transition: '判断边界明确后，下一页修订一份只有“建议优化”的不可派单调查单。',
  }),
  workplacePage('P03-L1', 'P03', 'P1T3-N04', 5, 9, 'learning-practice', 'P1T3-N04-micro-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '调查单修订：把“建议优化”改成可派单闭环',
    projectorContent: {
      title: 'V1投诉信息调查单',
      material: 'V1只写“晚高峰视频卡顿，建议优化”。附件已有18:07业务日志、无线采样和KPI；缺少责任人、24小时时限、同条件复测、用户回访、验收条件和版本差异。',
      visualCallouts: ['原表无法执行或验收', '修订必须引用现有材料'],
      prompt: '请把V1修成可派单、可复测、可回访的V2调查单。',
    },
    teacherExplanation: '成果表必须驱动下一岗位动作。学生需要把模糊建议拆成材料索引、当前判断、责任角色、完成时限、复测方法、回访方式和验收标准；同时保留“尚未确定根因”的边界。教师要求逐字段指出V1缺陷，不能只把一句话扩写得更长。',
    caseQuestion: 'V2怎样写才能让无线优化人员接单、测试人员复测、客服回访，并让审核者判断是否闭环？',
    typicalAnswer: 'V2引用18:07日志、采样和KPI，结论写“无线质量或容量相关线索，根因待验证”；派给无线优化负责人24小时内核查S2负荷与参数，测试人员按同地点同业务同终端复测两次，客服回访确认现象；以无卡顿、日志无重传且指标达标作为验收条件。',
    commonErrors: ['责任人写成笼统的“相关人员”', '只有优化动作，没有复测、回访和可判定验收条件'],
    followUpPrompts: ['24小时内无法完成现场复测时怎样登记？', '哪些字段变化必须进入V1/V2差异？'],
    studentAction: '修订材料索引、判断、责任人、时限、复测、回访和验收字段，保留版本差异。',
    transition: '调查单已经可派单；最后把方法迁移到高速移动投诉并形成P03成果。',
  }),
  workplacePage('P03-L1', 'P03', 'P1T3-N02', 6, 7, 'learning-output', 'P1T3-N02-transfer-01', { renderer: 'scene-visual', visualId: 'route' }, {
    title: '迁移交付：完成投诉信息调查单',
    projectorContent: {
      title: '高速列车掉线迁移案例',
      material: '投诉发生于G218次固定运行区段和18:40左右，用户使用同一终端通话；现有材料含车次、区段、服务小区切换轨迹和掉线时刻，但缺少重复路线与回访记录。',
      visualCallouts: ['移动场景条件等待学生重建', '交付需保留不确定性与下一动作'],
      prompt: '怎样把固定地点方法迁移为可重复的移动场景调查？',
    },
    teacherExplanation: '迁移时不提示固定表格答案，让学生识别移动场景必须用车次、运行区段、方向和时间窗替代固定地点，同时保持终端与业务一致，连续记录服务小区和切换轨迹。最终投诉信息调查单应合并事实、复现脚本、时间轴、交叉判断、派单和回访，不得把演示材料写成已经闭环。',
    caseQuestion: '高速移动场景中，哪些条件必须固定，哪些轨迹必须连续记录，怎样判断一次复测是否具备可比性？',
    typicalAnswer: '固定车次、运行方向、区段、18:40时间窗、同一终端和通话业务，连续记录定位、服务小区、切换事件、无线指标和掉线时刻；至少重复同一路线并校准时钟。调查单保留缺少重复路线与回访的状态，派给测试和优化责任人后再验收。',
    commonErrors: ['仍把移动投诉写成一个固定坐标点', '只有掉线截图，没有车次区段、切换轨迹和重复条件'],
    followUpPrompts: ['列车运行晚点时，时间窗如何校正？', '重复路线未再掉线时，调查单应写未复现还是已解决？'],
    studentAction: '独立形成迁移方案，并汇总六页记录生成可派单的投诉信息调查单。',
    transition: 'P03成果进入5G网络信息采集成果包，与P01、P02成果共同接受项目级复核。',
  }),
];

const p02Lesson: P1TeachingLesson = {
  id: 'P02-L1',
  taskId: 'P02',
  lessonNumber: 1,
  title: '第三课时：完成室外站点与覆盖采集',
  objective: '能够核对扇区姿态、识别覆盖风险并修订可执行的采集路线。',
  suggestedMinutes: 45,
  pages: p02Pages,
};

const p03Lesson: P1TeachingLesson = {
  id: 'P03-L1',
  taskId: 'P03',
  lessonNumber: 1,
  title: '第四课时：完成投诉信息调查',
  objective: '能够提取投诉事实、复现同条件场景并形成可派单调查记录。',
  suggestedMinutes: 45,
  pages: p03Pages,
};

export const p1TeachingPackage: P1TeachingLesson[] = [
  ...p01Lessons,
  p02Lesson,
  p03Lesson,
];

const lessonById = new Map(p1TeachingPackage.map((lesson) => [lesson.id, lesson]));
const formalAssessmentPageByNodeId = new Map(
  p1TeachingPackage.flatMap(({ pages }) => pages)
    .filter((page): page is P1TeachingPage & {
      formalAssessmentNodeId: P1FormalAssessmentNodeId;
    } => page.formalAssessmentNodeId !== undefined)
    .map((page) => [page.formalAssessmentNodeId, page]),
);
const professionalOutputPageByTaskId = new Map(
  p1TeachingPackage.flatMap(({ pages }) => pages)
    .filter((page): page is P1TeachingPage & {
      professionalOutputTaskId: P1TeachingTaskId;
    } => page.professionalOutputTaskId !== undefined)
    .map((page) => [page.professionalOutputTaskId, page]),
);

export function teachingLessonFor(lessonId: P1TeachingLessonId): P1TeachingLesson {
  return lessonById.get(lessonId)!;
}

export function teachingPageFor(
  lessonId: P1TeachingLessonId,
  pageIndex: number | undefined,
): P1TeachingPage {
  const lesson = teachingLessonFor(lessonId);
  const index = Math.max(0, Math.min(lesson.pages.length - 1, Math.trunc(pageIndex ?? 0)));
  return lesson.pages[index]!;
}

export function teachingPageCountFor(lessonId: P1TeachingLessonId): number {
  return teachingLessonFor(lessonId).pages.length;
}

export function pageWithFormalAssessment(
  nodeId: P1FormalAssessmentNodeId,
): P1TeachingPage {
  return formalAssessmentPageByNodeId.get(nodeId)!;
}

export function pageWithProfessionalOutput(
  taskId: P1TeachingTaskId,
): P1TeachingPage {
  return professionalOutputPageByTaskId.get(taskId)!;
}
