"""EduGame challenge rules for 5G lessons."""
from __future__ import annotations
from typing import Any
from .edugame_profile_map import CANONICAL_GAME_TYPE, GAME_TEMPLATE_BY_PROJECT, TEMPLATE_MECHANIC_FAMILY
from .edugame_rewards import badges_for_template
from .edugame_timing import game_duration_sec
Pair = tuple[str, str, str]
GAME_PROFILES: dict[str, dict[str, str]] = {
    "device-connect": {
        "gameType": "drag-match",
        "template": "edugamekit.device-connect/v2",
        "group": "connection",
        "mechanic": "设备连线挑战",
        "instruction": "把工程对象接入正确接口槽，形成可采集、可复核的数据链。",
    },
    "evidence-chain": {
        "gameType": "evidence-chain",
        "template": "edugamekit.evidence-chain/v2",
        "group": "evidence",
        "mechanic": "证据链挑战",
        "instruction": "把证据卡投入正确目标门，避开干扰项，形成可交付闭环。",
    },
    "route-runner": {
        "gameType": "route-runner",
        "template": "edugamekit.route-runner/v2",
        "group": "route",
        "mechanic": "路线策略挑战",
        "instruction": "按测试场景选择正确路线、点位和采样策略，避免用一种测试覆盖所有问题。",
    },
    "kpi-guard": {
        "gameType": "threshold-guard",
        "template": "edugamekit.kpi-guard/v2",
        "group": "threshold",
        "mechanic": "指标守线挑战",
        "instruction": "把现象归入正确指标判据，守住阈值、趋势和多证据交叉关系。",
    },
    "match-3": {"gameType": "match-3", "template": "edugamekit.match-3/v1", "group": "classification", "mechanic": "三消分类挑战", "instruction": "把同属一个判据口径的对象凑成三连，快速复盘指标、证据和风险的分类关系。"},
    "risk-gate": {
        "gameType": "risk-gate",
        "template": "edugamekit.risk-gate/v2",
        "group": "gate",
        "mechanic": "风险闸门挑战",
        "instruction": "判断每个差异或动作应该进入哪个风险闸门，错误放行会扣分。",
    },
    "card-flow": {
        "gameType": "card-flow",
        "template": "edugamekit.card-flow/v2",
        "group": "sequence",
        "mechanic": "闭环卡牌挑战",
        "instruction": "按现象、证据、动作和复测顺序拼出工程闭环，跳步会导致返工。",
    },
    "signaling-order": {
        "gameType": "signal-order",
        "template": "edugamekit.signaling-order/v2",
        "group": "signaling",
        "mechanic": "信令排序挑战",
        "instruction": "按信令阶段和网元角色归门，不能把后续现象放到前序流程之前。",
    },
    "fault-hunt": {
        "gameType": "fault-hunt",
        "template": "edugamekit.fault-hunt/v2",
        "group": "diagnosis",
        "mechanic": "故障追踪挑战",
        "instruction": "从失败现象向前追溯根因阶段，排除连锁现象和背景噪声。",
    },
    "boss-review": {
        "gameType": "boss-review",
        "template": "edugamekit.boss-review/v2",
        "group": "review",
        "mechanic": "综合守线挑战",
        "instruction": "连续处理风险信号，在限时内保持分数、连击和容错余量。",
    },
}
def _rule(
    game_id: str,
    widget_id: str,
    title: str,
    objective: str,
    pairs: list[Pair],
    *,
    scenario: str,
    challenge: str,
    case_facts: list[str] | None = None,
    distractors: list[dict[str, str]] | None = None,
    level_goals: list[str] | None = None,
    failure_conditions: list[str] | None = None,
    feedback: dict[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "id": game_id,
        "widgetId": widget_id,
        "title": title,
        "objective": objective,
        "scenario": scenario,
        "challenge": challenge,
        "pairs": pairs,
        "caseFacts": case_facts
        or [
            f"现场任务：{scenario}",
            f"交付要求：{objective}",
            f"挑战约束：{challenge}",
        ],
        "distractors": distractors
        or [
            {"id": "d1", "label": "只记录主观描述", "whyWrong": "缺少可复核证据，无法支撑工程闭环。"},
            {"id": "d2", "label": "跳过时间和对象边界", "whyWrong": "查询窗口不清会放大排查范围。"},
            {"id": "d3", "label": "直接给经验结论", "whyWrong": "没有证据链的结论不能作为派单依据。"},
        ],
        "levelGoals": level_goals
        or [
            "先识别 2 个高优先级证据卡。",
            "连续完成 3 次正确归门，建立稳定判断。",
            "在限定时间内完成全部证据链并达到交付分。",
        ],
        "failureConditions": failure_conditions
        or [
            "关键证据门缺失导致链路不可复核。",
            "错把干扰项当作证据导致扣分超过上限。",
            "超时仍未完成全部目标门匹配。",
        ],
        "feedback": feedback
        or {
            "correct": "证据有效：这张证据卡能直接支撑当前工程判断。",
            "wrong": "先回到任务对象，判断它究竟要证明时间、位置、业务、网络还是复核动作。",
            "nearMiss": "方向接近，但证据粒度还不够支撑交付结论。",
            "complete": "证据链闭合，可以进入复盘或派单。",
        },
    }


EDUGAME_RULES: dict[str, dict[str, Any]] = {
    "P01": _rule(
        "device-wiring-lab",
        "P01-edugame-interactive-001",
        "采集设备连线",
        "在限定时间内把采集对象接入正确证据门，形成可交付的数据链。",
        [
            ("采集电脑", "业务脚本", "承载测试软件、账号和自动化业务脚本"),
            ("GPS 天线", "位置时间", "提供轨迹、速度和统一时间戳"),
            ("扫频仪", "频谱证据", "定位外部干扰、频点占用和异常噪声"),
            ("测试终端", "用户体验", "复现真实语音、视频和下载感知"),
            ("供电时钟", "同步约束", "保证设备不断电且稳定采样"),
            ("现场照片", "环境证据", "证明站址、接线和设备状态"),
        ],
        scenario="外场小组出发前要完成采集设备闭环检查。",
        challenge="有两个证据看似都能证明现场状态，但只有一个能支撑后续数据复核。",
    ),
    "P02": _rule(
        "form-collection-lab",
        "P02-edugame-interactive-001",
        "室外采集取证",
        "把室外站点信息拆成可复核字段，避免只留下模糊描述。",
        [
            ("经纬度", "位置证据", "锁定站点、楼宇和采样点"),
            ("天线方向", "方位证据", "判断覆盖朝向和主瓣偏移"),
            ("站高场景", "环境证据", "解释遮挡、街谷和传播条件"),
            ("小区标识", "网络对象", "关联后台小区和扇区"),
            ("照片编号", "现场证据", "支撑后续复核和报告引用"),
            ("采样时间", "时间窗口", "对齐日志、KPI 和天气客流变化"),
        ],
        scenario="同一投诉区域存在多个站点，表单字段必须能回溯到具体采样点。",
        challenge="玩家要分清环境描述、网络对象和时间窗口，不能把照片当作全部证据。",
    ),
    "P03": _rule(
        "complaint-evidence-lab",
        "P03-edugame-interactive-001",
        "投诉证据链拼装",
        "把投诉描述拆成时间、地点、业务、终端和网络证据，形成可派单复核的信息链。",
        [
            ("18:40-19:10 连续卡顿", "时间窗口", "限定日志、KPI 和话单的查询区间"),
            ("商场 B1 西侧扶梯口", "地理位置", "定位楼层、经纬度、小区和室分分布"),
            ("视频会议上行冻结", "业务类型", "区分视频、语音、网页和游戏体验问题"),
            ("Mate 60 / 5G SA", "终端型号", "排除终端能力、制式和版本差异"),
            ("RSRP -112 dBm 且 SINR 2 dB", "KPI/日志", "支撑弱覆盖或干扰的根因判断"),
            ("派室分复测并核查邻区", "复核动作", "明确下一步现场复测和后台核查"),
        ],
        scenario="用户投诉晚高峰在商场地下层视频会议反复冻结，客服记录里混有情绪描述、位置线索和零散 KPI。",
        challenge="必须从混杂材料中拼出可派单证据链，任何缺失都会让后台无法复核。",
        case_facts=[
            "投诉人称 5 月 22 日 18:40-19:10 在商场 B1 西侧扶梯口视频会议上行冻结 3 次。",
            "同地点其他用户网页浏览正常，但视频会议上行速率低且重传升高。",
            "终端为 Mate 60，网络制式显示 5G SA，电量充足，未开启省电模式。",
            "现场快照显示服务小区 RSRP -112 dBm、SINR 2 dB，邻区列表缺少 B1 室分小区。",
            "后台同窗口 PRB 利用率中等，未出现小区退服告警。",
            "派单要求写清复测点位、复测业务、后台核查对象和预期闭环证据。",
        ],
        distractors=[
            {"id": "d1", "label": "用户说非常生气", "whyWrong": "情绪能反映体验压力，但不能替代时间、地点或网络证据。"},
            {"id": "d2", "label": "商场整体人很多", "whyWrong": "客流只是背景，必须用 PRB、用户数或速率指标证明容量问题。"},
            {"id": "d3", "label": "建议重启手机", "whyWrong": "这是客服侧临时动作，不能作为网络派单的复核动作。"},
            {"id": "d4", "label": "网页浏览正常", "whyWrong": "它能帮助排除全业务故障，但不是本案视频上行冻结的核心证据门。"},
        ],
        level_goals=[
            "从 case facts 中先抓出时间、地点、业务 3 个硬边界。",
            "把终端和 KPI 证据补齐，排除无关投诉噪声。",
            "在 120 秒内完成 6 个目标门，并避开至少 3 个干扰项。",
            "输出能直接派给现场和后台的复核动作。",
        ],
        failure_conditions=[
            "缺少发生时间或具体位置，后台日志无法缩小查询窗口。",
            "把用户情绪、客流背景当作核心网络证据。",
            "未区分视频上行业务与普通网页体验，导致复测脚本错误。",
            "未给出现场复测和邻区核查动作，证据链不能闭环。",
        ],
        feedback={
            "correct": "证据有效：它能把投诉描述推进到可查询、可复测或可派单的一步。",
            "wrong": "这个信息还不能单独支撑派单，请回看它是否具备时间、地点、业务、终端或网络指向。",
            "nearMiss": "它可以作为背景，但还缺少指标或对象边界，不能放进核心证据链。",
            "complete": "投诉证据链已闭合：时间、地点、业务、终端、KPI 和复核动作都能被追溯。",
        },
    ),
    "P04": _rule(
        "route-planning-lab",
        "P04-edugame-interactive-001",
        "DT/CQT 路线挑战",
        "区分 DT 连续路测和 CQT 定点测试，选择正确采样策略。",
        [
            ("DT 路线", "连续覆盖", "沿道路观察覆盖和切换变化"),
            ("CQT 点位", "热点体验", "在固定场景复现业务"),
            ("采样间隔", "数据密度", "决定轨迹颗粒度和漏采风险"),
            ("业务脚本", "体验口径", "统一测试业务类型和时长"),
            ("异常标记", "复盘入口", "记录问题发生位置与现象"),
            ("复测路线", "闭环验证", "检验优化动作是否有效"),
        ],
        scenario="优化前需要同时覆盖主干道路和商圈热点。",
        challenge="玩家要判断连续采样和定点复现的边界，避免用一种路线解决所有问题。",
    ),
    "P05": _rule(
        "test-trouble-handling-lab",
        "P05-edugame-interactive-001",
        "测试异常处置链",
        "按先保数据、再定位原因、最后复测确认的顺序处理外场异常。",
        [
            ("设备掉线", "连接检查", "先确认线缆、端口和驱动状态"),
            ("GPS 丢星", "定位检查", "核对天线、遮挡和授时状态"),
            ("业务失败", "脚本检查", "确认账号、服务器和业务流程"),
            ("日志缺口", "采样检查", "补齐原始记录和时间戳"),
            ("异常截图", "现场证据", "保留故障瞬间和设备状态"),
            ("恢复复测", "结果确认", "验证问题是否消失"),
        ],
        scenario="路测中途连续出现掉线、脚本失败和日志缺口。",
        challenge="错误的先后顺序会造成证据丢失，玩家必须先保存现场再处理。",
    ),
    "P06": _rule(
        "kpi-threshold-lab",
        "P06-edugame-interactive-001",
        "测试数据诊断",
        "把路测现象映射到 KPI 证据，避免单指标误判。",
        [
            ("弱覆盖", "RSRP", "优先查看参考信号强度"),
            ("干扰上升", "SINR", "观察信干噪比变化"),
            ("容量拥塞", "PRB", "判断资源占用和忙时压力"),
            ("切换异常", "事件日志", "定位切换触发和失败点"),
            ("掉线问题", "RRC 释放", "查找连接释放原因"),
            ("结论输出", "多证据交叉", "至少两类证据互相印证"),
        ],
        scenario="一段路测同时出现低速率、卡顿和偶发掉线。",
        challenge="玩家必须用多指标交叉，而不是看到一个低 RSRP 就直接下结论。",
    ),
    "P07": _rule(
        "nms-function-map-lab",
        "P07-edugame-interactive-001",
        "网管功能定位",
        "把工程任务快速定位到网管入口，提高后台核查效率。",
        [
            ("告警查询", "告警模块", "定位网元异常和退服风险"),
            ("性能趋势", "性能模块", "查看 KPI 曲线和忙闲差异"),
            ("参数核查", "配置模块", "对比现网参数和基线"),
            ("拓扑关系", "拓扑模块", "确认网元连接和邻接关系"),
            ("工单流转", "任务模块", "记录处理动作和责任人"),
            ("权限核验", "安全模块", "确认可操作范围"),
        ],
        scenario="后台工程师要在 3 分钟内给外场反馈核查入口。",
        challenge="多个入口名称相似，玩家要按任务对象选择最短路径。",
    ),
    "P08": _rule(
        "hundred-floor-challenge",
        "P08-edugame-interactive-001",
        "运行监控守线",
        "连续判断 KPI、告警和趋势，守住运行风险线。",
        [
            ("掉线升高", "告警联动", "先看是否伴随网元或传输告警"),
            ("速率下降", "容量趋势", "核对 PRB、用户数和忙时曲线"),
            ("时延波动", "业务质量", "观察端到端体验和核心网路径"),
            ("小区退服", "状态核查", "确认网元状态和恢复时间"),
            ("突发拥塞", "热点定位", "圈定时间、区域和用户群"),
            ("班次交接", "监控摘要", "输出重点风险和待办动作"),
        ],
        scenario="监控大屏在晚高峰连续抛出多类风险信号。",
        challenge="玩家要分清告警、容量和体验趋势，不能把所有波动都升级为故障。",
    ),
    "P09": _rule(
        "parameter-audit-lab",
        "P09-edugame-interactive-001",
        "参数风险稽核",
        "把参数差异归入风险类型，判断是否需要回退或复核。",
        [
            ("功率偏差", "覆盖风险", "影响边缘覆盖和越区"),
            ("邻区缺失", "切换风险", "容易造成切换失败和掉线"),
            ("PCI 冲突", "识别风险", "导致小区混淆和接入异常"),
            ("门限异常", "触发风险", "影响事件判定和重选"),
            ("版本不一致", "基线风险", "需要核对变更单和模板"),
            ("回退条件", "安全闸门", "保留可恢复路径"),
        ],
        scenario="批量参数变更前发现多处与基线不一致。",
        challenge="玩家要把差异放进风险桶，并判断哪些必须先卡住发布。",
    ),
    "P10": _rule(
        "parameter-pairing-lab",
        "P10-edugame-interactive-001",
        "参数影响矩阵",
        "把参数动作和网络影响配对，避免盲目修改。",
        [
            ("发射功率", "覆盖范围", "影响信号强弱和重叠覆盖"),
            ("切换门限", "移动体验", "影响切换时机和乒乓"),
            ("邻区关系", "连续性", "支撑跨小区移动和重选"),
            ("带宽配置", "容量能力", "影响峰值速率和资源池"),
            ("5QI 策略", "业务保障", "影响承载优先级和时延"),
            ("变更窗口", "风险控制", "控制影响范围和恢复节奏"),
        ],
        scenario="优化建议里混合了无线、承载和业务保障参数。",
        challenge="玩家要先识别影响面，再决定是否允许进入变更窗口。",
    ),
    "P11": _rule(
        "optimization-loop-lab",
        "P11-edugame-interactive-001",
        "优化闭环拼装",
        "按现象、证据、假设、动作、复测和归档构建优化闭环。",
        [
            ("问题现象", "定位入口", "先描述可观测问题"),
            ("证据采集", "数据支撑", "避免凭经验判断"),
            ("根因假设", "原因树", "形成可验证方向"),
            ("优化动作", "实施项", "明确参数或工程动作"),
            ("复测验证", "效果证据", "比较前后差异"),
            ("归档交付", "闭环记录", "沉淀可复用经验"),
        ],
        scenario="一个弱覆盖问题已经定位，但团队需要把处理过程做成闭环。",
        challenge="玩家必须按闭环顺序归门，提前做动作或跳过复测都会失败。",
    ),
    "P12": _rule(
        "local-validation-lab",
        "P12-edugame-interactive-001",
        "优化结果验收",
        "对齐优化前后口径，判断结果是否真正达标。",
        [
            ("前测样本", "基线", "作为对比起点"),
            ("后测样本", "效果", "观察优化后变化"),
            ("同口径", "公平比较", "时间、地点、业务保持一致"),
            ("门限线", "验收标准", "判断是否达标"),
            ("副作用", "风险复查", "检查是否引入新问题"),
            ("结论", "交付意见", "给出通过、观察或返工"),
        ],
        scenario="现场复测显示速率提升，但投诉点附近仍有零星卡顿。",
        challenge="玩家要识别口径不一致和副作用，不能只看一个提升指标。",
    ),
    "P13": _rule(
        "optimization-report-lab",
        "P13-edugame-interactive-001",
        "报告交付审校",
        "把报告章节和证据材料配齐，形成可追溯交付物。",
        [
            ("问题摘要", "背景", "说明优化对象和影响范围"),
            ("证据截图", "支撑", "证明问题存在"),
            ("动作清单", "过程", "记录实施内容和时间"),
            ("对比曲线", "结果", "展示效果变化"),
            ("风险说明", "边界", "说明未解决项和观察窗口"),
            ("复盘建议", "沉淀", "指导后续优化"),
        ],
        scenario="优化动作完成后，需要把证据、动作和结果整理成可审计报告。",
        challenge="需要补齐可追溯材料，避免只有结论、缺少证据链。",
    ),
    "P14": _rule(
        "kpi-diagnosis-lab",
        "P14-edugame-interactive-001",
        "全网 KPI 采集",
        "把全网指标来源与应用场景配对，形成统一分析口径。",
        [
            ("PM 指标", "周期统计", "观察长期趋势和区域对比"),
            ("告警数据", "故障状态", "发现网元异常和中断"),
            ("MR 数据", "覆盖采样", "辅助覆盖和质量分析"),
            ("信令日志", "流程证据", "定位失败阶段和原因码"),
            ("投诉数据", "体验入口", "关联用户感知和热点"),
            ("口径表", "统一标准", "避免跨口径比较"),
        ],
        scenario="全网周报要汇总多个数据源，但不同团队的指标口径不一致。",
        challenge="玩家要先锁口径再做分析，避免把不同粒度的数据硬拼。",
    ),
    "P15": _rule(
        "rollout-governance-lab",
        "P15-edugame-interactive-001",
        "全网提升闸门",
        "在放量前判断风险闸门，保证优化动作可控。",
        [
            ("灰度批次", "范围控制", "先小范围验证"),
            ("红线 KPI", "安全阈值", "触发暂停或回退"),
            ("回退预案", "恢复能力", "保证异常可恢复"),
            ("审批记录", "变更合规", "留存操作依据"),
            ("监控窗口", "风险观察", "持续跟踪指标"),
            ("复盘报告", "经验沉淀", "记录放量结果"),
        ],
        scenario="试点优化效果不错，团队准备扩大到全网。",
        challenge="玩家要守住灰度、红线和回退三个闸门，不能因为试点成功就直接放量。",
    ),
    "P16": _rule(
        "retest-compare-lab",
        "P16-edugame-interactive-001",
        "复测差值判断",
        "把复测差值映射到验收结论，识别改善、持平和恶化。",
        [
            ("RSRP 提升", "覆盖改善", "弱覆盖缓解"),
            ("SINR 下降", "干扰风险", "需要查新增干扰或重叠覆盖"),
            ("速率提升", "体验改善", "说明容量或无线质量变好"),
            ("掉线不变", "未闭环", "继续检查根因"),
            ("样本不足", "证据不足", "不能轻易结论"),
            ("结论发布", "验收意见", "输出是否通过"),
        ],
        scenario="复测数据有提升也有退化，验收会要给出明确意见。",
        challenge="玩家必须识别样本不足和指标互相冲突的情况。",
    ),
    "P17": _rule(
        "signaling-order-lab",
        "P17-edugame-interactive-001",
        "信令流程排序",
        "按 UE、gNB、AMF、UPF 的协作顺序识别关键 5G 信令。",
        [
            ("RRC 建立", "接入控制", "先建立无线连接"),
            ("NAS 注册", "核心网注册", "完成用户登记"),
            ("鉴权安全", "安全上下文", "建立可信连接"),
            ("PDU 会话", "业务承载", "创建数据通道"),
            ("用户面转发", "业务数据", "进入真实业务"),
            ("异常释放", "故障定位", "回看失败阶段"),
        ],
        scenario="信令日志顺序被打乱，需要还原一次 5G 接入到业务建立的过程。",
        challenge="玩家要按阶段归门，不能把用户面数据放到注册之前。",
    ),
    "P18": _rule(
        "fault-cause-lab",
        "P18-edugame-interactive-001",
        "信令故障归因",
        "把失败现象归入对应信令阶段，形成可复核故障链。",
        [
            ("接入失败", "RRC 阶段", "检查无线接入和资源分配"),
            ("注册失败", "NAS 阶段", "检查注册流程和原因码"),
            ("鉴权失败", "安全阶段", "检查密钥、鉴权和安全模式"),
            ("会话失败", "PDU 阶段", "检查会话建立和切片策略"),
            ("业务中断", "用户面", "检查转发路径和承载状态"),
            ("优化建议", "闭环动作", "给出复测方案"),
        ],
        scenario="一次业务失败日志包含多个原因码，需要判断真正卡住的信令阶段。",
        challenge="玩家要从失败点向前追溯，避免把后续连锁现象误判为根因。",
    ),
}
def _target_gates(rule: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"id": f"t{index + 1}", "label": target, "role": "证据门", "accepts": reason}
        for index, (_, target, reason) in enumerate(rule["pairs"])
    ]
