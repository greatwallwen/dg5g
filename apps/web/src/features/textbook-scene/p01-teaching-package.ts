import type { LessonSegmentId } from './classroom-lesson-model.ts';

export interface P01TeachingPage {
  id: string;
  lessonNumber: 1 | 2;
  pageNumber: number;
  globalPageNumber: number;
  suggestedMinutes: number;
  segmentId: LessonSegmentId;
  title: string;
  projectorContent: {
    title: string;
    material: string;
    visualCallouts: string[];
    prompt: string;
  };
  teacherExplanation: string;
  caseQuestion: string;
  typicalAnswer: string;
  commonErrors: string[];
  followUpPrompts: string[];
  studentAction: string;
  transition: string;
}

export interface P01TeachingLesson {
  id: string;
  lessonNumber: 1 | 2;
  title: string;
  objective: string;
  suggestedMinutes: 45;
  pages: P01TeachingPage[];
}

const lessonOnePages: P01TeachingPage[] = [
  {
    id: 'P01-L1-P01',
    lessonNumber: 1,
    pageNumber: 1,
    globalPageNumber: 1,
    suggestedMinutes: 5,
    segmentId: 'learning-case',
    title: '先别急着认设备：一张近照为什么不够？',
    projectorContent: {
      title: 'P1T1-N02 三问法：在哪里、是谁、连到哪',
      material: '工单要求复核 B1 西区机房、机柜 02、BBU 槽位 3 到 AAU5619 的连接关系。现场交回了多张清晰近照，但缺少能证明位置、身份和连接方向的连续证据。',
      visualCallouts: ['在哪里：站点、机房、机柜、槽位', '是谁：型号、序列号、铭牌、现场回指', '连到哪：源端口、路径、跳接、对端端口'],
      prompt: '如果只能补拍三张照片，你会分别证明哪三个问题？',
    },
    teacherExplanation: '先用查快递类比降低门槛：只看包裹近照，不能知道包裹在哪个仓、编号是谁、从哪里送到哪里。设备拓扑也是一样，清晰近照只是线索，不能替代位置、身份和方向三类证据。今天所有判断都围绕“在哪里、是谁、连到哪”展开。',
    caseQuestion: '六张照片都很清楚，为什么仍不能直接写“机柜02的BBU槽位3连接AAU5619”？',
    typicalAnswer: '清晰度只说明图像可看，不说明对象关系成立。至少还要用机房与机柜全景锁定位置，用 BBU 与 AAU 铭牌锁定设备身份，再用端口标签、线缆编号和连续走线证明连接方向；三类证据能互相回指后，才能写职业结论。',
    commonErrors: ['把照片清晰度当成证据完整度', '先写连接结论，再倒找能支持结论的照片'],
    followUpPrompts: ['铭牌清晰但看不到机柜编号，哪条判断轴断了？', '端口号清楚但看不到线缆去向，能否写“连接正常”？'],
    studentAction: '在投屏材料上圈出“在哪里、是谁、连到哪”三个待证明问题，并把每张照片暂时标成可用、待复核或不能直接用。',
    transition: '先知道要问什么，再看第一类证据：如何证明设备在哪里。',
  },
  {
    id: 'P01-L1-P02',
    lessonNumber: 1,
    pageNumber: 2,
    globalPageNumber: 2,
    suggestedMinutes: 7,
    segmentId: 'learning-visual',
    title: '在哪里：把设备放回唯一现场',
    projectorContent: {
      title: '位置证据不是一张门牌照',
      material: '材料 A 是 B1 西区机房门牌，材料 B 是机柜排号，材料 C 是机柜 02 与相邻机柜 01/03，材料 D 是 BBU 近景。请组成能把 BBU 定位到机柜 02 槽位 3 的最短证据链。',
      visualCallouts: ['空间层级：站点 → 机房 → 机柜 → 槽位', '相邻参照物比孤立近景更可复核'],
      prompt: '哪几张材料能把 BBU 定位到 B1 西区、机柜 02、槽位 3？',
    },
    teacherExplanation: '位置证据要完成从大空间到小对象的连续收缩。门牌只能证明到过某机房，设备近景只能证明看过某台设备；只有机房、机柜排号、相邻参照物和槽位同时出现，远程复核员才不会把对象放错现场。',
    caseQuestion: '材料 A、B、C、D 应如何排序，才能让复核员找到 BBU 槽位 3 且不与相邻机柜混淆？',
    typicalAnswer: '先用 A 确认 B1 西区机房，再用 B 和 C 沿机柜排号锁定机柜 02，并保留 01/03 作参照，最后用机柜 02 内部全景把 BBU 落到槽位 3。D 可补充细节，但不能单独承担位置证明。',
    commonErrors: ['只拍机房门牌便认为已经证明设备位置', '裁切掉相邻机柜和槽位编号，导致近景没有空间参照'],
    followUpPrompts: ['机柜 02 标签脱落时，可以用什么替代参照并登记什么缺口？', '照片时间相差两天时，位置链还需要补充哪类一致性信息？'],
    studentAction: '把材料 A-D 拖入站点、机房、机柜、槽位四层位置链，并标出 D 只能作为辅助证据的原因。',
    transition: '位置只回答“在哪里”；下一页用铭牌与槽位回指回答“是谁”。',
  },
  {
    id: 'P01-L1-P03',
    lessonNumber: 1,
    pageNumber: 3,
    globalPageNumber: 3,
    suggestedMinutes: 8,
    segmentId: 'learning-visual',
    title: '是谁：铭牌必须能回指现场对象',
    projectorContent: {
      title: 'BBU5900 与 AAU5619 的身份核验',
      material: 'BBU 铭牌记录型号 BBU5900、序列号 210235A8K12345；AAU 铭牌记录型号 AAU5619、序列号 20235AA98765。另有槽位 3 中景和 AAU 安装位全景，需要判断四份材料能否一一回指。',
      visualCallouts: ['型号说明设备类别，序列号锁定唯一实体', '铭牌近景必须与设备中景或安装位建立回指'],
      prompt: '只有型号没有序列号，能不能确认就是工单里的那台设备？',
    },
    teacherExplanation: '设备身份不能只写 BBU 或 AAU，因为同类设备可能有多台。型号回答“它是什么类别”，序列号回答“它是哪一台”，中景或安装位回答“这张铭牌属于现场哪个对象”。三者缺一，身份都可能挂错。',
    caseQuestion: 'BBU5900 铭牌很清楚，但铭牌照片与槽位 3 中景没有共同特征时，应给出什么判断？',
    typicalAnswer: '应判断为待复核。铭牌内容能说明某台 BBU5900 的身份，却不能证明它就是机柜 02 槽位 3 中的对象。需要补拍包含槽位号和设备外观的过渡中景，或用连续视频、同一照片索引建立可复核回指。',
    commonErrors: ['把设备类型名称当成唯一设备身份', '铭牌清晰就直接挂接到最近一张设备照片'],
    followUpPrompts: ['序列号有一位反光看不清时，应猜测、留空还是登记缺口？', '型号与工单一致但序列号不一致，状态应选异常还是待复核？'],
    studentAction: '核对两张铭牌的型号和序列号，并为每张铭牌选择对应中景；无法回指的材料登记为身份缺口。',
    transition: '位置和身份锁定对象后，下一页追问“它连到哪”。',
  },
  {
    id: 'P01-L1-P04',
    lessonNumber: 1,
    pageNumber: 4,
    globalPageNumber: 4,
    suggestedMinutes: 8,
    segmentId: 'learning-procedure',
    title: '连到哪：从源端口追到对端端口',
    projectorContent: {
      title: 'BBU 槽位 3 端口 P1 到 AAU5619 TX/RX',
      material: '端口近景显示 BBU 槽位 3 的 P1 标签，线缆标签为 OF-03；桥架中景显示 OF-03 向东离开机柜排，AAU 侧近景显示同号 OF-03 接入 TX/RX。中间一段被配线架遮挡。',
      visualCallouts: ['源端：设备 + 槽位 + 端口号', '路径：同一线缆标签 + 连续方向', '对端：设备身份 + 对端端口'],
      prompt: '中间路径被挡住时，应该写满足、异常，还是待复核？',
    },
    teacherExplanation: '连接方向不是看一根线“像是通向某处”，而是从已确认身份的源设备和端口出发，沿同一线缆标签或连续走线找到已确认身份的对端设备与端口。中间遮挡没有矛盾证据时，应登记待复核缺口；发现标签冲突或接错端口才写异常。',
    caseQuestion: '现有材料可否直接写“P1 与 AAU5619 TX/RX 连接满足”，还是必须保留一个证据缺口？',
    typicalAnswer: '可以确认源端 P1、线缆 OF-03 和对端 TX/RX 三个关键点，但遮挡段无法证明 OF-03 全程未换接，因此结论应为待复核，并登记“补拍配线架进出线连续关系”；不能把未看到的部分假定为满足。',
    commonErrors: ['把线缆视觉走向当成确定对端', '遇到遮挡就直接写异常，混淆证据不足与事实错误'],
    followUpPrompts: ['如果对端线缆标签变成 OF-08，状态应怎样改变？', '如果无权打开配线架，应记录什么而不是擅自操作？'],
    studentAction: '按“源端—路径—对端”重建 OF-03 链路，给每一步挂接材料，并把遮挡段登记为待复核缺口。',
    transition: '三类证据已分别建立；下一页把它们合成一条可复核判断链。',
  },
  {
    id: 'P01-L1-P05',
    lessonNumber: 1,
    pageNumber: 5,
    globalPageNumber: 5,
    suggestedMinutes: 10,
    segmentId: 'learning-procedure',
    title: '合起来：三类证据怎样进入同一条判断链',
    projectorContent: {
      title: '把九份现场材料放进三条证据链',
      material: '材料包含机房门牌、机柜排号、机柜 02 全景、BBU 铭牌、AAU 铭牌、P1 端口、OF-03 桥架走线、TX/RX 对端以及一张无编号线缆近景。需要分类、排序并排除不能支撑结论的材料。',
      visualCallouts: ['位置证据链', '身份回指链', '连接方向链', '缺口与无效材料单独登记'],
      prompt: '同一张照片可以支持两个字段吗？条件是什么？',
    },
    teacherExplanation: '真实岗位动作不是选择一句口号，而是按证明目的分类材料，再按空间或链路顺序重建关系，最后只写证据能够支持的职业结论。一张照片可以同时支持两个字段，例如机柜全景既显示机柜 02 也显示槽位 3，但必须说明它支持哪个字段、不能顺手挂到所有字段。',
    caseQuestion: '无编号线缆近景画面清晰且与 OF-03 颜色相同，应挂接到连接方向字段，还是列为无效或待补材料？',
    typicalAnswer: '不能仅凭颜色把它认作 OF-03。若画面没有源端、对端、标签或连续走线参照，就不能挂接为方向证据，应列为无法回指的材料，并提出补拍带标签和相邻走线的中景。',
    commonErrors: ['为了让字段都有照片而强行挂接无关材料', '只罗列照片编号，不说明每张照片证明哪一个判断'],
    followUpPrompts: ['一张机柜全景同时支持位置和身份时，字段说明应如何写？', '证据链完整但拍摄时间不一致，需要登记哪种风险？'],
    studentAction: '完成九份材料的分类与排序，为每个字段写一句“材料—依据—结论”，并把无编号线缆列入缺口清单。',
    transition: '下一页用完整示例检查三类证据是否真的互相回指。',
  },
  {
    id: 'P01-L1-P06',
    lessonNumber: 1,
    pageNumber: 6,
    globalPageNumber: 6,
    suggestedMinutes: 7,
    segmentId: 'learning-case',
    title: '完整示例：把证据链写成职业结论',
    projectorContent: {
      title: '完整示例一：满足条件的链路记录',
      material: 'IMG-101 至 IMG-108 连续记录 B1 西区机房、机柜 02、BBU5900 槽位 3、序列号 210235A8K12345、P1 端口、OF-03 走线、AAU5619 序列号 20235AA98765 及 TX/RX 对端。',
      visualCallouts: ['位置：IMG-101 至 IMG-103', '身份：IMG-103 至 IMG-105、IMG-107', '方向：IMG-105 至 IMG-108'],
      prompt: '请用不超过 80 字写出带对象、端口和证据索引的职业结论。',
    },
    teacherExplanation: '示范时边指材料边说依据：IMG-101 到 103 完成空间定位，IMG-103 到 105 把槽位与 BBU 序列号相连，IMG-105 到 108 沿 OF-03 走到 AAU TX/RX。证据连续且没有冲突，才可写满足；结论仍要保留对象、端口和证据索引。',
    caseQuestion: '如何用 IMG-101 至 IMG-108 证明“在哪里、是谁、连到哪”三项都满足，而不是只说照片齐全？',
    typicalAnswer: 'IMG-101 至 103 将对象定位到 B1 西区机柜 02 槽位 3；IMG-104、105 确认 BBU5900 和唯一序列号；IMG-105 至 108 用 P1、OF-03 和 AAU5619 TX/RX 连续回指对端。因此该链路证据闭合，状态可记为满足，并将八张照片分别挂接到对应字段。',
    commonErrors: ['结论只写“正常”而不保留对象与证据索引', '把同一组照片整体挂到所有字段，无法知道每张材料的证明责任'],
    followUpPrompts: ['若 IMG-107 的 AAU 序列号缺失，整体状态应如何调整？', '若 P1 与 TX/RX 之间经过配线架，表中还要增加哪个关系字段？'],
    studentAction: '独立完成示例一的三类证据说明，并与投屏答案逐字段互查，圈出自己遗漏的对象或索引。',
    transition: '第一课时建立方法；第二课时处理不完整和冲突材料。',
  },
];

