"""Knowledge-first storyboard model for 5G lessons."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from .content_media import MediaItem, diagram_labels, diagram_template, is_real_photo
from .media_rules import manim_target_unit_id, optional_manim_tracks


MediaResolver = Callable[[str, dict[str, str], dict[str, str]], str | None]
MakeAction = Callable[..., dict[str, Any]]
AnimationActions = Callable[[str, str, MakeAction, str], list[dict[str, Any]]]


SECTION_TITLES = {
    "concept": "概念与对象",
    "criteria": "工程判读",
    "evidence": "数据与现场佐证",
    "practice": "操作校验",
    "review": "闭环复盘",
}


STORYLINES: dict[str, list[tuple[str, str, str]]] = {
    "P01": [
        ("室内资源边界", "机房、机柜、主设备和配套资源先建台账。", "室内信息采集要先锁定资源边界：机房位置、机柜编号、BBU、AAU/RRU、电源、传输、接地和温控共同决定站点可用性。"),
        ("设备拓扑", "主设备、承载和走线关系要可追溯。", "设备记录不止列型号，还要说明端口、光纤、电源线和传输承载的连接关系，后续定位才知道从哪一段查起。"),
        ("运行条件", "供电、接地、温控和传输共同影响站点稳定性。", "运行条件要和主设备一起记录：供电容量、接地状态、空调能力和传输可用性会直接影响告警、业务稳定和后续排障。"),
        ("现场证据", "机柜、端口和走线路径应对应同一设备。", "现场证据要能对应机柜、端口和走线路径，表单字段要能追溯到实体对象，避免后续复核时只剩孤立图片。"),
        ("关系校验", "用设备到配套的链路校验采集完整性。", "完整性校验关注主设备、传输、电源、接地和温控是否形成闭合关系，缺一段都会影响后续规划、测试或故障定位。"),
        ("资料归档", "形成可复核的室内站点基础资料。", "室内资料归档要保留对象、位置、连接、运行条件和证据索引，为路测、参数核查和优化判断提供共同底座。"),
    ],
    "P02": [
        ("室外覆盖边界", "地形、站向、邻区和遮挡共同定义覆盖空间。", "室外采集先描述无线信号面对的空间条件，楼宇、道路、站向、邻区和遮挡决定覆盖边界与风险位置。"),
        ("天线姿态", "方位角、下倾角和挂高决定扇区指向。", "天线姿态要把方位角、机械下倾、电下倾和挂高放在同一口径下记录，才能解释弱覆盖、越区覆盖和重叠覆盖。"),
        ("场景落点", "主干道、热点和投诉点要落到地图。", "外场证据应沿道路、热点、投诉点和疑似遮挡区布点，每个点都保留位置、朝向和关联小区。"),
        ("遮挡证据", "照片标注位置、朝向、参照物和遮挡类型。", "照片不是装饰材料，要用参照物说明拍摄方向、遮挡高度、距离关系和关联扇区，支撑后续覆盖判断。"),
        ("字段核验", "站点、环境、扇区和风险字段保持一致。", "字段核验关注站点编号、扇区方向、邻区关系、遮挡描述和照片标签是否一致，避免空间证据断链。"),
        ("风险成图", "沉淀覆盖方向、遮挡点和邻区风险图。", "室外资料最终应形成可复查的风险图层，明确覆盖方向、遮挡位置、热点区域和邻区边界。"),
    ],
    "P03": [
        ("投诉事实", "时间、地点、业务、终端先转成可复现事实。", "投诉受理先把用户描述转为可验证事实：发生时间、精确地点、业务类型、终端型号、套餐状态和出现频次。"),
        ("复现场景", "同地点、同业务、同终端条件下复现现象。", "复现时同步记录服务小区、无线指标、业务动作和终端状态，缩小网络、终端、业务平台和环境之间的边界。"),
        ("证据交叉", "投诉、路测、告警、KPI 和工参交叉验证。", "单一口述不能直接定性，需把投诉记录与测试日志、告警、KPI、工参和覆盖图层对齐。"),
        ("归因分层", "覆盖、容量、切换、终端和业务平台分层判断。", "归因先分层，再给动作：弱覆盖看站点与天线，容量忙看负荷，切换异常看邻区和参数，终端或平台问题走协同。"),
        ("工单闭环", "处理动作、责任人和回访口径保持一致。", "工单闭环要记录根因假设、处理动作、责任边界、复测证据和回访口径，保证问题可追踪。"),
        ("场景沉淀", "将高频投诉沉淀为可复用定位路径。", "高频投诉要沉淀成场景化定位路径，保留症状、关键证据、判断顺序和处理边界。"),
    ],
    "P04": [
        ("DT/CQT 边界", "DT 看连续移动体验，CQT 看定点业务质量。", "DT 用于验证道路和区域连续覆盖，CQT 用于验证热点点位接入、保持和业务质量，两类测试互补。"),
        ("测试设计", "路线、点位、脚本、终端和采样口径先固定。", "测试前固定路线、点位、业务脚本、终端配置、GPS、日志格式和异常标记，保证后续数据可对比。"),
        ("同步采样", "位置、时间、业务动作和网络事件同步采集。", "采样链路要保证 GPS、LOG、业务动作、KPI 和信令事件处在同一时间轴，便于回放定位。"),
        ("指标联判", "RSRP、SINR、切换、掉线和吞吐联合判读。", "DT/CQT 判读不依赖单点指标，需把覆盖强度、无线质量、切换事件、掉线和吞吐体验串成证据链。"),
        ("路线核验", "测试方式、路径密度和点位代表性要匹配。", "核验测试设计时重点看路线是否覆盖问题区域，点位是否代表热点，业务脚本是否贴近真实体验。"),
        ("同口径复测", "优化前后用同路线或同点位比较效果。", "测试结论只有在同路线、同点位、同业务口径下比较才可靠，复测结果用于确认优化效果。"),
    ],
    "P05": [
        ("异常入口", "掉线、无 GPS、终端异常和软件异常先分类。", "测试异常先按入口分类：采集掉线、GPS 丢失、终端异常、软件崩溃、授权失效或现场受阻，对应不同排查路径。"),
        ("硬件排查", "终端、线缆、端口、电源和 GPS 逐段确认。", "硬件排查沿连接链路推进，先确认端口、线缆、电源、GPS 模块和终端状态，再判断是否需要更换设备。"),
        ("软件排查", "License、驱动、配置、版本和存储影响采集。", "软件问题常来自授权、驱动、配置文件、版本兼容和磁盘空间，处理时要保留错误码和日志证据。"),
        ("现场协同", "入场、车辆、人员和客户接口纳入问题清单。", "现场条件会改变测试质量，入场限制、车辆路线、人员配合和客户接口都要进入问题清单并标注责任边界。"),
        ("处置判定", "现象、原因假设和处置动作保持一一对应。", "处置判定要把异常现象、证据来源、原因假设和动作结果对应起来，避免盲目重启或重装。"),
        ("问题归档", "保留异常现象、处理动作和复测结论。", "测试问题归档应包含现象、影响范围、排查链路、处理动作、责任边界和复测结论。"),
    ],
    "P06": [
        ("数据口径", "LOG、地图、工参和事件先对齐时间轴。", "数据分析前先统一时间、坐标、工参版本和事件口径，保证地图轨迹、KPI 曲线和信令记录可互相定位。"),
        ("覆盖图层", "RSRP、PCI 和服务小区定位覆盖关系。", "覆盖分析要同时看强弱分布、PCI、服务小区和邻区关系，区分弱覆盖、越区覆盖和重叠覆盖。"),
        ("质量图层", "SINR、干扰、掉线和切换解释体验波动。", "无线质量需联动 SINR、干扰源、切换事件、掉线点和业务速率，不能只凭颜色图下结论。"),
        ("事件回放", "异常点、指标曲线和信令消息同步回放。", "回放时将异常位置、KPI 曲线、信令事件和业务动作对齐，判断问题发生在无线、参数、终端还是业务侧。"),
        ("异常定位", "从字段缺失、事件突变和消息断点定位原因。", "异常定位关注字段缺失、指标突变、切换失败、掉线事件和信令断点，逐步收敛到可验证原因。"),
        ("建议固化", "形成问题点、证据链、原因和优化建议。", "分析结论要保留问题点、证据链、原因判断、建议动作和复测口径，便于后续闭环。"),
    ],
    "P07": [
        ("网管对象", "先识别网元、对象层级、权限和拓扑。", "网管入口不是菜单集合，而是网络对象管理模型，需理解 ManagedElement、小区、告警、PM 和 CM 的层级关系。"),
        ("告警过滤", "按级别、时间、对象和状态筛出有效告警。", "告警监控要过滤严重级别、发生时间、清除状态、关联对象和影响范围，优先处理影响业务的事件。"),
        ("性能查询", "PM 指标按趋势、对比和忙时短板判读。", "性能查询关注趋势、忙时、同比和环比，不把瞬时值当作全局结论。"),
        ("配置核查", "CM 数据对齐规划、版本和变更记录。", "配置核查要确认当前值、规划值、版本来源和变更记录，识别参数漂移和误配置风险。"),
        ("权限边界", "角色权限、操作范围和审计记录必须清晰。", "网管操作要明确角色权限和审计记录，查询、修改、派单和回退不能混用责任边界。"),
        ("派单闭环", "监控发现转成可跟踪工单和复核结果。", "网管价值在于把发现、定位、派单、处理和复核连成闭环，形成可追踪的运维记录。"),
    ],
    "P08": [
        ("监控对象", "小区、网元、告警和 KPI 数据源先关联。", "运行监控要先建立对象链：网元、小区、告警事件、PM 计数器、业务 KPI 和时间窗必须指向同一诊断对象。"),
        ("告警分诊", "活动告警按级别、时长、影响面和相关性分诊。", "告警处理先区分活动告警与历史告警，再按严重级别、持续时长、影响小区、派生关系和清除状态确定优先级。"),
        ("KPI 趋势", "接通率、掉线率、切换率和吞吐看趋势突变。", "运行监控重点看接通率、掉线率、切换成功率、PRB 利用率、吞吐和时延的趋势突变，而非孤立数值。"),
        ("TOPN 收敛", "TOPN 用于锁定高影响小区、时段和业务。", "TOPN 分析把全网异常收敛到高影响小区、高峰时段和关键业务，结合告警与容量指标判断优先处置对象。"),
        ("阈值策略", "阈值、抑制规则和派单等级要联动配置。", "阈值策略要同时考虑静态门限、动态基线、告警抑制、派单等级和观察周期，避免误报与漏报。"),
        ("监控闭环", "发现、分诊、派单、观察和复核形成运行闭环。", "监控结论必须进入运维闭环：发现异常、分诊定位、派单处理、观察恢复曲线，并复核 KPI 是否回到基线。"),
    ],
    "P09": [
        ("参数范围", "明确网元、小区、邻区、切片和策略对象。", "参数核查先定义对象范围：网元、小区、邻区、切片、QoS 或策略对象不同，影响域和回退范围也不同。"),
        ("现网快照", "当前值必须带版本、时间、导出范围和来源。", "现网值需要保存导出时间、网管版本、对象范围和数据来源，避免把过期或局部数据当作全量事实。"),
        ("规划基线", "规划值按场景、频段、邻区和业务策略建基线。", "规划基线不是孤立表格，要结合覆盖场景、频段层、邻区关系、容量目标和业务策略确定期望取值。"),
        ("风险分叉", "差异按覆盖、切换、接入、容量和业务树分流。", "参数差异先进入风险树：覆盖类看功率和倾角，切换类看邻区与门限，容量类看负荷策略，业务类看 QoS 与切片策略。"),
        ("处置准入", "变更建议必须绑定影响域、回退点和观察窗。", "不是所有差异都立即修改，处置准入要同时满足风险等级、影响范围、回退条件、变更窗口和监控观察要求。"),
        ("差异治理", "沉淀差异清单、风险等级、动作和回退条件。", "参数核查最终形成治理清单，包含差异类型、影响域、风险等级、建议动作、审批状态和回退条件。"),
    ],
    "P10": [
        ("变更触发", "参数设置来自投诉、测试、KPI 或规划变更。", "参数设置必须有明确触发源，可能是投诉定位、DT/CQT 证据、KPI 劣化、规划调整或一致性核查。"),
        ("目标取值", "目标值要说明场景、边界、依据和适用范围。", "参数目标值应标注适用场景、频段、业务目标、边界条件和依据来源，避免把经验值泛化到全网。"),
        ("影响评估", "覆盖、切换、容量、接入和业务策略联动评估。", "参数变更会影响小区、邻区、用户体验和业务策略，实施前要评估影响域、风险等级和回退影响。"),
        ("执行窗口", "备份、审批、窗口、回退和监控同步设计。", "执行方案要包括审批记录、配置备份、变更窗口、回退点、监控指标和责任人，确保动作可控。"),
        ("风险判定", "变更前确认副作用、互斥参数和观察指标。", "风险判定关注参数之间的耦合关系、互斥条件、邻区影响和观察指标，避免局部优化引入新问题。"),
        ("版本固化", "保存版本、责任、观察结果和经验边界。", "变更后要固化配置版本，记录责任人、观察结果、异常处理和适用边界，为后续同类调整提供依据。"),
    ],
    "P11": [
        ("责任场景", "问题先归入覆盖、干扰、容量、参数或承载场景。", "优化实施前要把现象压缩到责任场景，明确是覆盖、干扰、容量、参数、传输承载还是核心网协同问题。"),
        ("动作拆解", "工程、参数、资源、邻区和协同动作分开管理。", "优化方案要拆成可执行动作，区分工程整改、参数调整、资源扩容、邻区优化、投诉回访和跨专业协同。"),
        ("排程回退", "实施窗口、影响面、回退点和责任人必须明确。", "排程设计要考虑低峰窗口、影响小区、业务风险、配置备份、回退步骤和责任人，确保执行可控。"),
        ("执行监控", "实施中同步观察 KPI、告警、容量和用户体验。", "执行过程要持续观察关键 KPI、活动告警、容量负荷和用户体验，及时识别副作用。"),
        ("顺序校验", "从根因到动作再到复测保持因果顺序。", "实施顺序要与根因假设匹配，先处理基础约束，再做参数和资源动作，最后以同口径复测确认效果。"),
        ("经验沉淀", "记录场景、动作、结果、限制和适用边界。", "优化经验要沉淀场景特征、动作组合、效果指标、限制条件和适用边界，避免下次机械套用。"),
    ],
    "P12": [
        ("基线冻结", "优化前指标、样本、范围和时间窗先冻结。", "结果验证从基线冻结开始，固定问题小区、对照小区、统计周期、样本量、业务场景和数据来源。"),
        ("验收口径", "目标线包含阈值、置信样本和业务场景。", "验收目标必须可计算，明确指标阈值、样本下限、忙闲时口径、DT/CQT 路径和业务场景。"),
        ("差值验证", "用前后差值、趋势和置信度判断有效性。", "验证重点是同口径前后差值，结合趋势曲线、TOPN 变化、样本置信度和用户体验判断优化是否有效。"),
        ("异常回钻", "未达标小区回看工参、告警、日志和容量。", "局部未达标时沿证据链回钻，核查工参、告警、信令日志、容量负荷和测试轨迹，定位残余原因。"),
        ("复测路径", "同路线、同点位、同业务脚本确认恢复情况。", "复测路径要保持路线、点位、终端、业务脚本和统计口径一致，避免环境差异造成假改善或假劣化。"),
        ("结论闭环", "结论同时给出达标项、遗留项、风险和后续动作。", "验证闭环要说明达标指标、未达标原因、遗留风险、固化配置和后续观察动作，形成可审计结论。"),
    ],
    "P13": [
        ("报告主线", "问题、原因、动作和效果先形成一句主线。", "优化报告开头要先给主线，说明问题是什么、证据指向哪里、采取了什么动作以及效果如何。"),
        ("证据编排", "图表、日志、截图和指标围绕结论排序。", "证据材料按结论服务，不堆截图；图表、日志、地图和关键指标要能支撑每一个判断。"),
        ("过程可追溯", "分析路径要能从原始证据复原判断。", "报告中的过程部分需保留关键证据和推理顺序，让他人能从原始日志、KPI 和工参复原判断。"),
        ("效果表达", "前后指标、业务体验和异常说明共同呈现。", "效果表达要包含前后指标对比、业务体验变化、异常样本说明和适用边界，避免只写结论。"),
        ("结构校验", "摘要、证据、动作、效果和风险保持闭合。", "结构校验关注章节之间是否闭合，摘要中的结论必须能在证据、动作和效果章节找到支撑。"),
        ("经验归档", "保留风险、建议、适用场景和复用边界。", "报告归档要留下遗留风险、后续建议、适用场景和复用边界，支撑后续问题处理。"),
    ],
    "P14": [
        ("指标口径", "指标定义、周期、对象和数据源先统一。", "全网指标采集最怕口径漂移，需明确指标定义、采样周期、统计对象、数据源和缺失处理规则。"),
        ("PM 数据", "PM 计数器用于观察全网趋势和小区排名。", "PM 数据适合看全网趋势、忙时负荷和小区排名，但必须检查统计周期、计数器完整性和异常清零。"),
        ("测试数据", "DT/CQT 补足用户路径和热点体验证据。", "测试数据从用户体验侧补足 PM 盲区，能定位具体道路、楼宇、热点点位和业务脚本下的问题。"),
        ("告警锚点", "告警提供异常发生时间、对象和影响范围。", "告警不是最终结论，而是异常的时间锚点和对象锚点，需要与 PM、测试和工参联动。"),
        ("多源联判", "覆盖、质量、业务和告警放入同一判断链。", "多源联判把覆盖、质量、容量、业务体验和告警事件对齐，避免单源数据误判。"),
        ("性能基线", "形成后续优化可对比的全网性能基线。", "采集结束应固化基线口径、指标周期、对象范围和异常说明，为后续优化验证提供对照。"),
    ],
    "P15": [
        ("瓶颈定位", "先定位覆盖、干扰、容量或体验短板。", "全网性能提升先找瓶颈类型和影响范围，不能从动作清单直接开始。"),
        ("策略匹配", "不同瓶颈匹配不同工程、参数和资源策略。", "覆盖、干扰、容量和业务体验短板对应不同策略，策略选择要服从证据和影响面。"),
        ("组合动作", "参数、工程、资源和邻区动作组合评估。", "全网提升常需要组合动作，必须评估参数调整、工程整改、资源扩容和邻区优化之间的耦合影响。"),
        ("副作用监控", "实施后观察趋势、告警、投诉和体验波动。", "执行后要持续观察 KPI 趋势、活动告警、投诉变化和业务体验，识别局部改善带来的副作用。"),
        ("路径校验", "瓶颈、策略、动作和验证路径必须一致。", "路径校验确保每个动作都能回扣到瓶颈假设，并有对应的验证指标和复测口径。"),
        ("提升固化", "用同口径复测和全网趋势确认提升效果。", "效果确认后固化策略、参数版本、适用场景和限制条件，形成可复制的提升路径。"),
    ],
    "P16": [
        ("前值锁定", "优化前快照、范围、周期和统计口径先锁定。", "全网提升验证先固定前值和统计口径，防止样本范围、周期或数据源变化造成假改善。"),
        ("目标线", "目标线包含阈值、样本量和业务场景。", "验证目标应可计算、可复查，明确阈值、样本量、统计周期、业务场景和通过条件。"),
        ("趋势判定", "前后曲线、TOPN 变化和分位数共同判定效果。", "全网验证不只看平均值，还要看趋势曲线、TOPN 收敛、分位数变化和高风险区域是否改善。"),
        ("异常回看", "未达标区域回看工参、告警、容量和测试证据。", "未达标区域要回看工参、告警、容量负荷、测试轨迹和变更记录，判断是残余问题还是口径偏差。"),
        ("通过判据", "通过、待优化和需观察指标分层标注。", "验证结果要分层标注：已通过指标、待优化指标、需继续观察指标，以及对应证据。"),
        ("配置固化", "通过后固化配置、经验、限制和观察周期。", "验证通过后固化参数版本、策略经验、适用限制和后续观察周期，保证提升效果持续。"),
    ],
    "P17": [
        ("RRC 接入", "先看 UE 与 gNB 的无线控制面建立。", "信令解析先从 RRC 建立、重配置和释放看无线侧控制面是否顺畅，定位接入阶段断点。"),
        ("NAS 注册", "AMF 承担注册、鉴权、安全和移动性控制。", "NAS 流程说明 UE 如何进入核心网控制面，注册、鉴权、安全模式和移动性管理是关键节点。"),
        ("会话承载", "SMF 与 UPF 建立 PDU Session 和用户面路径。", "PDU Session 将控制面决策转为用户面承载，SMF、UPF、QoS 和 DNN/S-NSSAI 决定业务是否可达。"),
        ("失败断点", "Cause、方向、定时器和重传共同定位断点。", "信令失败不能只看最后一条消息，要结合消息方向、Cause、定时器、重传次数和上下文定位断点。"),
        ("序列校验", "消息顺序、节点角色和状态迁移逐项校验。", "序列校验关注消息是否缺失、顺序是否异常、节点角色是否匹配，以及状态迁移是否符合流程。"),
        ("端到端路径", "形成 RRC、NAS、PDU Session 的端到端判断链。", "信令判断链要从无线接入、核心网注册到会话承载贯通，明确每一层的证据和责任边界。"),
    ],
    "P18": [
        ("故障现象", "接入、注册、会话、切换和业务失败先分类。", "信令故障分析先按现象分类：RRC 接入失败、NAS 注册失败、PDU Session 失败、切换失败和业务面失败对应不同链路。"),
        ("消息时序", "按 RRC、NAS、NGAP、PFCP 和 PDU Session 重建时序。", "消息链路要按时间重建，串起 UE、gNB、AMF、SMF 和 UPF 之间的方向、响应、重传和缺失消息。"),
        ("Cause/Timer", "Cause、定时器、重传和上下文共同锁定断点。", "Cause 值只能提供线索，必须结合 T300/T3510 等定时器、重传、消息方向和上下文判断真实断点。"),
        ("故障链分支", "无线、核心网、参数、传输和终端分支逐层排除。", "故障链要分支排除：无线侧看覆盖与 RRC，核心网看注册与会话，传输看 N2/N3，终端看能力和配置。"),
        ("责任边界", "用证据链标定责任域、处理动作和协同接口。", "责任边界必须由证据链支撑，明确无线、核心网、参数、传输或终端责任域，并给出协同接口。"),
        ("闭环验证", "处理后用同场景信令、KPI 和业务复测确认。", "信令故障闭环要回到同场景复测，确认消息时序恢复、KPI 回稳、业务可达，并记录遗留风险。"),
    ],
}


PAGE_METRICS: dict[str, list[str]] = {
    "P01": ["站址台账", "设备拓扑", "运行条件", "影像证据"],
    "P02": ["天线姿态", "遮挡点", "场景落点", "邻区边界"],
    "P03": ["投诉事实", "复现条件", "交叉证据", "工单闭环"],
    "P04": ["DT/CQT", "采样同步", "指标联判", "同口径复测"],
    "P05": ["异常入口", "硬件链路", "软件链路", "复测结论"],
    "P06": ["时间轴", "覆盖图层", "质量图层", "事件回放"],
    "P07": ["网元对象", "活动告警", "PM 趋势", "CM 版本"],
    "P08": ["活动告警", "KPI 趋势", "TOPN 小区", "派单闭环"],
    "P09": ["现网快照", "规划基线", "差异类型", "风险等级"],
    "P10": ["触发源", "目标取值", "影响域", "回退点"],
    "P11": ["责任场景", "动作拆解", "执行窗口", "效果观察"],
    "P12": ["基线冻结", "验收阈值", "差值趋势", "复测结论"],
    "P13": ["报告主线", "证据编排", "过程追溯", "效果表达"],
    "P14": ["指标口径", "PM 趋势", "测试证据", "性能基线"],
    "P15": ["瓶颈类型", "策略匹配", "组合动作", "提升固化"],
    "P16": ["前值快照", "目标线", "TOPN 收敛", "配置固化"],
    "P17": ["RRC", "NAS", "PDU Session", "Cause/Timer"],
    "P18": ["失败场景", "消息时序", "Cause/Timer", "责任域"],
}


VISUAL_TOKEN_SETS: dict[str, list[list[str]]] = {
    "P01": [["机房", "机柜", "BBU", "AAU/RRU"], ["端口", "光纤", "电源线", "传输"], ["供电", "接地", "温控", "承载"], ["机柜", "端口", "走线", "证据"], ["主设备", "运行保障", "链路", "完整性"], ["台账", "索引", "归档", "复核"]],
    "P02": [["地形", "站向", "邻区", "遮挡"], ["方位角", "下倾角", "挂高", "扇区"], ["道路", "热点", "投诉点", "地图"], ["位置", "朝向", "参照物", "遮挡"], ["站点", "扇区", "邻区", "照片"], ["风险图层", "覆盖", "遮挡", "边界"]],
    "P03": [["时间", "地点", "业务", "终端"], ["复现", "小区", "无线指标", "终端状态"], ["投诉", "路测", "告警", "工参"], ["覆盖", "容量", "切换", "平台"], ["工单", "责任", "回访", "复测"], ["症状", "证据", "路径", "边界"]],
    "P04": [["DT", "CQT", "移动", "定点"], ["路线", "点位", "脚本", "终端"], ["GPS", "LOG", "KPI", "信令"], ["RSRP", "SINR", "切换", "吞吐"], ["路径密度", "点位", "热点", "代表性"], ["同路线", "同点位", "同业务", "对比"]],
    "P05": [["掉线", "GPS", "终端", "授权"], ["端口", "线缆", "电源", "模块"], ["License", "驱动", "配置", "版本"], ["入场", "车辆", "人员", "接口"], ["现象", "证据", "假设", "动作"], ["影响范围", "排查链路", "责任", "结论"]],
    "P06": [["LOG", "地图", "工参", "时间轴"], ["RSRP", "PCI", "服务小区", "邻区"], ["SINR", "干扰", "掉线", "速率"], ["异常点", "曲线", "信令", "业务动作"], ["字段缺失", "指标突变", "切换失败", "断点"], ["问题点", "证据链", "原因", "复测口径"]],
    "P07": [["ManagedElement", "小区", "PM", "CM"], ["级别", "时间", "对象", "状态"], ["忙时", "趋势", "同比", "环比"], ["当前值", "规划值", "版本", "变更"], ["角色", "权限", "审计", "回退"], ["发现", "定位", "派单", "复核"]],
    "P08": [["网元", "小区", "PM", "时间窗"], ["活动告警", "级别", "时长", "相关性"], ["接通率", "掉线率", "切换率", "PRB"], ["TOPN", "高影响", "高峰", "关键业务"], ["动态基线", "门限", "抑制", "派单"], ["分诊", "处理", "恢复曲线", "复核"]],
    "P09": [["网元", "小区", "邻区", "切片"], ["当前值", "版本", "导出时间", "来源"], ["规划值", "频段", "容量目标", "业务策略"], ["覆盖", "切换", "接入", "QoS"], ["风险等级", "影响域", "观察窗", "回退点"], ["差异清单", "审批", "动作", "治理"]],
    "P10": [["投诉", "DT/CQT", "KPI", "规划"], ["场景", "频段", "依据", "目标"], ["小区", "邻区", "用户体验", "业务策略"], ["审批", "备份", "窗口", "回退"], ["耦合", "互斥", "观察指标", "风险"], ["版本", "责任人", "结果", "边界"]],
    "P11": [["覆盖", "干扰", "容量", "承载"], ["工程", "参数", "资源", "邻区"], ["低峰窗口", "影响小区", "备份", "责任人"], ["KPI", "活动告警", "负荷", "体验"], ["根因", "动作", "复测", "因果"], ["场景", "组合", "效果", "限制"]],
    "P12": [["基线", "对照小区", "样本", "时间窗"], ["阈值", "样本下限", "忙闲时", "业务场景"], ["前后差值", "趋势", "TOPN", "置信度"], ["工参", "告警", "信令日志", "容量"], ["同路线", "同点位", "同终端", "同脚本"], ["达标项", "遗留项", "风险", "固化"]],
    "P13": [["问题", "原因", "动作", "效果"], ["图表", "日志", "地图", "指标"], ["原始日志", "KPI", "工参", "推理"], ["对比", "体验", "异常样本", "边界"], ["摘要", "证据", "动作", "风险"], ["建议", "场景", "经验", "复用边界"]],
    "P14": [["指标", "周期", "对象", "数据源"], ["PM", "忙时", "排名", "完整性"], ["DT", "CQT", "路径", "热点"], ["告警", "时间", "对象", "影响范围"], ["覆盖", "质量", "容量", "业务"], ["基线口径", "周期", "范围", "异常说明"]],
    "P15": [["覆盖", "干扰", "容量", "体验"], ["瓶颈", "策略", "证据", "影响面"], ["参数", "工程", "资源", "邻区"], ["KPI", "告警", "投诉", "副作用"], ["假设", "动作", "指标", "复测"], ["策略", "版本", "场景", "限制"]],
    "P16": [["前值", "范围", "周期", "数据源"], ["阈值", "样本量", "通过条件", "场景"], ["曲线", "TOPN", "分位数", "高风险区域"], ["工参", "告警", "容量", "变更记录"], ["通过", "待优化", "观察", "证据"], ["参数版本", "策略", "限制", "观察周期"]],
    "P17": [["UE", "gNB", "RRC", "释放"], ["AMF", "注册", "鉴权", "安全模式"], ["SMF", "UPF", "QoS", "S-NSSAI"], ["Cause", "方向", "定时器", "重传"], ["顺序", "节点", "状态迁移", "缺失"], ["RRC", "NAS", "PDU Session", "责任边界"]],
    "P18": [["接入失败", "注册失败", "会话失败", "切换失败"], ["UE", "gNB", "AMF", "SMF/UPF"], ["Cause", "T300", "T3510", "重传"], ["无线", "核心网", "N2/N3", "终端"], ["证据链", "责任域", "协同接口", "动作"], ["信令复测", "KPI", "业务可达", "遗留风险"]],
}


PAGE_LESSON_ARCS: dict[str, dict[str, str]] = {
    "P01": {
        "summary": "本节把室内站点采集讲成一条资源链：从机房和机柜定位，到设备拓扑、配套条件和影像索引，最终支撑规划、排障和优化复核。",
        "goal": "学完后能用统一台账描述机房、BBU/AAU-RRU、端口、传输、电源、接地和温控关系，并判断资料是否可追溯。",
        "review": "复盘时检查资源对象、连接关系、运行条件和照片索引是否指向同一站点实体，缺口要回填到台账，而不是留在截图说明里。",
        "lens": "在室内站点采集中，{title}要落到可追溯资源链；{token_text}不是标签堆叠，而是定位站点可用性的实体关系。",
        "check": "判读时沿机柜、端口、线缆、传输、电源和接地逐段核对，确认每个字段都能回到现场对象和照片位置。",
        "risk": "常见问题是只拍设备正面或只填型号，缺少端口、走线、供电接地和温控关系，后续规划与排障就会失去落点。",
    },
    "P02": {
        "summary": "本节围绕室外覆盖环境，把地形、站向、邻区、道路热点和遮挡照片串成覆盖风险图层，用于解释弱覆盖、越区和重叠覆盖。",
        "goal": "学完后能从方位角、下倾角、挂高、遮挡体和邻区边界判断覆盖空间，并把外场照片转成可定位的风险证据。",
        "review": "复盘时把站向、道路热点、遮挡点和邻区边界放到同一地图口径下，看每张照片是否能说明位置、朝向、距离和关联扇区。",
        "lens": "{title}要放回真实传播环境看：{token_text}共同决定扇区服务范围，而不是单独由某个站点字段决定。",
        "check": "判读时先定站点与扇区，再看道路、楼宇、遮挡高度、参照物和邻区关系，最后沉淀到覆盖风险图层。",
        "risk": "不要把外场照片当装饰素材；没有拍摄方向、参照物和关联小区，照片无法支撑覆盖边界或遮挡归因。",
    },
    "P03": {
        "summary": "本节把投诉处理从口述记录推进到可复现事实：锁定时间、地点、业务、终端和网络状态，再用测试、告警、KPI 与工参交叉定位。",
        "goal": "学完后能把用户现象拆成复现场景、网络证据和责任边界，并形成可回访、可复测的投诉闭环。",
        "review": "复盘时看投诉事实、复现日志、告警/KPI、工参和处理动作是否支持同一个根因假设，不能让单一口述直接变成结论。",
        "lens": "{title}先回答投诉能否复现；{token_text}要同时约束用户体验、无线状态和业务动作。",
        "check": "判断时从用户描述进入复现条件，再对齐服务小区、指标、告警、工参和工单动作，逐层缩小责任边界。",
        "risk": "不要把投诉频次直接等同网络故障；缺少同场景复现和多源交叉时，只能形成线索，不能形成处置结论。",
    },
    "P04": {
        "summary": "本节讲 DT/CQT 测试设计与判读：用连续路线和定点脚本补足彼此盲区，并把 GPS、LOG、业务动作和信令事件对齐到同一时间轴。",
        "goal": "学完后能设计可复测的 DT/CQT 路线、点位、脚本和采样口径，并用 RSRP、SINR、切换、掉线和吞吐联合判读体验。",
        "review": "复盘时检查路线密度、热点代表性、终端脚本、时间同步和复测口径是否一致，优化前后必须能同口径比较。",
        "lens": "{title}不能只看单个指标；{token_text}要放在连续移动或定点业务体验里联合解释。",
        "check": "判读时先确认测试设计，再对齐 GPS、LOG、KPI、信令和业务动作，最后区分覆盖、质量、切换或业务侧原因。",
        "risk": "最容易误判的是路线不一致、脚本变更或样本太少，导致优化前后差异来自测试口径而不是网络变化。",
    },
    "P05": {
        "summary": "本节把测试异常按采集链路拆开：终端、线缆、端口、电源、GPS、授权、驱动、版本和现场协同各有不同排查路径。",
        "goal": "学完后能区分硬件、软件、授权和现场条件造成的采集异常，并把处理动作和复测结论写入问题归档。",
        "review": "复盘时沿连接链路和软件链路逐项确认，异常现象、错误码、日志、处理动作和复测结果要一一对应。",
        "lens": "{title}先定位采集入口；{token_text}分别指向硬件链路、软件环境或现场协同条件。",
        "check": "判读时从可见现象进入端口、线缆、电源、GPS、终端、License、驱动、配置和版本，逐段排除再决定处置。",
        "risk": "不要用重启或重装替代定位；没有错误码、日志和复测结果，异常处理无法沉淀为可复用排查路径。",
    },
    "P06": {
        "summary": "本节讲测试 LOG 分析：先统一时间、坐标、工参和事件口径，再把覆盖图层、质量图层、业务动作和信令回放叠合定位。",
        "goal": "学完后能用 RSRP/PCI/SINR、掉线、切换和信令断点区分覆盖、干扰、参数、终端或业务侧问题。",
        "review": "复盘时看异常点是否能在地图轨迹、KPI 曲线、信令消息和工参版本中互相定位，结论要带复测口径。",
        "lens": "{title}要建立可回放的数据链；{token_text}必须落在同一时间轴和同一空间位置上。",
        "check": "判读时先清洗口径，再看覆盖强度、无线质量、事件突变、消息断点和业务速率，把问题收敛到可验证原因。",
        "risk": "不要只凭热力图颜色下结论；没有时间轴、工参版本和信令上下文，颜色变化只能提示位置，不能说明原因。",
    },
    "P07": {
        "summary": "本节把网管操作看成对象管理模型：从 ManagedElement、小区、告警、PM、CM 到权限审计，形成可追踪的运维闭环。",
        "goal": "学完后能按对象层级筛告警、查性能、核配置，并明确查询、修改、派单和回退的权限边界。",
        "review": "复盘时检查网元对象、告警状态、PM 趋势、CM 版本和审计记录是否一致，避免菜单操作脱离对象模型。",
        "lens": "{title}不是菜单记忆，而是网元对象关系；{token_text}要对应到明确的对象层级和权限范围。",
        "check": "判读时从对象层级进入告警过滤、PM 趋势、CM 当前值/规划值和变更记录，再决定是否派单或回退。",
        "risk": "不要混用查询、修改和派单权限；缺少审计记录和版本来源时，网管操作本身会变成新的风险。",
    },
    "P08": {
        "summary": "本节讲运行监控：把小区、网元、活动告警、PM 计数器、业务 KPI 和时间窗绑定到同一诊断对象，按影响面收敛处置优先级。",
        "goal": "学完后能用告警级别、持续时长、KPI 趋势、TOPN 和动态门限判断监控事件优先级，并闭环到派单与复核。",
        "review": "复盘时看异常发现、分诊定位、派单处理、恢复曲线和 KPI 回稳是否闭合，阈值策略要兼顾误报与漏报。",
        "lens": "{title}要先定义监控对象；{token_text}共同说明异常是否真实、是否持续、是否影响业务。",
        "check": "判读时区分活动告警和历史告警，再看 KPI 趋势突变、TOPN 影响面、容量负荷和派生关系，最后确定优先级。",
        "risk": "不要被单次峰值驱动派单；没有动态基线、观察窗和清除状态，监控容易在误报和漏报之间摆动。",
    },
    "P09": {
        "summary": "本节讲参数核查：先锁定网元、小区、邻区、切片和 QoS 等对象范围，再把现网快照与规划基线转成风险治理清单。",
        "goal": "学完后能比较当前值、规划值、版本来源和影响域，判断差异属于覆盖、切换、接入、容量还是业务策略风险。",
        "review": "复盘时检查每个差异是否有对象范围、版本时间、风险等级、建议动作、审批状态和回退条件。",
        "lens": "{title}必须带对象范围；{token_text}决定参数差异的影响域和回退半径。",
        "check": "判读时先固定现网快照和规划基线，再按覆盖、切换、接入、容量、QoS 或切片策略分流风险。",
        "risk": "不要把经验模板直接套到全网；对象范围、频段层、邻区关系和业务策略不同，目标取值也会不同。",
    },
    "P10": {
        "summary": "本节讲参数设置：从投诉、DT/CQT、KPI 或规划变更进入目标取值，再做影响评估、审批备份、执行窗口、回退和监控设计。",
        "goal": "学完后能把参数变更写成可执行方案，说明触发源、目标值、影响域、互斥关系、观察指标和回退点。",
        "review": "复盘时看触发源、目标值、审批记录、配置备份、执行窗口、监控结果和版本固化是否完整。",
        "lens": "{title}不是改一个数值，而是一次受控变更；{token_text}共同约束目标、影响域和回退条件。",
        "check": "判读时先确认触发源和依据，再评估小区、邻区、切片、QoS、容量和用户体验副作用，最后设计执行与观察。",
        "risk": "不要用局部改善掩盖全局副作用；缺少备份、审批、观察窗和互斥参数检查，参数设置不可控。",
    },
    "P11": {
        "summary": "本节讲优化方案实施：把根因假设拆成工程、参数、资源、邻区和协同动作，并按窗口、影响面、回退点和监控指标执行。",
        "goal": "学完后能把优化方案转成批次化执行清单，保证动作、责任人、监控指标和同口径复测互相对应。",
        "review": "复盘时看每个动作是否回扣到根因假设，实施中 KPI、告警、容量和体验是否被持续观察，效果是否能同场景复测。",
        "lens": "{title}要从根因进入动作，不从动作清单倒推原因；{token_text}决定实施顺序和责任边界。",
        "check": "判读时先分覆盖、干扰、容量、参数、承载或核心网协同，再拆工程、参数、资源、邻区和投诉回访动作。",
        "risk": "不要把多项动作混成一锅执行；没有批次、窗口、回退和复测口径，就无法判断哪项动作真正有效。",
    },
    "P12": {
        "summary": "本节讲优化效果验证：冻结优化前基线、样本和时间窗，用同口径前后差值、趋势、TOPN、置信度和用户体验判断是否有效。",
        "goal": "学完后能定义验收阈值、样本下限、忙闲时口径和 DT/CQT 路径，并处理局部未达标区域。",
        "review": "复盘时检查前值、目标线、对照小区、复测路径、异常回钻和结论闭环是否一致，避免把样本漂移当优化效果。",
        "lens": "{title}先冻结基线再谈改善；{token_text}要保证前后样本和统计口径可比较。",
        "check": "判读时看前后差值、趋势曲线、TOPN 收敛、置信样本、业务体验和异常小区回钻结果。",
        "risk": "不要只报平均值提升；样本少、时间窗变、路线变或终端脚本变，都会制造假改善或假劣化。",
    },
    "P13": {
        "summary": "本节讲优化报告写作：先给问题、原因、动作和效果主线，再用图表、日志、地图、KPI 和工参支撑每一个判断。",
        "goal": "学完后能把原始证据编排成可追溯报告，清楚表达前后对比、业务体验、异常样本、遗留风险和后续建议。",
        "review": "复盘时看摘要结论能否在证据、过程、动作、效果和风险章节找到支撑，报告不能堆截图而断掉推理链。",
        "lens": "{title}要服务报告主线；{token_text}不是材料堆放，而是为问题、原因、动作和效果提供支撑。",
        "check": "判读时从结论倒查图表、日志、地图、KPI、工参和推理顺序，确认读者能从原始证据复原判断。",
        "risk": "不要只写结果好转；没有异常样本、适用边界和遗留风险，报告无法支撑复用或审计。",
    },
    "P14": {
        "summary": "本节讲全网性能数据采集：统一指标定义、周期、对象和数据源，用 PM 观察全网趋势，用 DT/CQT 补足用户路径和热点体验。",
        "goal": "学完后能区分 PM、测试数据、告警和工参各自的作用，并形成后续优化可对比的性能基线。",
        "review": "复盘时检查指标口径、统计周期、对象范围、缺失处理、测试路径和告警锚点是否一致。",
        "lens": "{title}首先是口径管理；{token_text}必须说明数据来自哪里、统计谁、统计多长时间。",
        "check": "判读时用 PM 看趋势和排名，用 DT/CQT 看路径体验，用告警定位异常时间和对象，再与工参版本互相校验。",
        "risk": "不要把 PM 盲区当网络真实全貌；缺少测试路径和告警锚点时，全网基线很难解释用户体验。",
    },
    "P15": {
        "summary": "本节讲全网性能提升：先定位覆盖、干扰、容量或体验瓶颈，再选择工程、参数、资源和邻区组合动作，并监控副作用。",
        "goal": "学完后能让瓶颈、策略、动作、影响面和复测指标保持一致，形成可复制的全网提升路径。",
        "review": "复盘时看每个组合动作是否对应瓶颈假设，实施后 KPI、告警、投诉和体验波动是否证明收益大于副作用。",
        "lens": "{title}要从瓶颈类型出发；{token_text}共同决定策略组合和影响面。",
        "check": "判读时先分覆盖、干扰、容量和体验短板，再评估参数、工程、资源扩容和邻区优化之间的耦合。",
        "risk": "不要用单点提升代表全网提升；局部参数动作可能改善一个指标，却把邻区、容量或业务体验推向风险。",
    },
    "P16": {
        "summary": "本节讲全网提升验证：锁定前值快照、范围、周期和数据源，用目标线、TOPN 收敛、分位数和高风险区域判断提升是否稳固。",
        "goal": "学完后能定义全网验证口径，标注通过、待优化、需观察指标，并固化参数版本、策略经验和观察周期。",
        "review": "复盘时检查前值、目标线、趋势曲线、异常回看、通过判定和配置固化是否闭合。",
        "lens": "{title}看的是全网趋势和风险尾部；{token_text}要同时覆盖总体改善和局部未达标区域。",
        "check": "判读时比较前后曲线、TOPN、分位数、高风险区域、告警容量和变更记录，判断效果是否可持续。",
        "risk": "不要只看平均值通过；尾部小区、忙时容量或数据源变化可能隐藏真实风险。",
    },
    "P17": {
        "summary": "本节讲 5G 关键信令流程：从 RRC 接入、NAS 注册到 PDU Session 和用户面路径，按节点角色、消息方向、状态迁移和 Cause 定位断点。",
        "goal": "学完后能读懂 UE、gNB、AMF、SMF、UPF 之间的控制面/用户面关系，并解释接入、注册、会话建立和释放的关键消息。",
        "review": "复盘时检查 RRC、NAS、PDU Session 的端到端顺序，失败分析要同时看 Cause、定时器、重传和上下文。",
        "lens": "{title}要放在端到端信令状态机里；{token_text}分别对应节点角色、控制面阶段和业务承载。",
        "check": "判读时先看 UE-gNB 的 RRC，再看 AMF 注册鉴权和安全模式，最后看 SMF/UPF 是否建立 PDU Session 与 QoS。",
        "risk": "不要只盯最后一条失败消息；Cause 值、方向、定时器和重传次数必须和前后文一起解释。",
    },
    "P18": {
        "summary": "本节讲 5G 信令故障分析：按接入、注册、会话、切换和业务面失败分类，重建 RRC、NAS、NGAP、PFCP 与用户面链路。",
        "goal": "学完后能用 Cause/Timer、消息方向、重传、N2/N3 和节点责任域区分无线、核心网、传输、参数或终端问题。",
        "review": "复盘时检查故障现象、消息时序、分支排除、责任边界和闭环复测是否连成一条可审计链路。",
        "lens": "{title}先分类失败阶段；{token_text}决定故障链从无线侧、核心网侧、传输侧还是终端侧展开。",
        "check": "判读时重建 UE、gNB、AMF、SMF/UPF 的消息时序，再用 Cause、T300/T3510、重传、N2/N3 和业务可达性定位断点。",
        "risk": "不要把单个 Cause 直接等同根因；没有方向、定时器、重传和复测，责任域判断很容易错位。",
    },
}


def build_lesson_storyboard(
    *,
    task: Any,
    project_title: str,
    blocks: list[Any],
    steps: list[dict[str, str]],
    scenario: str,
    scenario_label: str,
    metrics: list[dict[str, str]],
    media_map: dict[str, str],
    rels: dict[str, str],
    media_url_for_ref: MediaResolver,
) -> dict[str, Any]:
    project_id = str(getattr(task, "generated_id", ""))
    units = knowledge_units(project_id, str(getattr(task, "title", "")), steps)
    evidence = extract_evidence(blocks, media_map, rels, media_url_for_ref)
    return {
        "schema": "lesson-storyboard/v1",
        "pageId": project_id,
        "title": str(getattr(task, "title", "")),
        "projectTitle": project_title,
        "learningGoal": learning_goal(project_id, str(getattr(task, "title", "")), units),
        "summary": summary_for(project_id, str(getattr(task, "title", "")), scenario_label, units),
        "knowledgeUnits": units,
        "visualModel": visual_model(project_id, str(getattr(task, "title", "")), scenario, scenario_label, metrics, units),
        "mani" + "mSlots": legacy_media_slots(project_id),
        "evidenceGroups": evidence,
        "interactionSlots": interaction_slots(project_id),
        "reviewSummary": review_summary(project_id, units, evidence),
    }


def storyboard_sections(storyboard: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"id": "sec-overview", "title": "导学摘要", "icon": "overview", "texts": [storyboard["summary"]]},
        *[
            {"id": unit["id"], "title": unit.get("sectionTitle", unit["title"]), "icon": unit["icon"], "texts": [unit["narrationText"]]}
            for unit in storyboard["knowledgeUnits"]
        ],
    ]


def build_storyboard_playback_scenes(
    *,
    project_id: str,
    title: str,
    storyboard: dict[str, Any],
    widget_id: str,
    scenario: str,
    make_action: MakeAction,
    animation_actions: AnimationActions,
) -> list[dict[str, Any]]:
    units = storyboard["knowledgeUnits"]
    content_actions: list[dict[str, Any]] = [
        make_action(project_id, "story", 1, "spotlight", title="导学摘要", elementId="sec-overview-summary", content=storyboard["summary"]),
        make_action(project_id, "story", 2, "speech", title="导学摘要", text=storyboard["summary"], elementId="sec-overview-summary"),
        make_action(project_id, "story", 3, "spotlight", title="学习目标", elementId="sec-learning-goal", content=storyboard["learningGoal"]),
        make_action(project_id, "story", 4, "speech", title="学习目标", text=storyboard["learningGoal"], elementId="sec-learning-goal"),
    ]
    index = 5
    for unit in units:
        section_title = unit.get("sectionTitle", unit["title"])
        unit_body_id = f"{unit['id']}-body"
        content_actions.append(make_action(project_id, "story", index, "spotlight", title=f"{section_title}：{unit['title']}", elementId=unit_body_id, content=unit["shortText"]))
        index += 1
        for layer_title, layer_text in unit_teaching_layers(unit):
            content_actions.append(make_action(project_id, "story", index, "speech", title=f"{unit['title']}：{layer_title}", text=layer_text, elementId=unit_body_id))
            index += 1
    content_actions.extend([
        make_action(project_id, "story", index, "spotlight", title="复盘", elementId="sec-review", content=storyboard["reviewSummary"]),
        make_action(project_id, "story", index + 1, "speech", title="复盘", text=storyboard["reviewSummary"], elementId="sec-review"),
    ])
    content_actions = interleave_story_focus_actions(project_id, content_actions)
    return [
        {
            "id": f"{project_id}-storyboard",
            "title": "教材讲授",
            "type": "content",
            "order": 1,
            "stageId": project_id,
            "description": arc_text(project_id, "contentDescription", f"围绕{title}建立对象、证据、判据和复测结论。"),
            "actions": content_actions,
        },
        {
            "id": f"{project_id}-concept-figure",
            "title": "核心机理图",
            "type": "animation",
            "order": 2,
            "stageId": project_id,
            "description": arc_text(project_id, "figureDescription", f"把{title}的关键对象、指标关系和处置边界画成可读模型。"),
            "actions": animation_actions(project_id, widget_id, make_action, scenario),
        },
    ]


def interleave_story_focus_actions(project_id: str, actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure page narration follows the classroom pattern: focus first, then speak."""
    next_actions: list[dict[str, Any]] = []
    for action in actions:
        action_type = action.get("type")
        target = str(action.get("elementId") or action.get("target") or "")
        previous = next_actions[-1] if next_actions else {}
        previous_target = str(previous.get("elementId") or previous.get("target") or "")
        previous_focus = previous.get("type") in ("spotlight", "laser") and previous_target == target
        needs_focus = action_type == "speech" and target and not previous_focus
        if needs_focus:
            focus_type = "laser" if len(next_actions) % 2 else "spotlight"
            next_actions.append({
                "id": f"{project_id}-story-focus-action-{str(action.get('id', len(next_actions))).replace(project_id + '-', '')}",
                "type": focus_type,
                "title": action.get("title"),
                "elementId": target,
                "target": target,
                "content": action.get("caption") or action.get("displayText") or action.get("text"),
                "dimOpacity": 0.008,
                "focusPolicy": "hold",
                "clearFocusOnEnd": False,
            })
        next_actions.append(action)
    return next_actions


