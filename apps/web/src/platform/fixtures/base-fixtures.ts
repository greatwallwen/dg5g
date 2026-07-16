import type { AbilityNode, Course, Project, Task } from '../models';
import { activeDemoProjectId, activeDemoTaskId } from './ids';

export const course: Course = {
  courseId: '5g-network-optimization-advanced',
  title: '5G网络优化（高级）',
  badge: '数字教材',
  description: '围绕信息采集、网络测试、信息管理、端到端优化、性能提升和信令分析，构建学生自主学习、课堂跟随与教师监督的一体化课程。',
  headline: '把工程能力图谱变成可跟学、可练习、可评价的课程',
  subhead: '学生先理解能力路线，再进入自学、课堂跟随、现场证据和实训练习；教师负责监督进度、组织讲评和个性化辅导。',
  projectIds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  focusProjectId: activeDemoProjectId,
  focusTaskId: activeDemoTaskId,
  stats: [
    { label: '机制样例', value: 'P1' },
    { label: '能力节点', value: '12' },
    { label: '端侧呈现', value: '4端' },
    { label: '门禁证据', value: '8类' },
  ],
};

export const projects: Project[] = [
  project('P1', '5G网络信息采集', '当前教材任务 · 可进入学习', 'active', ['P1-T1', 'P1-T2', 'P1-T3'], '识别站点、设备、照片、坐标和日志，形成可复核的现场信息记录。', '采集'),
  project('P2', '5G网络测试', '整书结构预置 · 测试链路', 'locked', [], '用路线、业务脚本和采样结果解释覆盖、质量与体验。', '测试'),
  project('P3', '5G网络信息管理', '整书结构预置 · 数据治理', 'locked', [], '让网管、参数、工单和版本信息可追溯。', '管理'),
  project('P4', '5G端到端网络优化', '整书结构预置 · 端到端优化', 'locked', [], '从优化实施到结果验证，形成端到端优化闭环。', '优化'),
  project('P5', '5G全网性能提升', '整书结构预置 · 性能提升', 'locked', [], '面向全网指标、容量和体验的持续提升。', '提升'),
  project('P6', '5G信令分析', '整书结构预置 · 信令诊断', 'locked', [], '通过信令链路定位复杂故障和体验问题。', '信令'),
];

export const tasks: Task[] = [
  {
    taskId: 'P1-T1',
    projectId: 'P1',
    title: '室内环境信息采集',
    subtitle: '从站点到证据链',
    goal: '确认室内站点、机房、设备和配套条件，形成可复核的现场采集记录。',
    output: ['室内站点信息表', '设备与配套照片组', '坐标与日志核对记录'],
    nodeIds: ['P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04'],
    evidenceFrom: '现场站点、设备铭牌、GPS坐标、采集日志',
    conclusion: '站址、设备、照片、坐标和日志能够互相印证，采集记录可进入复核。',
    metrics: [],
    standards: ['采集对象清晰', '照片与编号对应', '坐标和日志可复核'],
  },
  {
    taskId: 'P1-T2',
    projectId: 'P1',
    title: '室外环境信息采集',
    subtitle: '从路线到覆盖场景',
    goal: '采集室外天线、覆盖环境和周边场景信息，为后续路测与优化判断提供依据。',
    output: ['室外天线记录', '覆盖场景照片组', '周边干扰与遮挡说明'],
    nodeIds: ['P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04'],
    evidenceFrom: '站点外观、天线方向、周边建筑、道路场景',
    conclusion: '室外环境信息完整，能够支撑后续测试路线和覆盖判断。',
    metrics: [],
    standards: ['位置关系清晰', '遮挡与干扰记录明确', '照片可对应现场对象'],
  },
  {
    taskId: 'P1-T3',
    projectId: 'P1',
    title: '投诉信息采集',
    subtitle: '从用户描述到问题线索',
    goal: '把投诉描述拆成时间、地点、业务、终端和网络证据，形成可派单复核的信息链。',
    output: ['投诉信息链', '业务与终端记录', '可复核问题线索'],
    nodeIds: ['P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04'],
    evidenceFrom: '投诉工单、用户描述、终端信息、网络记录',
    conclusion: '投诉信息能够定位到可复核的时间、地点、业务和网络线索。',
    metrics: [],
    standards: ['字段完整', '线索可复核', '问题边界清晰'],
  },
];

export const nodes: AbilityNode[] = [
  abilityNode('P1-T1', 'P1T1-N01', 1, '室内资源边界', '确认站点、机房和任务采集范围', 'active'),
  abilityNode('P1-T1', 'P1T1-N02', 2, '设备拓扑', '核对机柜、设备、槽位、端口和连接方向', 'next'),
  abilityNode('P1-T1', 'P1T1-N03', 3, '运行条件', '记录传输、电源、接地、温控和走线条件', 'next'),
  abilityNode('P1-T1', 'P1T1-N04', 4, '证据与归档', '让对象、照片、编号、坐标和日志互相印证', 'next'),
  abilityNode('P1-T2', 'P1T2-N01', 1, '室外覆盖边界', '确认站点、扇区、道路和邻区空间边界', 'active'),
  abilityNode('P1-T2', 'P1T2-N02', 2, '天线姿态', '记录方位角、下倾角、挂高和扇区编号', 'next'),
  abilityNode('P1-T2', 'P1T2-N03', 3, '场景与遮挡', '识别建筑遮挡、道路热点和传播环境', 'next'),
  abilityNode('P1-T2', 'P1T2-N04', 4, '风险路线', '把室外证据转换为DT/CQT验证路线', 'next'),
  abilityNode('P1-T3', 'P1T3-N01', 1, '拆解投诉描述', '把用户描述拆成时间、地点、业务和现象', 'active'),
  abilityNode('P1-T3', 'P1T3-N02', 2, '补齐终端业务', '核对终端型号、业务类型和发生频次', 'next'),
  abilityNode('P1-T3', 'P1T3-N03', 3, '关联网络证据', '关联小区、KPI、日志和工单线索', 'next'),
  abilityNode('P1-T3', 'P1T3-N04', 4, '形成复核线索', '输出可派单、可定位、可复核的问题线索', 'next'),
];

function project(projectId: string, title: string, subtitle: string, status: Project['status'], taskIds: string[], summary: string, role: string): Project {
  return { projectId, title, subtitle, status, taskIds, summary, role };
}

function abilityNode(taskId: string, nodeId: string, index: number, title: string, goal: string, status: AbilityNode['status']): AbilityNode {
  const task = tasks.find((item) => item.taskId === taskId);
  return {
    nodeId,
    index,
    taskId,
    title,
    shortTitle: title,
    goal,
    action: '读取证据、判断边界、形成表达',
    output: `${title}证据与结论`,
    assessment: '证据一致、边界清楚、表达规范',
    status,
    sourceBasis: ['5G网络优化（高级）原始教材', '岗位任务：网络规划与优化前置信息采集', ...(task?.standards ?? [])],
    workProcess: task?.title ?? '5G网络信息采集',
    resourcePolicy: '每个节点至少绑定学生正文、课堂跟随活动、教师授课页和投屏页四类资源。',
    reviewStatus: nodeId.endsWith('N01') ? 'approved' : 'review',
    versionTag: nodeId.endsWith('N01') ? 'v1.0-demo-approved' : 'v1.0-demo-review',
  };
}
