import type { GameConfig, GameItem, KnowledgePoint } from '@dgbook/edugame-core';
import type { AbilityNode, Task } from '../models';

const indoorObjectKnowledge: KnowledgePoint[] = [
  point('P1T1-N01-boundary', '采集边界', '先确认站点、机房和采集范围。'),
  point('P1T1-N01-identity', '对象编号', '对象与照片使用同一编号。'),
  point('P1T1-N01-topology', '设备关系', '设备、端口与连接关系可以回查。'),
  point('P1T1-N01-condition', '配套条件', '电源、传输、接地和温控进入同一记录。'),
  point('P1T1-N01-evidence', '影像索引', '全景、铭牌、端口近景与日志互相印证。'),
];

const indoorObjectItems: GameItem[] = [
  item('site-list', '站点与机房清单', '先确定本次进入哪一个机房、采集哪些区域。', 'P1T1-N01-boundary', '它用于划定采集对象与空间范围。'),
  item('room-entry', '带机房编号的入口照片', '入口、楼层、门禁和机房编号能够对应站点清单。', 'P1T1-N01-identity', '编号把现场照片绑定到唯一对象。'),
  item('cabinet-panorama', '机柜全景与柜号', '全景中同时出现机柜位置和可读柜号。', 'P1T1-N01-identity', '柜号是后续设备近景的索引入口。'),
  item('bbu-port', 'BBU 槽位与端口近景', '槽位、端口标签和连接方向需要在同一组照片中。', 'P1T1-N01-topology', '这组证据用于复核设备和连接关系。'),
  item('power-ground', '电源与接地状态', '配电、接地排、温控和传输状态按同一时间记录。', 'P1T1-N01-condition', '配套条件决定站点能否稳定运行。'),
  item('photo-log', '照片编号与采集日志', '照片编号、拍摄对象、时间和采集人可以互查。', 'P1T1-N01-evidence', '影像索引让照片成为证据而不是附件堆叠。'),
  item('port-label', '端口标签与走线方向', '端口近景必须同时说明它连接到哪个对象。', 'P1T1-N01-topology', '端口标签和走向共同证明拓扑关系。'),
  item('timestamp', '坐标与统一时间戳', '坐标、时间和日志使用同一采集批次。', 'P1T1-N01-evidence', '统一时空口径支持后续复核。'),
  distractor('subjective', '“现场整体正常”', '没有对象编号、证据来源和复核标准。', 'P1T1-N01-evidence'),
  distractor('attachment', '“照片见附件”', '没有说明每张照片证明哪个对象和字段。', 'P1T1-N01-identity'),
];

export function skillGameForNode(node: AbilityNode, task: Task): GameConfig {
  if (node.nodeId === 'P1T1-N02') return topologyRepairGame();
  if (node.nodeId === 'P1T1-N04') return evidenceChainGame();
  if (node.nodeId === 'P1T2-N02') return beamTuningGame();
  if (node.nodeId === 'P1T2-N04') return outdoorCoverageGame();

  const knowledgePoints = [
    point(`${node.nodeId}-object`, '判断对象', node.goal),
    point(`${node.nodeId}-evidence`, '证据来源', task.evidenceFrom),
    point(`${node.nodeId}-standard`, '复核标准', task.standards.join('、')),
  ];
  const items = [
    item(`${node.nodeId}-i1`, node.title, node.goal, knowledgePoints[0].id, `先明确本节点处理的对象：${node.title}。`),
    item(`${node.nodeId}-i2`, task.evidenceFrom.split('、')[0] ?? '现场记录', '这是本节点可以直接读取的输入证据。', knowledgePoints[1].id, `判断必须回到${task.evidenceFrom}。`),
    item(`${node.nodeId}-i3`, task.standards[0] ?? '记录完整', '用明确口径检查结果是否可以进入下一步。', knowledgePoints[2].id, `复核时重点检查${task.standards.join('、')}。`),
    item(`${node.nodeId}-i4`, node.output, '把对象、证据和判断写成可交付结果。', knowledgePoints[2].id, `本节点成果是${node.output}。`),
    distractor(`${node.nodeId}-d1`, '只写“已完成”', '没有对象和证据，不能进入复核。', knowledgePoints[1].id),
    distractor(`${node.nodeId}-d2`, '先给经验结论', '跳过证据与标准会放大误判。', knowledgePoints[2].id),
  ];
  return baseConfig(node.nodeId, `${node.title} · 证据闸门`, knowledgePoints, items, 'quiz-rush');
}