def _evidence_cards(rule: dict[str, Any]) -> list[dict[str, str]]:
    priorities = ["critical", "critical", "high", "high", "normal", "normal"]
    feedback = rule["feedback"]
    return [
        {
            "id": f"i{index + 1}",
            "label": token,
            "role": reason,
            "severity": priorities[index] if index < len(priorities) else "normal",
            "expectedTargetId": f"t{index + 1}",
            "hint": f"关键点：{reason}",
            "caseFact": (rule["caseFacts"][index] if index < len(rule["caseFacts"]) else rule["scenario"]),
            "challenge": f"判断“{token}”应进入哪个目标门，并避开相似干扰项。",
            "feedback": f"{feedback['correct']} {reason}",
            "successFeedback": f"{feedback['correct']} {reason}",
            "errorFeedback": feedback["wrong"],
        }
        for index, (token, _, reason) in enumerate(rule["pairs"])
    ]
def _challenge_levels(rule: dict[str, Any], time_limit_sec: int, mistake_limit: int, pass_score: int) -> list[dict[str, str]]:
    goals = rule["levelGoals"]
    labels = ["识别", "抗干扰", "交付", "复盘"]
    constraints = [
        "允许查看提示，但连续命中才加分。",
        "干扰项会扣分并清空连击。",
        f"{time_limit_sec} 秒内达到 {pass_score} 分，最多 {mistake_limit} 次失误。",
        "必须能说明证据链为什么闭合。",
    ]
    return [
        {
            "id": f"level-{index + 1}",
            "label": labels[index] if index < len(labels) else f"关卡 {index + 1}",
            "goal": goal,
            "constraint": constraints[index] if index < len(constraints) else "",
        }
        for index, goal in enumerate(goals)
    ]
