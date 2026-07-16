import type { GameType, TemplateDefinition, TemplateMechanicFamily } from './types';

const ready = new Set<GameType>([
  'quick-hit', 'quiz-rush', 'memory-card', 'drag-match',
  'sort-flow', 'card-battle', 'match-3', 'boss-review',
  'pipe-connect', 'device-assemble', 'maze-troubleshoot', 'tower-defense',
  '2048-merge', 'minesweeper-risk', 'rhythm-tap', 'timeline-build',
  'case-detective', 'knowledge-map', 'repair-sim', 'lab-procedure',
  'classification-run', 'resource-management', 'scenario-choice', 'checkpoint-adventure',
]);

const mechanicFamilies: Record<GameType, TemplateMechanicFamily> = {
  'quick-hit': 'quick-hit',
  'quiz-rush': 'quiz-rush',
  'memory-card': 'memory-card',
  'drag-match': 'drag-match',
  'sort-flow': 'sort-flow',
  'card-battle': 'memory-card',
  'match-3': 'drag-match',
  'boss-review': 'quick-hit',
  'pipe-connect': 'drag-match',
  'device-assemble': 'drag-match',
  'maze-troubleshoot': 'drag-match',
  'tower-defense': 'quick-hit',
  '2048-merge': 'drag-match',
  'minesweeper-risk': 'quiz-rush',
  'rhythm-tap': 'quick-hit',
  'timeline-build': 'sort-flow',
  'case-detective': 'quick-hit',
  'knowledge-map': 'memory-card',
  'repair-sim': 'drag-match',
  'lab-procedure': 'drag-match',
  'classification-run': 'drag-match',
  'resource-management': 'drag-match',
  'scenario-choice': 'quiz-rush',
  'checkpoint-adventure': 'quick-hit',
};

type TemplateTuple = [GameType, string, string, number, boolean];

const definitions: TemplateDefinition[] = ([
  ['quick-hit', '知识快打', '限时点击正确对象，训练术语和设备识别。', 6, false],
  ['memory-card', '记忆翻牌', '匹配概念和定义，训练短时记忆。', 6, false],
  ['drag-match', '拖拽匹配', '把对象拖到正确区域，训练结构和证据关系。', 5, true],
  ['sort-flow', '流程排序', '按工程顺序排列步骤。', 5, true],
  ['card-battle', '卡牌流程战斗', '用正确步骤卡处理故障。', 6, false],
  ['match-3', '三消分类', '把同类知识点三连消除。', 12, true],
  ['boss-review', 'Boss 复习战', '组合多轮小玩法完成章节复盘。', 10, false],
  ['quiz-rush', '限时问答冲刺', '在倒计时内完成判断和单选。', 6, false],
  ['pipe-connect', '管线连接', '连接正确链路和接口。', 6, true],
  ['device-assemble', '设备拼装', '拼出设备结构。', 6, true],
  ['maze-troubleshoot', '迷宫排障', '沿正确证据路径排除故障。', 6, true],
  ['tower-defense', '知识塔防', '用知识点阻断错误信号。', 10, false],
  ['2048-merge', '知识合成', '合并同类概念形成高阶能力点。', 8, true],
  ['minesweeper-risk', '风险扫雷', '识别风险点并避开误判。', 10, false],
  ['rhythm-tap', '节奏反应', '按时序点击关键动作。', 8, false],
  ['timeline-build', '时间线拼装', '拼出事件发生顺序。', 6, true],
  ['case-detective', '案例侦探', '根据线索锁定根因。', 8, false],
  ['knowledge-map', '知识地图探险', '探索能力点之间的关系。', 8, false],
  ['repair-sim', '故障维修模拟', '选择工具和步骤修复问题。', 8, true],
  ['lab-procedure', '实验流程闯关', '按实验规程完成操作。', 8, true],
  ['classification-run', '分类跑酷', '移动到正确分类通道。', 10, false],
  ['resource-management', '资源调度', '在约束下分配资源。', 8, true],
  ['scenario-choice', '情境决策', '在案例情境中选择下一步。', 6, false],
  ['checkpoint-adventure', '关卡冒险', '逐关完成知识点挑战。', 8, false],
] satisfies TemplateTuple[]).map(([game_type, title, description, min_items, supports_drag]) => ({
  game_type,
  title,
  description,
  min_items,
  supports_drag,
  mechanic_family: mechanicFamilies[game_type],
  status: ready.has(game_type) ? 'ready' : 'placeholder',
}));

const registry = new Map<GameType, TemplateDefinition>();

for (const definition of definitions) {
  registry.set(definition.game_type, definition);
}

export function registerTemplate(definition: TemplateDefinition): void {
  registry.set(definition.game_type, definition);
}

export function getTemplate(gameType: string): TemplateDefinition | undefined {
  return registry.get(gameType as GameType);
}

export function listTemplates(): TemplateDefinition[] {
  return [...registry.values()];
}

export function isReadyTemplate(gameType: string): boolean {
  return getTemplate(gameType)?.status === 'ready';
}