function topologyRepairGame(): GameConfig {
  const knowledgePoints: KnowledgePoint[] = [
    point('P1T1-N02-position', '设备定位', '用机柜、槽位和设备编号建立唯一位置。'),
    point('P1T1-N02-identity', '设备身份', '铭牌、型号和序列号共同确认设备身份。'),
    point('P1T1-N02-link', '端口链路', '端口标签、光纤和走线方向必须形成连续链路。'),
    point('P1T1-N02-power', '供电接地', '电源与接地关系是拓扑可运行的前提。'),
    point('P1T1-N02-alarm', '运行核验', '拓扑修复后用告警与链路状态完成验证。'),
  ];
  const phases: GameItem[][] = [
    [
      item('topo-cabinet', '机柜02全景', '柜号与设备位置同框。', 'P1T1-N02-position', '先确定设备所在机柜。'),
      item('topo-bbu', 'BBU槽位3铭牌', '槽位、型号与序列号清晰可读。', 'P1T1-N02-identity', '铭牌确认基带设备身份。'),
      item('topo-rru', 'AAU/RRU设备标签', '扇区与射频设备编号一致。', 'P1T1-N02-identity', '设备标签确认射频侧身份。'),
      distractor('topo-blur', '模糊设备近景', '缺少柜号和可读铭牌，无法定位。', 'P1T1-N02-position'),
    ],
    [
      item('topo-fiber', 'eCPRI光纤标签', '光纤两端标签与设备端口对应。', 'P1T1-N02-link', '建立BBU到AAU/RRU的传输链。'),
      item('topo-port', '端口近景与走线', '端口编号和出线方向同时可见。', 'P1T1-N02-link', '连续画面证明连接方向。'),
      item('topo-power', '-48V电源与接地排', '电源端子和接地点具备对象编号。', 'P1T1-N02-power', '供电与接地进入同一拓扑。'),
      distractor('topo-light', '仅拍设备指示灯', '亮灯不能替代端口和供电关系。', 'P1T1-N02-power'),
    ],
    [
      item('topo-alarm', '链路恢复告警日志', '告警恢复时间与现场操作一致。', 'P1T1-N02-alarm', '运行日志验证拓扑修复结果。'),
      item('topo-index', '端口影像索引', '设备、端口、照片编号可逐项回查。', 'P1T1-N02-link', '影像索引让拓扑可以复核。'),
      item('topo-sheet', '修复后设备拓扑表', '位置、身份、连接、供电和状态字段齐全。', 'P1T1-N02-alarm', '形成可交付的拓扑结论。'),
      distractor('topo-normal', '“现场已恢复正常”', '没有日志和字段，不能作为验收结论。', 'P1T1-N02-alarm'),
    ],
  ];
  return {
    ...baseConfig('P1T1-N02', '设备拓扑抢修', knowledgePoints, phases.flat(), 'pipe-connect'),
    duration: 360,
    levels: professionalLevels('P1T1-N02', 'pipe-connect', ['锁定设备身份与位置', '修复端口、传输与供电关系', '用日志和影像完成验收'], phases, knowledgePoints),
    mistake_limit: 6,
    pass_score: 80,
    ui: {
      professionalVariant: 'topology-repair',
      arenaLabel: 'P01 机房拓扑抢修',
      cardMark: '证据',
      instruction: '在机房数字孪生场景中恢复设备、端口与运行证据链。',
      actionLabel: '进入抢修现场',
      feedbackHint: '先定位对象，再修复连接，最后用运行证据验收。',
      onboarding: ['锁定设备身份', '修复端口链路', '提交验收记录'],
    },
  };
}