def _scoring_dimensions(template_id: str) -> list[dict[str, Any]]:
    main_label = {
        "device-connect": "接口匹配准确",
        "evidence-chain": "证据归门准确",
        "route-runner": "路线策略准确",
        "kpi-guard": "指标判据准确",
        "match-3": "分类消除准确",
        "risk-gate": "风险闸门准确",
        "card-flow": "流程顺序准确",
        "signaling-order": "信令阶段准确",
        "fault-hunt": "根因定位准确",
        "boss-review": "风险处置准确",
    }.get(template_id, "证据归门准确")
    return [
        {"id": "accuracy", "label": main_label, "points": 50},
        {"id": "distractorControl", "label": "干扰项识别", "points": 20},
        {"id": "speed", "label": "限时完成", "points": 15},
        {"id": "streak", "label": "连续命中", "points": 15},
    ]
def _mechanic_profile(template_id: str) -> dict[str, Any]:
    profiles = {
        "device-connect": {
            "challengeMode": "connect",
            "visualMetaphor": "设备端口连线",
            "pressure": "链路未闭合会导致采集数据不可复核。",
            "winCondition": "全部设备接入正确接口槽，且失误不超过上限。",
            "rules": ["先选择设备卡，再选择对应接口槽。", "接错接口会断开连击并扣除交付分。", "全部接口闭合后形成可交付采集链路。"],
        },
        "evidence-chain": {
            "challengeMode": "match",
            "visualMetaphor": "证据卡归门",
            "pressure": "证据缺口会让派单无法复核。",
            "winCondition": "时间、地点、业务、终端、网络和动作证据全部归门。",
            "rules": ["先判断证据要证明的对象。", "干扰项只能辅助理解，不能作为主证据。", "证据链完整后才能进入复盘。"],
        },
        "route-runner": {
            "challengeMode": "route",
            "visualMetaphor": "测试路线跑道",
            "pressure": "路线策略错误会造成覆盖盲区或样本偏差。",
            "winCondition": "按 DT/CQT 场景完成路线、点位和采样策略选择。",
            "rules": ["先区分连续道路测试和定点质量测试。", "每个检查点只能放入能解释该场景的策略。", "采样密度和业务脚本必须与测试目的一致。"],
        },
        "kpi-guard": {
            "challengeMode": "threshold",
            "visualMetaphor": "KPI 阈值仪表",
            "pressure": "指标误判会让优化动作偏离根因。",
            "winCondition": "把每个现象归入正确 KPI 判据并守住达标线。",
            "rules": ["先看指标解释的是覆盖、干扰还是容量。", "不能用单一 KPI 直接替代根因判断。", "连续命中会提高仪表安全余量。"],
        },
        "match-3": {"challengeMode": "match3", "visualMetaphor": "指标分类棋盘", "pressure": "错把不同口径混成一类，会让复盘结论失真。", "winCondition": "在限定时间内完成多组三连分类，确认每组对象属于同一判据口径。", "rules": ["先看对象属于哪个指标、证据或风险口径。", "每次点选 3 个同类对象才能消除。", "错选会打断连击并记录薄弱知识点。"]},
        "risk-gate": {
            "challengeMode": "gate",
            "visualMetaphor": "风险闸门",
            "pressure": "错误放行会把参数风险带入现网。",
            "winCondition": "把所有差异和动作拦到正确风险门。",
            "rules": ["先识别参数差异影响的对象。", "不能把覆盖、切换、识别和触发风险混放。", "错放风险门会降低通关余量。"],
        },
        "card-flow": {
            "challengeMode": "sequence",
            "visualMetaphor": "闭环卡牌流程",
            "pressure": "跳过证据或复测会造成返工。",
            "winCondition": "按现象、证据、动作、复测顺序完成闭环。",
            "rules": ["先放现象和证据，再放动作。", "任何优化动作都必须能回到复测指标。", "流程位全部归位才算闭环。"],
        },
        "signaling-order": {
            "challengeMode": "ladder",
            "visualMetaphor": "信令梯形图",
            "pressure": "信令阶段错位会导致定位方向错误。",
            "winCondition": "按接入、注册、安全、承载和用户面顺序归位。",
            "rules": ["先确定消息属于空口还是核心网阶段。", "不能把用户面问题提前到接入阶段。", "阶段排序正确后才能追踪失败点。"],
        },
        "fault-hunt": {
            "challengeMode": "radar",
            "visualMetaphor": "故障追踪雷达",
            "pressure": "把连锁现象当根因会扩大排障范围。",
            "winCondition": "从失败现象反推到最早可解释的根因阶段。",
            "rules": ["先定位失败出现在哪个阶段。", "区分根因、后果和背景噪声。", "命中根因门后再给出处置方向。"],
        },
        "boss-review": {
            "challengeMode": "boss",
            "visualMetaphor": "风险 Boss 压制",
            "pressure": "连续错判会让风险 Boss 回血。",
            "winCondition": "在限时内压低风险血条并达到交付分。",
            "rules": ["每张技能卡对应一个处置门。", "连续命中会提高压制伤害。", "错误处置会损失连击并增加失败压力。"],
        },
    }
    return profiles.get(template_id, profiles["evidence-chain"])