def unit_teaching_layers(unit: dict[str, Any]) -> list[tuple[str, str]]:
    project_id = str(unit.get("pageId") or "")
    ordinal = int(unit.get("ordinal") or 1)
    title = str(unit.get("title") or "")
    short = str(unit.get("shortText") or "")
    narration = str(unit.get("narrationText") or short)
    tokens = [str(item) for item in unit.get("visualTokens") or [] if str(item).strip()]
    token_text = "、".join(tokens[:4]) if tokens else title
    lens = unit_layer_text("lens", ordinal, title, token_text)
    check = unit_layer_text("check", ordinal, title, token_text)
    pitfall = unit_layer_text("risk", ordinal, title, token_text)
    return [
        ("讲解", narration),
        ("工程语境", lens),
        ("判断依据", check),
        ("常见误区", pitfall),
    ]


UNIT_LAYER_PATTERNS: dict[str, tuple[str, ...]] = {
    "lens": (
        "{title}先界定观察对象；{token_text}用于确定本段的范围、入口和主要证据。",
        "{title}说明链路走到哪一步；{token_text}分别对应角色、接口、状态和约束。",
        "{title}用于建立判据；{token_text}要放进同一时间窗和同一对象范围比较。",
        "{title}强调证据来源；{token_text}必须能互相印证，不能只作为孤立标签出现。",
        "{title}进入处置决策；{token_text}决定动作顺序、影响面和回退边界。",
        "{title}服务复盘归档；{token_text}要支撑结论、遗留项和下一次复测入口。",
    ),
    "check": (
        "先核对{title}的对象范围，再看{token_text}是否和现场记录、指标口径保持一致。",
        "沿时间顺序检查{token_text}的先后关系，确认缺失、超时或状态跳变发生在哪一段。",
        "把{token_text}与阈值、趋势、样本量和对照对象一起比较，避免只看单点结果。",
        "把{token_text}回连到照片、日志、表单或网管记录，确认每个结论都有来源。",
        "根据{token_text}拆分可执行动作，并标出责任对象、观察窗口和回退条件。",
        "复盘{token_text}是否闭合：现象、证据、判断、动作和验证结果必须能互相追溯。",
    ),
    "risk": (
        "不要在{title}阶段过早下结论；对象范围不清时，后续数据再多也难以复核。",
        "不要把{token_text}中的单个事件当作完整流程；缺少前后文会误判断点。",
        "不要只看平均值或单次采样；{title}需要趋势、样本和对照条件共同支撑。",
        "不要把截图、口述或孤立日志直接写成结论；{token_text}必须落到证据链。",
        "不要把多个动作混在一起验证；否则无法判断{title}到底由哪项动作改善。",
        "不要只写通过或失败；{title}还要说明遗留风险、适用边界和后续观察。",
    ),
}