function evidenceChainGame(): GameConfig {
  const knowledgePoints = indoorObjectKnowledge;
  const phases: GameItem[][] = [
    indoorObjectItems.slice(0, 4),
    indoorObjectItems.slice(4, 8),
    [
      item('evidence-crosscheck', '对象与影像交叉索引', '每个设备字段都能回到唯一照片。', 'P1T1-N01-evidence', '交叉索引形成复核入口。'),
      item('evidence-time', '统一采集时间窗', '日志、照片和告警使用同一时间口径。', 'P1T1-N01-evidence', '时间一致才能解释现场状态。'),
      item('evidence-conclusion', '缺口与复核结论', '明确已证实项、缺口和下一步动作。', 'P1T1-N01-evidence', '结论必须能够派单和复核。'),
      ...indoorObjectItems.slice(8),
    ],
  ];
  return {
    ...baseConfig('P1T1-N04', '机房证据链重建', knowledgePoints, phases.flat(), 'drag-match'),
    duration: 330,
    levels: professionalLevels('P1T1-N04', 'drag-match', ['归档对象与身份', '核对配套与影像', '重建可复核交付链'], phases, knowledgePoints),
    mistake_limit: 6,
    pass_score: 80,
    ui: {
      professionalVariant: 'evidence-chain',
      arenaLabel: 'P01 证据链重建',
      cardMark: '档案',
      instruction: '把散落的现场材料归入对象、关系与结论，重建完整证据链。',
      actionLabel: '打开现场档案',
      feedbackHint: '每份材料都必须回答对象、时间、关系和证明目的。',
      onboarding: ['清点现场材料', '建立交叉索引', '形成复核结论'],
    },
  };
}

function beamTuningGame(): GameConfig {
  const knowledgePoints: KnowledgePoint[] = [
    point('P1T2-N02-sector', '扇区身份', '扇区编号与方位必须先唯一对应。'),
    point('P1T2-N02-azimuth', '方位角', '方位角决定主瓣水平方向。'),
    point('P1T2-N02-tilt', '下倾角', '下倾角影响近端与远端覆盖。'),
    point('P1T2-N02-height', '挂高', '挂高需结合道路和遮挡剖面判断。'),
    point('P1T2-N02-verify', '参数验证', '调整后使用覆盖指标与采样点验证。'),
  ];
  const phases: GameItem[][] = [
    [
      item('beam-sector', '东南扇区标识', '扇区编号与现场方向一致。', 'P1T2-N02-sector', '先确认要调整的唯一扇区。'),
      item('beam-azimuth', '方位角135°', '主瓣指向东南道路。', 'P1T2-N02-azimuth', '方位角决定水平覆盖方向。'),
      item('beam-photo', '带方向的天面照片', '照片含北向基准和扇区编号。', 'P1T2-N02-sector', '方向基准支持参数复核。'),
      distractor('beam-normal', '“天线外观正常”', '无法说明扇区与方向参数。', 'P1T2-N02-sector'),
    ],
    [
      item('beam-tilt', '电子下倾角6°', '控制主瓣落点与覆盖距离。', 'P1T2-N02-tilt', '下倾角必须与风险区域对应。'),
      item('beam-height', '挂高32m', '与楼体和道路剖面共同判断。', 'P1T2-N02-height', '挂高影响遮挡与越区风险。'),
      item('beam-profile', '道路高程剖面', '道路起伏与天线高度处于同一剖面。', 'P1T2-N02-height', '空间剖面支持波束判断。'),
      distractor('beam-angle-only', '单独记录一个角度', '缺少扇区和空间关系。', 'P1T2-N02-tilt'),
    ],
    [
      item('beam-rsrp', '调整后RSRP采样', '风险点两侧均有对照数据。', 'P1T2-N02-verify', '用数据验证主瓣调整效果。'),
      item('beam-sinr', 'SINR与邻区记录', '覆盖改善同时检查干扰变化。', 'P1T2-N02-verify', '避免只改善电平却恶化质量。'),
      item('beam-log', '参数变更工单', '变更前后参数、时间和责任人齐全。', 'P1T2-N02-verify', '参数调整必须可追溯。'),
      distractor('beam-feel', '“现场感觉信号变好”', '主观感受不能替代测量数据。', 'P1T2-N02-verify'),
    ],
  ];
  return {
    ...baseConfig('P1T2-N02', '天线波束调优', knowledgePoints, phases.flat(), 'lab-procedure'),
    duration: 360,
    levels: professionalLevels('P1T2-N02', 'lab-procedure', ['校准扇区与方位', '联调下倾角与挂高', '用覆盖数据完成验证'], phases, knowledgePoints),
    mistake_limit: 6,
    pass_score: 80,
    ui: {
      professionalVariant: 'beam-tuning',
      arenaLabel: 'P02 波束调优台',
      cardMark: '参数',
      instruction: '校准扇区姿态，控制波束落点，并用测量数据验证调整结果。',
      actionLabel: '启动调优台',
      feedbackHint: '参数必须同时对应扇区、空间风险和验证数据。',
      onboarding: ['校准扇区方位', '联调姿态参数', '验证覆盖结果'],
    },
  };
}