def _onboarding_for_template(template_id: str) -> list[dict[str, str]]:
    profile = _mechanic_profile(template_id)
    return [
        {"title": "看目标", "body": profile["rules"][0]},
        {"title": "做判断", "body": profile["rules"][1]},
        {"title": "控风险", "body": profile["pressure"]},
        {"title": "达成交付", "body": profile["winCondition"]},
    ]


def build_edugame_config(project_id: str, rule: dict[str, Any], legacy_manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    template_id = GAME_TEMPLATE_BY_PROJECT.get(project_id, "evidence-chain")
    profile = GAME_PROFILES[template_id]
    mechanic = _mechanic_profile(template_id)
    time_limit_sec = int(rule.get("timeLimitSec", 120))
    mistake_limit = int(rule.get("mistakeLimit", 4))
    pass_score = int(rule.get("passScore", 80))
    total_points = int(rule.get("totalPoints", 100))
    targets = list(rule.get("targetGates") or _target_gates(rule))
    items = list(rule.get("evidenceTokens") or _evidence_cards(rule))
    time_limit_sec = game_duration_sec(template_id, len(items), time_limit_sec)
    answer_pairs = {item["id"]: item["expectedTargetId"] for item in items}
    challenge_levels = _challenge_levels(rule, time_limit_sec, mistake_limit, pass_score)
    feedback = rule["feedback"]
    canonical_type = CANONICAL_GAME_TYPE.get(template_id, profile["gameType"])
    mechanic_family = TEMPLATE_MECHANIC_FAMILY.get(canonical_type, canonical_type)
    rule_checks = list(mechanic["rules"])
    error_feedback = [feedback["wrong"], "先核对对象、证据门和干扰项边界，再重新选择。"]
    replay_prompts = [challenge_levels[0]["goal"] if challenge_levels else rule["objective"], challenge_levels[-1]["goal"] if challenge_levels else mechanic["winCondition"]]
    success_criteria = [mechanic["winCondition"], f"达到 {pass_score} 分，且错误不超过 {mistake_limit} 次。"]
    action_label = "开始挑战"
    standard_items = [
        {
            "id": item["id"],
            "label": item["label"],
            "text": item.get("caseFact", ""),
            "prompt": item.get("challenge", item.get("hint", "")),
            "definition": item.get("role", item.get("feedback", "")),
            "target_id": item["expectedTargetId"],
            "explanation": item.get("successFeedback", item.get("feedback", "")),
            "kp": item["expectedTargetId"],
            "order": index + 1,
            "correct": True,
        }
        for index, item in enumerate(items)
    ]
    distractor_items = [
        {
            "id": item["id"],
            "label": item["label"],
            "text": item.get("whyWrong", feedback["wrong"]),
            "prompt": "这是干扰信息，先判断它是否能直接支撑本关目标。",
            "definition": item.get("whyWrong", "不能直接支撑本关目标。"),
            "target_id": targets[index % len(targets)]["id"] if targets else "",
            "explanation": item.get("whyWrong", feedback["wrong"]),
            "kp": targets[index % len(targets)]["id"] if targets else "",
            "correct": False,
        }
        for index, item in enumerate(rule["distractors"][:3])
    ]
    standard_levels = [{
        "level_id": f"{project_id.lower()}-level-01",
        "type": canonical_type,
        "goal": rule["objective"],
        "time_limit": time_limit_sec,
        "mistake_limit": mistake_limit,
        "items": standard_items + distractor_items,
    }]

    return {
        "schema": "dgbook.edugame-pixi/v1",
        "game_id": rule["id"],
        "game_type": canonical_type,
        "lesson_id": project_id,
        "duration": time_limit_sec,
        "difficulty": "normal",
        "asset_pack": "dgbook-5g-v1",
        "mistake_limit": mistake_limit,
        "pass_score": pass_score,
        "knowledge_points": [
            {
                "id": target["id"],
                "name": target["label"],
                "description": target.get("role", ""),
                "weight": 1,
            }
            for target in targets
        ],
        "levels": standard_levels,
        "score_rule": {
            "base": 0,
            "correct": 12,
            "wrong_penalty": 6,
            "combo_bonus": True,
            "time_bonus": True,
        },
        "reward_rule": {
            "stars": [60, 75, 90],
            "badges": badges_for_template(template_id),
        },
        "ui": {
            "arenaLabel": "5G 训练场",
            "cardMark": "5G",
            "scenario": rule["scenario"],
            "instruction": profile["instruction"],
            "actionLabel": action_label,
            "feedbackHint": feedback["wrong"],
            "onboarding": [step["body"] for step in _onboarding_for_template(template_id)],
        },
        "interaction": {
            "actionLabel": action_label,
            "ruleChecks": rule_checks,
            "errorFeedback": error_feedback,
            "replayPrompts": replay_prompts,
        },
        "ruleChecks": rule_checks,
        "errorFeedback": error_feedback,
        "replayPrompts": replay_prompts,
        "successCriteria": success_criteria,
        "actionLabel": action_label,
        "template": profile["template"],
        "templateId": template_id,
        "mechanicFamily": mechanic_family,
        "id": rule["id"],
        "projectId": project_id,
        "title": rule["title"],
        "gameType": profile["gameType"],
        "objective": rule["objective"],
        "scenario": rule["scenario"],
        "challenge": rule["challenge"],
        "instruction": profile["instruction"],
        "challengeMode": mechanic["challengeMode"],
        "winCondition": mechanic["winCondition"],
        "pressureModel": {
            "label": mechanic["pressure"],
            "failureBudget": mistake_limit,
            "timeBudgetSec": time_limit_sec,
        },
        "mechanicRules": mechanic["rules"],
        "timeLimitSec": time_limit_sec,
        "mistakeLimit": mistake_limit,
        "passScore": pass_score,
        "totalPoints": total_points,
        "caseFacts": rule["caseFacts"],
        "evidenceTokens": items,
        "targetGates": targets,
        "distractors": rule["distractors"],
        "levelGoals": rule["levelGoals"],
        "failureConditions": rule["failureConditions"],
        "feedback": feedback,
        "inputModel": {
            "kind": profile["gameType"],
            "group": profile["group"],
            "template": profile["template"],
            "templateId": template_id,
            "mechanicFamily": mechanic_family,
            "gameClass": rule["title"],
            "mechanicLabel": profile["mechanic"],
            "challengeMode": mechanic["challengeMode"],
            "visualMetaphor": mechanic["visualMetaphor"],
            "instruction": profile["instruction"],
            "minActions": 6,
            "caseFacts": rule["caseFacts"],
            "options": items,
            "targets": targets,
            "distractors": rule["distractors"],
            "onboardingPath": _onboarding_for_template(template_id),
            "mechanicRules": mechanic["rules"],
            "challengeMode": mechanic["challengeMode"],
            "winCondition": mechanic["winCondition"],
            "levelGoals": rule["levelGoals"],
            "failureConditions": rule["failureConditions"],
        },
        "answerModel": {
            "kind": profile["gameType"],
            "group": profile["group"],
            "pairs": answer_pairs,
            "targetIds": [target["id"] for target in targets],
            "requiredEvidenceCount": len(items),
            "distractorIds": [item["id"] for item in rule["distractors"]],
            "winCondition": mechanic["winCondition"],
            "rationale": "每个判断必须回到工程证据，不能只凭描述、情绪或经验结论。",
        },
        "challengeLevels": challenge_levels,
        "gameExperience": {
            "onboardingPath": _onboarding_for_template(template_id),
            "mechanicRules": mechanic["rules"],
            "challengeMode": mechanic["challengeMode"],
            "winCondition": mechanic["winCondition"],
            "levelGoals": rule["levelGoals"],
            "failureConditions": rule["failureConditions"],
            "rewardModel": {"badges": badges_for_template(template_id)},
            "scoreMoments": [
                {"id": "first-critical", "label": "首个关键证据归门", "points": 10},
                {"id": "streak-3", "label": "三连击", "points": 15},
                {"id": "no-distractor", "label": "避开干扰项", "points": 15},
                {"id": "chain-complete", "label": "证据链闭合", "points": 30},
            ],
        },
        "scoringRubric": {
            "totalPoints": total_points,
            "passScore": pass_score,
            "dimensions": _scoring_dimensions(template_id),
        },
        "feedbackHint": feedback["wrong"],
        "reviewSummary": {
            "pass": f"{rule['title']}已达标：证据链完整，可以进入案例复盘或工程交付。",
            "fail": f"{rule['title']}未达标：请回到缺失目标门，重新确认证据卡、证据门和干扰项边界。",
        },
        "legacyManifestId": (legacy_manifest or {}).get("id", rule["id"]),
    }