def unit_layer_text(kind: str, ordinal: int, title: str, token_text: str) -> str:
    patterns = UNIT_LAYER_PATTERNS[kind]
    template = patterns[(max(1, ordinal) - 1) % len(patterns)]
    return clean(template.format(title=title, token_text=token_text))


def knowledge_units(project_id: str, title: str, steps: list[dict[str, str]]) -> list[dict[str, Any]]:
    storyline = STORYLINES.get(project_id)
    if not storyline:
        storyline = [(step.get("label", f"要点{index + 1}"), step.get("description", ""), step.get("description", "")) for index, step in enumerate(steps[:6])]
    icons = ["radar", "route", "chart", "tool", "search", "check"]
    kinds = ["concept", "concept", "criteria", "evidence", "practice", "review"]
    units = []
    for index, (unit_title, short_text, narration) in enumerate(storyline[:6], start=1):
        kind = kinds[min(index - 1, len(kinds) - 1)]
        units.append({
            "id": f"{project_id}-ku-{index:02d}",
            "pageId": project_id,
            "ordinal": index,
            "title": trim(unit_title, 16),
            "shortText": trim(short_text, 92),
            "narrationText": trim(narration or short_text, 220),
            "icon": icons[(index - 1) % len(icons)],
            "kind": kind,
            "sectionTitle": section_title_for_kind(kind),
            "visualId": f"{project_id}-ku-{index:02d}-visual",
            "visualTokens": visual_tokens_for(project_id, index, unit_title, short_text),
            "evidenceRefs": [],
            "animationRefs": [],
            "practiceRef": f"{project_id}-practice-001" if kind == "practice" else None,
        })
    return units


