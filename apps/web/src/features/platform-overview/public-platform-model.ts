import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadP1DemoContent, type P1DemoContent } from '../platform/p1-content.ts';

export interface PublicPlatformCard {
  id: string;
  title: string;
  kind: 'source' | 'resource' | 'gate' | 'delivery';
  status: 'ready' | 'review' | 'sample';
  summary: string;
  thumbnailUrl?: string;
  outputMode?: 'resource-package' | 'direct-render';
}

export interface PublicPlatformModel {
  stages: PublicPlatformCard[];
  resources: PublicPlatformCard[];
  governance: PublicPlatformCard[];
  delivery: PublicPlatformCard[];
}

interface GenerationSummary {
  projects: number;
  tasks: number;
  widgets: number;
  media: number;
}

export function buildPublicPlatformModel(): PublicPlatformModel {
  const manifest = loadP1DemoContent();
  const generation = loadGenerationSummary();
  const taskCount = manifest.tasks.length;
  const nodeCount = manifest.tasks.reduce((total, task) => total + task.nodes.length, 0);

  return {
    stages: [
      card('input', '输入材料', 'source', 'ready', `权威教材源与固定 P1 样例进入生产链，覆盖 ${taskCount} 个任务。`),
      card('diagnosis', '内容诊断与检索补强', 'source', 'ready', '识别章节结构、知识单元与资源缺口，形成可追踪的内容基线。'),
      card('capability-map', '课程能力图谱', 'resource', 'ready', `${nodeCount} 个能力节点将岗位任务、学习内容与任务成果建立关联。`),
      card('generation', '资源生成', 'resource', 'ready', `当前生成摘要包含 ${generation.widgets} 项交互资源与 ${generation.media} 项媒体引用。`),
      card('governance', '审核治理', 'gate', 'review', '按内容完整性、资源可用性与视觉一致性执行脱敏质量门禁。'),
      card('textbook', '数字教材', 'delivery', 'ready', '通过门禁的内容按能力节点挂接为可直接呈现的数字教材页面。'),
      card('teaching', '教学应用', 'delivery', 'sample', '同一内容基线支撑教师授课、学生学习与课堂投屏。'),
      card('feedback', '数据回收', 'gate', 'sample', '登录后的学习事实回流到授权域；匿名页面仅展示生产链说明。'),
    ],
    resources: buildResourceCards(manifest, generation),
    governance: [
      card('gate-content', '内容完整性门禁', 'gate', 'ready', '检查任务、知识单元、教学资源与任务成果的公开关联是否完整。'),
      card('gate-media', '资源可用性门禁', 'gate', 'ready', '核对公开缩略图和媒体引用，缺失项在发布前进入修订。'),
      card('gate-visual', 'Image2 视觉门禁', 'gate', 'ready', '检查深色工程界面、单一主行动点、暂停动效与移动端覆盖。'),
      card('gate-version', '版本流摘要', 'gate', 'review', '版本按生成、复核与可交付三个阶段流转，匿名区不公开内部日志。'),
    ],
    delivery: [
      card('delivery-package', '出版社资源包', 'delivery', 'sample', '展示教材内容、交互资源与媒体清单的脱敏摘要，不提供完整资源包下载。', undefined, 'resource-package'),
      card('delivery-render', '数字教材直接挂接', 'delivery', 'ready', `固定 P1 样例以 ${taskCount} 个任务、${nodeCount} 个节点直接呈现在教材运行时。`, '/media/5g/image2.jpeg', 'direct-render'),
    ],
  };
}

function buildResourceCards(
  manifest: P1DemoContent,
  generation: GenerationSummary,
): PublicPlatformCard[] {
  const taskCards = manifest.tasks.map((task) => card(
    `resource-${task.taskId.toLowerCase()}`,
    `${task.taskId} · ${task.title}`,
    'resource',
    'ready',
    `${task.source.knowledgeUnitRefs.length} 个知识单元、${task.source.widgetRefs.length} 项交互资源，挂接为“${task.taskOutputTitle}”。`,
    publicThumbnail(task.source.mediaRefs),
    'direct-render',
  ));

  return [
    card('source-p1', `${manifest.project.id} · ${manifest.project.title}`, 'source', 'ready', `固定样例由 ${manifest.tasks.length} 个岗位任务组成，最终形成“${manifest.project.finalOutput}”。`),
    ...taskCards,
    card('resource-summary', '全书生成物摘要', 'resource', 'sample', `${generation.projects} 个项目、${generation.tasks} 个任务、${generation.widgets} 项交互资源、${generation.media} 项媒体引用。`),
  ];
}

function publicThumbnail(mediaRefs: readonly string[]): string | undefined {
  return mediaRefs.find((media) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(media));
}

function card(
  id: string,
  title: string,
  kind: PublicPlatformCard['kind'],
  status: PublicPlatformCard['status'],
  summary: string,
  thumbnailUrl?: string,
  outputMode?: PublicPlatformCard['outputMode'],
): PublicPlatformCard {
  return {
    id,
    title,
    kind,
    status,
    summary,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(outputMode ? { outputMode } : {}),
  };
}

function loadGenerationSummary(): GenerationSummary {
  const source = resolveGeneratedFile('5g-import-report.json');
  const parsed = JSON.parse(readFileSync(source, 'utf8')) as Partial<GenerationSummary>;
  for (const key of ['projects', 'tasks', 'widgets', 'media'] as const) {
    if (!Number.isInteger(parsed[key]) || Number(parsed[key]) < 0) {
      throw new Error(`Invalid public generation summary: ${key}`);
    }
  }
  return parsed as GenerationSummary;
}

function resolveGeneratedFile(fileName: string): string {
  const workingDirectory = resolve(process.cwd());
  const repositoryRoot = existsSync(join(workingDirectory, 'pnpm-workspace.yaml'))
    ? workingDirectory
    : resolve(workingDirectory, '../..');
  const source = join(repositoryRoot, 'textbook', '5g', 'generated', fileName);
  if (!existsSync(source)) throw new Error(`Public generation summary is unavailable: ${fileName}`);
  return source;
}
