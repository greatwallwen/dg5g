import type { CapabilityMapModel, GraphData, SemanticEdge } from '../models';
import { nodes, projects, tasks } from './base-fixtures';
import { assessments, resources } from './learning-fixtures';
import { curriculumGraphNodes, curriculumSemanticEdges, expertCapabilitySvgSrc } from './curriculum-graph-fixtures';

export const semanticEdges: SemanticEdge[] = curriculumSemanticEdges;

export const graphData: GraphData = {
  projects,
  tasks,
  nodes,
  semanticEdges,
  edges: semanticEdges,
  bindings: resources,
  routes: resources.map((item) => item.routeTarget),
  views: [
    { id: 'route', title: '能力路线', focusNodeId: 'P1T1-N01' },
    { id: 'evidence', title: '证据链路', focusNodeId: 'P1T1-N04' },
  ],
  curriculumNodes: curriculumGraphNodes,
  expertSvgSrc: expertCapabilitySvgSrc,
};

export const courseCapabilityMap: CapabilityMapModel = {
  chapterId: 'course',
  title: '5G网络优化课程能力图谱',
  svgSrc: '/media/home/capability-map-expert-readable-v2.svg',
  chapters: projects,
  tasks,
  nodes,
  semanticEdges,
  routeLine: [
    { id: 'course-projects', label: '项目主线', summary: '按信息采集、网络测试、信息管理、端到端优化、性能提升和信令分析推进。' },
    { id: 'course-knowledge', label: '知识模型', summary: '把DT/CQT、KPI、网管、参数、信令和闭环判断串成可复用模型。' },
    { id: 'course-evidence', label: '工程证据', summary: '用照片、日志、指标、表单和报告支撑每个判断。' },
    { id: 'course-assessment', label: '成果评价', summary: '用可提交、可复核、可讲评的成果确认能力达成。' },
  ],
  taskNodes: projects.map((item) => ({ id: item.projectId, label: item.role, status: item.status })),
  resources,
  assessmentOutputs: assessments,
};

export const chapterCapabilityMaps: CapabilityMapModel[] = [
  capabilityMap('ch1', '5G网络信息采集', '/media/capability-maps/ch1-module-map-readable-v2.svg', '从站址、设备、照片、坐标和日志形成可复核资料链。'),
  capabilityMap('ch2', '5G网络测试', '/media/capability-maps/ch2-module-map-readable-v2.svg', '从测试准备、DT/CQT、业务脚本和KPI采样进入测试报告。'),
  capabilityMap('ch3', '5G网络信息管理', '/media/capability-maps/ch3-module-map-readable-v2.svg', '把网管、参数、工单和版本信息整理成可追溯证据链。'),
  capabilityMap('ch4', '5G端到端网络优化', '/media/capability-maps/ch4-module-map-readable-v2.svg', '围绕问题识别、优化实施、结果验证和报告输出形成闭环。'),
  capabilityMap('ch5', '5G全网性能提升', '/media/capability-maps/ch5-module-map-readable-v2.svg', '以全网KPI、热区容量、体验问题和批量复测支撑持续提升。'),
  capabilityMap('ch6', '5G信令分析', '/media/capability-maps/ch6-module-map-readable-v2.svg', '沿信令流程、失败点、原因归因和处置验证构建诊断链。'),
];

function capabilityMap(chapterId: string, title: string, svgSrc: string, summary: string): CapabilityMapModel {
  const isOpenChapter = chapterId === 'ch1';
  return {
    chapterId,
    title,
    svgSrc,
    chapters: projects,
    tasks: isOpenChapter ? tasks : [],
    nodes: isOpenChapter ? nodes : [],
    semanticEdges: isOpenChapter ? semanticEdges : [],
    routeLine: [
      { id: `${chapterId}-task`, label: '岗位任务', summary },
      { id: `${chapterId}-model`, label: '知识模型', summary: '把操作动作归纳为可复用的判断模型。' },
      { id: `${chapterId}-evidence`, label: '工程证据', summary: '用现场数据、图表和记录支撑结论。' },
      { id: `${chapterId}-assessment`, label: '成果评价', summary: '形成可提交、可复核、可讲评的成果。' },
    ],
    taskNodes: isOpenChapter
      ? nodes.slice(0, 4).map((item) => ({ id: item.nodeId, label: item.shortTitle, status: item.status }))
      : [{ id: chapterId, label: '章节路线', status: 'locked' }],
    resources: isOpenChapter ? resources : [],
    assessmentOutputs: isOpenChapter ? assessments : [],
  };
}

function edge(from: string, to: string, label: string, kind: SemanticEdge['kind']): SemanticEdge {
  return { edgeId: `${from}->${to}`, from, to, label, kind };
}