def visual_tokens_for(project_id: str, index: int, title: str, short_text: str) -> list[str]:
    project_sets = VISUAL_TOKEN_SETS.get(project_id, [])
    if 0 < index <= len(project_sets):
        return project_sets[index - 1]
    words = re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]{2,6}", f"{title} {short_text}")
    tokens: list[str] = []
    for word in words:
        if word in tokens or len(word) < 2:
            continue
        tokens.append(word)
        if len(tokens) >= 4:
            break
    return tokens or ["对象", "证据", "判断", "复测"]


def metric_labels_for(project_id: str, scenario: str, metrics: list[dict[str, str]]) -> list[str]:
    labels = PAGE_METRICS.get(project_id)
    if labels:
        return labels[:4]
    metric_values = [item.get("value") or item.get("label") for item in metrics if item.get("value") or item.get("label")]
    cleaned = [clean_metric_label(value) for value in metric_values if clean_metric_label(value)]
    return cleaned[:4] or ["对象", "证据", "判断", "复测"]


def clean_metric_label(value: Any) -> str:
    text = clean(value)
    replacements = {"Manag": "网元", "Alarm": "告警", "PM": "性能", "CM": "配置"}
    return replacements.get(text, text)


def visual_model(project_id: str, title: str, scenario: str, scenario_label: str, metrics: list[dict[str, str]], units: list[dict[str, Any]]) -> dict[str, Any]:
    nodes = [{"label": unit["title"], "detail": unit["shortText"], "id": f"sec-core-model-node-{index}"} for index, unit in enumerate(units[:5], start=1)]
    return {
        "title": f"{title} · 概念框架",
        "scenario": scenario,
        "scenarioLabel": scenario_label,
        "nodes": nodes,
        "metrics": metric_labels_for(project_id, scenario, metrics),
    }