const lessonTwoPages: P01TeachingPage[] = [
  {
    id: 'P01-L2-P01',
    lessonNumber: 2,
    pageNumber: 1,
    globalPageNumber: 7,
    suggestedMinutes: 5,
    segmentId: 'learning-practice',
    title: '三问法快速复盘：先分类，再判断',
    projectorContent: {
      title: '30 秒复盘：在哪里、是谁、连到哪',
      material: '投屏随机展示机柜全景、BBU 铭牌和一个无标签端口近景。学生分别举起“位置证据、设备身份、连接方向、不能判断”卡片，并说明材料承担的证明责任。',
      visualCallouts: ['先分类，再判断', '不能证明时明确说“待复核”'],
      prompt: '哪张材料最容易被错误地当成完整连接证据？',
    },
    teacherExplanation: '第二课时不重新背定义，而是用三问法恢复判断顺序。每出现一份材料，先问它回答“在哪里、是谁、连到哪”中的哪一问，再问是否能回指具体对象，最后才决定满足、异常或待复核。',
    caseQuestion: '无标签端口近景看起来与 BBU 外观一致，为什么仍应先选“不能判断”？',
    typicalAnswer: '画面没有设备身份、槽位号、端口号和线缆标签，无法确认它来自机柜 02 的 BBU 槽位 3，也无法追踪对端。它最多是候选材料，必须补拍带端口标签和连续走线的中景后才能进入连接方向证据链。',
    commonErrors: ['凭设备颜色和外观猜测对象身份', '把“当前不能判断”误解为设备一定异常'],
    followUpPrompts: ['怎样补拍一张图让该端口近景获得回指能力？', '待复核与异常在成果表中分别需要写什么依据？'],
    studentAction: '对三张随机材料完成证据分类，并各写一句可证明范围与不可证明范围。',
    transition: '判断框架恢复后，下一页处理带 ODF 跳接的完整链路。',
  },
  {
    id: 'P01-L2-P02',
    lessonNumber: 2,
    pageNumber: 2,
    globalPageNumber: 8,
    suggestedMinutes: 8,
    segmentId: 'learning-case',
    title: '带 ODF 的链路重建：中间对象不能跳过',
    projectorContent: {
      title: '完整示例二：BBU P2—ODF-07—AAU5619 CPRI-2',
      material: 'IMG-201 显示 BBU 槽位 3 的 P2 与光纤 OF-07；IMG-202、203 显示 OF-07 进入 ODF-07 端子 12 并由端子 18 跳出；IMG-204、205 显示同号光纤进入 AAU5619 的 CPRI-2。',
      visualCallouts: ['不能跳过 ODF 中间对象', '进端、跳接、出端均需可回指'],
      prompt: '如何表达这条链路，才不会把端子 12 和端子 18 误写成同一端口？',
    },
    teacherExplanation: '现场链路常经过 ODF 或配线架，不能把源端与对端直接画一条线。应把中间对象作为独立关系记录：BBU P2 到 ODF-07 端子 12，端子 12 跳接端子 18，再由端子 18 到 AAU CPRI-2。每一段都有标签和照片索引，方向才可复核。',
    caseQuestion: '请按源端、中间跳接、对端三段重建 OF-07，并说明为什么 IMG-202、203 不能合并为一句“经过 ODF”。',
    typicalAnswer: '第一段为 BBU 槽位 3 P2 经 OF-07 进入 ODF-07 端子 12；第二段记录端子 12 与端子 18 的跳接关系；第三段由端子 18 沿同号光纤进入 AAU5619 CPRI-2。若只写“经过 ODF”，复核员无法确认具体进出端子，也无法排查跳接错误。',
    commonErrors: ['省略 ODF 端子号，直接连接源端和对端', '把线缆编号相同当作中间跳接必然正确'],
    followUpPrompts: ['端子 18 标签模糊时，前后两段各应是什么状态？', '如果 ODF 柜门无权打开，成果表应怎样登记？'],
    studentAction: '把五张材料排成三段关系，填写源端、进端子、出端子、对端和照片索引五项记录。',
    transition: '完整示例说明中间对象也必须留证；下面用两个反例训练错误诊断。',
  },
  {
    id: 'P01-L2-P03',
    lessonNumber: 2,
    pageNumber: 3,
    globalPageNumber: 9,
    suggestedMinutes: 8,
    segmentId: 'learning-correction',
    title: '铭牌挂错反例：真的证据也可能挂到错对象',
    projectorContent: {
      title: '反例一：身份材料真实，但位置回指错误',
      material: '成果记录写“机柜02槽位3为 BBU5900，序列号 210235A8K12345”。所挂铭牌照片内容正确，但中景中的柜号是 03；机柜 02 全景里槽位 3 设备序列号末四位为 7788。',
      visualCallouts: ['铭牌真实不等于挂接正确', '冲突证据优先标为异常并保留两侧材料'],
      prompt: '该字段是待复核还是异常？需要修订哪三处？',
    },
    teacherExplanation: '这是典型的“证据孤岛”：铭牌本身真实，却被挂到了错误对象。现有材料已经出现柜号和序列号冲突，不只是看不清，因此应判为异常。修订时不能删除冲突照片掩盖问题，要改正对象关系、撤下错误挂接并登记现场复核动作。',
    caseQuestion: '为什么不能保留序列号 210235A8K12345 并只把状态改成“待复核”？请指出已有的冲突事实。',
    typicalAnswer: '中景明确显示铭牌对象位于机柜 03，而机柜 02 槽位 3 已有另一序列号末四位 7788，两条材料相互冲突，说明原挂接关系错误而非单纯缺图。因此应标记异常，撤销错误照片挂接，核对机柜 02 真实铭牌并更新对象、序列号和复核结论。',
    commonErrors: ['看到铭牌内容正确就忽略机柜号冲突', '为通过检查而删除冲突材料，不记录修订原因'],
    followUpPrompts: ['若机柜号被遮挡而不是显示 03，状态会怎样变化？', 'V2 修订记录必须保留 V1 的哪些字段差异？'],
    studentAction: '在缺陷成果表中定位错误挂接，写出冲突依据、正确状态和需要补采或核对的动作。',
    transition: '反例一是对象挂错；反例二检查源端正确但方向证据中断的情况。',
  },
  {
    id: 'P01-L2-P04',
    lessonNumber: 2,
    pageNumber: 4,
    globalPageNumber: 10,
    suggestedMinutes: 8,
    segmentId: 'learning-correction',
    title: '方向证据中断反例：两个端口存在不等于相连',
    projectorContent: {
      title: '反例二：P1 近景不能证明对端是 TX/RX',
      material: '成果记录把 BBU P1 直接写成连接 AAU TX/RX。证据只有 P1 端口近景、AAU TX/RX 近景和两张不同颜色线缆的桥架照片，所有照片均无共同线缆标签，也没有连续走线。',
      visualCallouts: ['两个端点存在，不等于二者相连', '证据不足登记待复核，不伪造中间关系'],
      prompt: '应删除结论、判异常，还是改为待复核？',
    },
    teacherExplanation: '两个端点各自拍清楚，只能证明端口存在，不能证明二者相连。当前没有共同标签或连续路径，也没有明确接错事实，因此最准确状态是待复核。职业结论要说明已确认部分、未确认部分和下一步补证路径。',
    caseQuestion: '怎样改写原结论，既保留已确认事实，又不把未看到的连接关系写成满足？',
    typicalAnswer: '可写“已确认机柜02 BBU 槽位3 存在 P1 端口，AAU5619 存在 TX/RX 端口；现有材料缺少同号线缆标签与连续走线，无法证明两端直接连接，状态为待复核；需补采 P1 出线、桥架路径和 AAU 入线的连续证据”。',
    commonErrors: ['看到两个端点就默认它们属于同一条链', '证据不足时只删结论，不保留已确认事实与补证动作'],
    followUpPrompts: ['若桥架照片出现 OF-08 而源端是 OF-03，是否仍为待复核？', '如何设计最少补拍序列避免再次形成孤立近景？'],
    studentAction: '修订原结论为“已确认事实—证据缺口—复核动作”三段式，并列出最少补拍清单。',
    transition: '两个反例都需要留下可追踪修订；下一页把判断写入真实成果表。',
  },
  {
    id: 'P01-L2-P05',
    lessonNumber: 2,
    pageNumber: 5,
    globalPageNumber: 11,
    suggestedMinutes: 10,
    segmentId: 'learning-output',
    title: '成果表修订：字段、证据、缺口一起改',
    projectorContent: {
      title: '室内设备与链路证据表 V1 修订任务',
      material: '表中包含对象编号、位置关系、设备身份、源端、路径、对端、证据照片、证据缺口、复核结论九类信息。V1 故意混入一处机柜错挂、一处线缆方向缺口和一条无依据“满足”结论。',
      visualCallouts: ['字段必须挂接具体证据', '缺口要写补证动作', 'V2 保留 V1 差异和修订原因'],
      prompt: '哪一处缺陷最先修？为什么？',
    },
    teacherExplanation: '先处理会改变对象身份的机柜错挂，因为后续端口与链路都依赖正确对象；再处理方向证据缺口，最后重写复核结论。提交不是填写占位字段，而是每个关键判断都挂接证据、缺口和可执行动作。',
    caseQuestion: '请给出从 V1 到 V2 的修订顺序，并说明哪些字段必须保留原值、修订值和修订依据。',
    typicalAnswer: '先修正机柜 03 铭牌错挂，更新设备对象与序列号；再把 P1 到 TX/RX 改为待复核并补充连续走线采集动作；最后根据两处事实重写复核结论。对象编号、设备身份、连接关系、证据挂接、证据缺口和结论均需保留 V1/V2 差异及照片索引。',
    commonErrors: ['只改最终结论，不修正产生结论的字段与证据挂接', '覆盖 V1 导致教师无法看出退回前后的具体变化'],
    followUpPrompts: ['字段值正确但证据挂错时，版本差异应记录在哪里？', '没有现场操作权限时，缺口动作怎样写才职业化？'],
    studentAction: '检查缺陷表，完成 V2 修订并逐字段挂接证据；同伴按“可定位、可识别、可追踪、可复核”四项互评。',
    transition: '成果表已经可提交；最后一页用迁移任务检验能否把方法带到新材料。',
  },
  {
    id: 'P01-L2-P06',
    lessonNumber: 2,
    pageNumber: 6,
    globalPageNumber: 12,
    suggestedMinutes: 6,
    segmentId: 'learning-practice',
    title: '迁移任务和正式测试入口：换材料也按三问法',
    projectorContent: {
      title: '迁移任务：新站点机柜 05 链路取证',
      material: '新材料仅提供机柜 05 全景、BBU 槽位 2 铭牌、P3 端口、ODF 进端和 AAU 入端五张照片。学生需要判断位置、身份、方向各达到什么程度，并给出最少补证计划和职业结论。',
      visualCallouts: ['正式测试覆盖证据分类、链路重建、缺陷修订、职业表达', '未达标返回对应节点再学，不把测试分当教师认证'],
      prompt: '你能否让未到现场的人仅凭记录重建判断？',
    },
    teacherExplanation: '收束时再次强调完成标准：学生能独立说明位置证据为何需要空间层级，设备身份为何需要唯一标识与现场回指，连接方向为何需要源端、路径和对端连续证据。迁移任务完成后进入独立正式测试；未达标按分项诊断返回具体内容。',
    caseQuestion: '五张新材料中，位置、身份、方向各能得出什么状态？最少还要补哪两类证据才能形成可复核结论？',
    typicalAnswer: '机柜 05 全景与槽位 2 铭牌若能同框回指，可确认位置和 BBU 身份；P3、ODF 进端和 AAU 入端之间缺少 ODF 出端与共同线缆标签，方向只能待复核。至少补采 ODF 进出端跳接关系和从出端到 AAU 的连续走线。',
    commonErrors: ['用第一课时示例答案替换新站点的实际证据判断', '把正式测试达标误写成任务成果已认证或能力达成'],
    followUpPrompts: ['若 BBU 铭牌未与槽位同框，最少还要补哪张过渡照片？', '分项诊断显示方向重建薄弱时，应返回哪一页复学？'],
    studentAction: '独立提交迁移任务的三类判断、补证计划与职业结论，然后从正式测试入口完成四类岗位动作。',
    transition: '两课时授课完成；课后返回完整自学内容继续练习，并在 N04 形成任务级成果。',
  },
];

export const p01TeachingPackage: P01TeachingLesson[] = [
  {
    id: 'P01-L1',
    lessonNumber: 1,
    title: '第一课时：用三问法建立室内设备与链路证据判断框架',
    objective: '能区分位置证据、设备身份和连接方向，并完成一条闭合证据链。',
    suggestedMinutes: 45,
    pages: lessonOnePages,
  },
  {
    id: 'P01-L2',
    lessonNumber: 2,
    title: '第二课时：诊断缺口并形成可复核专业记录',
    objective: '能诊断错误挂接与证据缺口，修订成果表并迁移到新站点材料。',
    suggestedMinutes: 45,
    pages: lessonTwoPages,
  },
];

const allTeachingPages = p01TeachingPackage.flatMap(({ pages }) => pages);

export function teachingPageAt(pageIndex: number | undefined): P01TeachingPage {
  const index = Math.max(0, Math.min(allTeachingPages.length - 1, Math.trunc(pageIndex ?? 0)));
  return allTeachingPages[index]!;
}