function outdoorCoverageGame(): GameConfig {
  const knowledgePoints: KnowledgePoint[] = [
    point('P1T2-N04-posture', '天线姿态', '扇区、方位角、下倾角和挂高共同描述覆盖指向。'),
    point('P1T2-N04-scene', '场景证据', '遮挡体、道路热点和拍摄方向必须落在同一空间口径。'),
    point('P1T2-N04-sample', '采样设计', '风险两侧与对照区域都需要采样点。'),
    point('P1T2-N04-route', '验证路线', 'DT/CQT路线必须穿过风险假设区域并保留对照。'),
  ];
  const items: GameItem[] = [
    item('sector-posture', '东南扇区 135° / 6°', '先把方位角、下倾角与扇区编号绑定。', 'P1T2-N04-posture', '姿态参数决定主瓣指向，是外场判断的起点。'),
    item('mast-height', '挂高 32m', '挂高要与楼体高度和道路剖面共同判断。', 'P1T2-N04-posture', '单独记录挂高不够，还要进入空间对照。'),
    item('building-block', '东南侧高层楼体', '楼体位于主瓣方向，需要标注方向、距离与高度。', 'P1T2-N04-scene', '遮挡证据必须带空间关系。'),
    item('business-hotspot', '商圈业务热点', '热点与道路位置决定重点验证区域。', 'P1T2-N04-scene', '业务热点决定采样优先级。'),
    item('sample-a', '遮挡前采样点 A', '用于记录进入风险区域前的对照值。', 'P1T2-N04-sample', '对照点帮助区分连续弱覆盖与局部遮挡。'),
    item('sample-b', '遮挡后采样点 B', '用于验证穿越楼体后的信号变化。', 'P1T2-N04-sample', '风险两侧成对采样才能验证假设。'),
    item('cqt-point', '商圈 CQT 点 C', '在业务热点补充定点体验验证。', 'P1T2-N04-sample', 'CQT补充道路DT无法覆盖的室内外热点体验。'),
    item('dt-route', 'A-B-C 风险路线', '路线依次经过对照点、遮挡区和业务热点。', 'P1T2-N04-route', '路线由风险假设驱动，并明确验证指标和时间窗。'),
    distractor('easy-road', '只走最方便的道路', '没有经过风险区域，无法验证东南扇区假设。', 'P1T2-N04-route'),
    distractor('photo-only', '一张楼体照片', '缺少方向、坐标和扇区关系，不能直接判定弱覆盖。', 'P1T2-N04-scene'),
  ];
  return {
    ...baseConfig('P1T2-N04', '室外覆盖取证地图', knowledgePoints, items, 'lab-procedure'),
    duration: 420,
    levels: professionalLevels('P1T2-N04', 'lab-procedure', ['校准扇区姿态', '标注遮挡与业务热点', '布置DT/CQT验证路线'], [items.slice(0, 3), items.slice(3, 7), items.slice(7)], knowledgePoints),
    mistake_limit: 6,
    pass_score: 80,
    ui: {
      professionalVariant: 'coverage-survey',
      arenaLabel: 'P02 外场取证任务',
      arenaVariant: 'coverage-survey',
      cardMark: '点位',
      instruction: '校准扇区姿态，标注遮挡与热点，再闭合DT/CQT验证路线。',
      actionLabel: '进入外场地图',
      feedbackHint: '每个判断都要同时回答方向、位置、证据和验证动作。',
      onboarding: ['校准天线姿态', '标注风险证据', '布置采样路线'],
    },
  };
}