def extract_evidence(blocks: list[Any], media_map: dict[str, str], rels: dict[str, str], media_url_for_ref: MediaResolver) -> list[dict[str, Any]]:
    photos: list[dict[str, str]] = []
    diagrams: list[dict[str, str]] = []
    tables: list[dict[str, Any]] = []
    context = ""
    for block in blocks:
        kind = str(getattr(block, "kind", ""))
        if kind == "p":
            text = clean(getattr(block, "text", ""))
            if text and len(text) > 8:
                context = trim(text, 80)
            for ref in getattr(block, "media", []) or []:
                url = media_url_for_ref(ref, rels, media_map)
                if not url:
                    continue
                item = MediaItem(url=url, context=context, caption=context)
                target = photos if is_real_photo(item) else diagrams
                target.append({"url": url, "caption": trim(context or Path(url).name, 30), "template": diagram_template(item), "labels": diagram_labels(diagram_template(item), item)})
        elif kind == "table":
            rows = getattr(block, "rows", []) or []
            if rows:
                tables.append({"caption": "现场记录样表", "headers": [clean(cell) for cell in rows[0][:4]], "samples": [[trim(clean(cell), 18) for cell in row[:4]] for row in rows[1:4]]})
    return [
        {"id": "evidence-photos", "kind": "photos", "items": photos[:4]},
        {"id": "evidence-diagrams", "kind": "diagrams", "items": diagrams[:3]},
        {"id": "evidence-tables", "kind": "tables", "items": tables[:3]},
    ]


def legacy_media_slots(project_id: str) -> list[dict[str, Any]]:
    target_unit = manim_target_unit_id(project_id) or f"{project_id}-ku-03"
    slots: list[dict[str, Any]] = []
    for track in optional_manim_tracks(project_id)[:1]:
        slot = dict(track)
        slot["targetUnit"] = target_unit
        slot["title"] = "机理讲解"
        slots.append(slot)
    return slots


def interaction_slots(project_id: str) -> list[dict[str, Any]]:
    return [{"id": f"{project_id}-practice-001", "title": "专项练习", "targetUnit": f"{project_id}-ku-05"}]


VISIBLE_COPY_REPLACEMENTS = (
    ("Manim 知识动画", "机理讲解"),
    ("可视化演示", "图解讲授"),
    ("配套约束", "案例边界"),
    ("照片、编号、坐标", "现场对象"),
    ("照片编号坐标", "现场对象"),
    ("知识点闭环", "复盘闭环"),
    ("知识链", "判断链"),
    ("实验输出", "结果记录"),
    ("技术实现", "实现条件"),
    ("可视化", "图解"),
)


def arc_text(project_id: str, key: str, default: str, **values: Any) -> str:
    template = PAGE_LESSON_ARCS.get(project_id, {}).get(key, default)
    try:
        return clean(template.format(**values))
    except (KeyError, IndexError, ValueError):
        return clean(default.format(**values) if values else default)