function professionalLevels(lessonId: string, type: GameConfig['game_type'], goals: [string, string, string], phases: GameItem[][], knowledgePoints: KnowledgePoint[]): GameConfig['levels'] {
  const pointNames = new Map(knowledgePoints.map((point) => [point.id, point.name]));
  return phases.map((items, index) => ({
    level_id: `${lessonId}-stage-${index + 1}`,
    type,
    goal: goals[index],
    items: items.map((entry) => ({ ...entry, definition: pointNames.get(entry.target_id ?? '') ?? entry.definition })),
    mistake_limit: 6,
  }));
}

function baseConfig(lessonId: string, title: string, knowledgePoints: KnowledgePoint[], items: GameItem[], gameType: GameConfig['game_type']): GameConfig {
  const pointNames = new Map(knowledgePoints.map((point) => [point.id, point.name]));
  return {
    game_id: `${lessonId}-skill-challenge`,
    game_type: gameType,
    lesson_id: lessonId,
    title,
    duration: 72,
    difficulty: 'normal',
    asset_pack: 'dgbook-5g-v1',
    knowledge_points: knowledgePoints,
    levels: [{
      level_id: `${lessonId}-level-01`,
      type: gameType,
      goal: '完成专业判断并达到 80 分。',
      items: items.map((entry) => ({ ...entry, definition: pointNames.get(entry.target_id ?? '') ?? entry.definition })),
      mistake_limit: 4,
    }],
    score_rule: { base: 0, correct: 12, wrong_penalty: 6, combo_bonus: true, time_bonus: true },
    reward_rule: { stars: [60, 80, 95], badges: ['证据入门', '判断准确', '测试达标'] },
    mistake_limit: 4,
    pass_score: 80,
    ui: {
      arenaLabel: '能力挑战',
      cardMark: '5G',
      instruction: '观察当前信息，选择能够支撑专业判断的目标。',
      actionLabel: '开始挑战',
      feedbackHint: '回到对象、证据和复核标准再判断。',
      onboarding: ['先看对象', '再选证据', '最后核对结论'],
    },
  };
}

function point(id: string, name: string, description: string): KnowledgePoint {
  return { id, name, description, weight: 1 };
}

function item(id: string, label: string, text: string, targetId: string, explanation: string): GameItem {
  return { id, label, text, prompt: `“${label}”应接入哪个证据门？`, target_id: targetId, explanation, kp: targetId, correct: true };
}

function distractor(id: string, label: string, text: string, targetId: string): GameItem {
  return { id, label, text, prompt: '判断这条材料能否直接支撑当前结论。', target_id: targetId, explanation: text, kp: targetId, correct: false };
}