def learning_goal(project_id: str, title: str, units: list[dict[str, Any]]) -> str:
    labels = "、".join(unit["title"] for unit in units[:4])
    return arc_text(
        project_id,
        "goal",
        f"围绕{title}，按对象、口径、数据、判读和复测展开，说明{labels}的作用、判断路径和工程边界。",
        title=title,
        labels=labels,
    )


def summary_for(project_id: str, title: str, scenario_label: str, units: list[dict[str, Any]]) -> str:
    labels = "、".join(unit["title"] for unit in units[:4])
    return arc_text(
        project_id,
        "summary",
        f"本节围绕{scenario_label}场景，把{labels}组织成一条可复核的知识链，说明对象口径、数据来源、判断依据和复测要求。",
        title=title,
        scenario_label=scenario_label,
        labels=labels,
    )


def review_summary(project_id: str, units: list[dict[str, Any]], evidence: list[dict[str, Any]]) -> str:
    labels = "、".join(str(unit.get("title", "")) for unit in units[:4] if str(unit.get("title", "")).strip())
    evidence_count = sum(len(group["items"]) for group in evidence)
    if labels:
        return arc_text(
            project_id,
            "review",
            f"本节复盘时，把{labels}连成对象、口径、数据、动作和复测闭环。现场资料共 {evidence_count} 项，只能作为判读依据的一部分，最终结论必须能被同口径复测验证。",
            labels=labels,
            evidence_count=evidence_count,
        )
    return arc_text(
        project_id,
        "review",
        "本节复盘时，按对象、口径、数据、动作和复测结果核对，确保结论能够被同口径复测验证。",
        labels=labels,
        evidence_count=evidence_count,
    )


def section_title_for_kind(kind: str) -> str:
    return SECTION_TITLES.get(kind, "概念与对象")


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    for source, target in VISIBLE_COPY_REPLACEMENTS:
        text = text.replace(source, target)
    return text


def trim(value: Any, limit: int) -> str:
    text = clean(value)
    return text if len(text) <= limit else text[: limit - 1].rstrip("，。；、") + "..."
