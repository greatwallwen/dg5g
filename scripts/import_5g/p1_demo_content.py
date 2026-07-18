"""Build and validate the generated P1 Web content contract."""

from __future__ import annotations

import json
from pathlib import Path, PurePosixPath
from typing import Any
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from jsonschema import Draft202012Validator


SCHEMA_ID = "dgbook.p1-demo-content/v1"
P1_TASK_STRUCTURE = (
    {
        "taskId": "P01",
        "runtimeTaskId": "P1T1",
        "why": "先把室内站点、机房、设备和配套条件采集完整，后续判断才有可复核的现场依据。",
        "taskOutputTitle": "室内设备与链路证据表",
        "sourceUnitIndexes": (0, 1, 2, 5),
    },
    {
        "taskId": "P02",
        "runtimeTaskId": "P1T2",
        "why": "室外天线、覆盖环境和周边场景的可靠证据，是规划测试路线和判断覆盖问题的前提。",
        "prerequisiteTaskId": "P01",
        "taskOutputTitle": "室外站点与覆盖采集表",
        "sourceUnitIndexes": (0, 1, 2, 5),
    },
    {
        "taskId": "P03",
        "runtimeTaskId": "P1T3",
        "why": "把用户描述转换为时间、地点、业务、终端和网络证据，才能形成可派单复核的问题线索。",
        "prerequisiteTaskId": "P02",
        "taskOutputTitle": "投诉信息调查单",
        "sourceUnitIndexes": (0, 1, 2, 5),
    },
)

P1_VERIFIED_MANIM_MEDIA: dict[str, set[str]] = {
    "P01": {
        "/media/manim/p01/p01-site-survey-map/manifest.json",
        "/media/manim/p01/p01-site-survey-map/p01-p01-site-survey-map.webm",
        "/media/manim/p01/p01-site-survey-map/poster.png",
    },
    "P02": {
        "/media/manim/p02/p02-outdoor-site-survey/manifest.json",
        "/media/manim/p02/p02-outdoor-site-survey/p02-p02-outdoor-site-survey.webm",
        "/media/manim/p02/p02-outdoor-site-survey/poster.png",
    },
    "P03": {
        "/media/manim/p03/p03-complaint-evidence-loop/manifest.json",
        "/media/manim/p03/p03-complaint-evidence-loop/p03-p03-complaint-evidence-loop.webm",
        "/media/manim/p03/p03-complaint-evidence-loop/poster.png",
    },
}


def _practice(
    practice_id: str,
    prompt: str,
    expected_evidence: list[str],
    feedback: str,
    correction_path: list[str],
) -> dict[str, Any]:
    practice = {
        "id": practice_id,
        "prompt": prompt,
        "expectedEvidence": expected_evidence,
        "feedback": feedback,
        "correctionPath": correction_path,
        "retryable": True,
    }
    activity_spec = P1_ACTIVITY_SPECS.get(practice_id)
    if activity_spec is not None:
        practice.update(activity_spec)
    return practice


P01_ACTIVITY_SPECS: dict[str, dict[str, Any]] = {
    "P1T1-N01-micro-01": {
        "activityKind": "scope-classification",
        "materials": [
            {"id": "room-01-cabinets", "label": "01号机房 K01-K04", "detail": "任务单 HY-01，要求采集 01 号机房 K01-K04。"},
            {"id": "shared-operator-cabinet", "label": "共享机房他网机柜", "detail": "同一物理机房内，柜门标识属于其他运营商。"},
            {"id": "room-02-cabinets", "label": "02号机房 K01-K03", "detail": "站点相同，但任务单未列入 02 号机房。"},
        ],
        "interaction": {
            "type": "classification-board",
            "categories": [
                {"id": "in-scope", "label": "本次采集范围"},
                {"id": "out-of-scope", "label": "排除并说明"},
            ],
        },
        "targetedFeedback": {
            "passed": "范围已与任务单、机房入口和柜号三项证据对齐。",
            "failed": "仍有对象未回到任务单边界；同站点不等于同一采集范围。",
        },
        "transferTarget": "将边界判断写入室内设备与链路证据表的站点、机房和排除对象字段。",
    },
    "P1T1-N02-foundation-01": {
        "activityKind": "evidence-classification",
        "materials": [
            {"id": "room-overview", "label": "机房入口与机柜全景", "detail": "同时看见 HY-01、01号机房和 K02 柜号。"},
            {"id": "device-nameplate", "label": "BBU 完整铭牌", "detail": "包含厂家、型号、序列号和网元标识。"},
            {"id": "two-ended-port-trace", "label": "双端端口与连续走线", "detail": "包含 BBU、ODF、AAU 两端端口和线缆编号。"},
        ],
        "interaction": {
            "type": "classification-board",
            "categories": [
                {"id": "location", "label": "位置证据"},
                {"id": "identity", "label": "身份数据"},
                {"id": "link", "label": "方向链路"},
            ],
        },
        "targetedFeedback": {
            "passed": "三类材料分别回答了在哪里、是谁、从哪里到哪里。",
            "failed": "请按材料能直接证明的问题分类，不要让设备近照替代位置或链路证据。",
        },
        "transferTarget": "把三类证据分别汇入成果表的位置、设备身份和连接字段。",
    },
    "P1T1-N02-application-01": {
        "activityKind": "link-reconstruction",
        "materials": [
            {"id": "bbu-port", "label": "BBU CPRI-1", "detail": "线缆标签 FO-17，方向 ODF-A/12。"},
            {"id": "odf-in", "label": "ODF-A/12 入端", "detail": "来自 BBU CPRI-1，跳纤 JP-08。"},
            {"id": "odf-out", "label": "ODF-B/04 出端", "detail": "JP-08 对接 FO-22。"},
            {"id": "aau-port", "label": "AAU-01 OPT-1", "detail": "线缆标签 FO-22。"},
        ],
        "interaction": {"type": "sequence-builder"},
        "targetedFeedback": {
            "passed": "起点、中间跳接和终点编号连续，链路已经闭合。",
            "failed": "当前顺序存在标签断点；从 BBU 端口开始逐段核对线缆和 ODF 跳接。",
        },
        "transferTarget": "将闭合链路写入成果表的本端、经过节点、对端和照片索引。",
    },
    "P1T1-N02-transfer-01": {
        "activityKind": "structured-record",
        "materials": [
            {"id": "field-pack", "label": "HY-01 现场证据包", "detail": "包含机房全景、K02 柜号、BBU-01 铭牌及 BBU-1/0 至 AAU-1 双端照片。"},
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "siteId", "label": "站点编号", "placeholder": "例如 HY-01"},
                {"id": "roomId", "label": "机房编号", "placeholder": "例如 01"},
                {"id": "cabinetId", "label": "机柜编号", "placeholder": "例如 K02"},
                {"id": "deviceId", "label": "设备标识", "placeholder": "例如 BBU-01"},
                {"id": "nearPort", "label": "本端端口", "placeholder": "例如 BBU-1/0"},
                {"id": "farPort", "label": "对端端口", "placeholder": "例如 AAU-1"},
            ],
        },
        "targetedFeedback": {
            "passed": "结构化记录已把设备、位置和双端端口汇成可回查条目。",
            "failed": "记录仍有字段与证据包不一致；请逐项核对站点、机柜、设备和双端端口。",
        },
        "transferTarget": "形成可直接汇入 P01 专业成果的设备链路记录。",
    },
    "P1T1-N02-remediation-revision-01": {
        "activityKind": "defective-sheet-revision",
        "materials": [
            {
                "id": "missing-field-source",
                "label": "设备与端口字段缺少来源",
                "detail": "IMG-031 是设备铭牌，IMG-032 是源端口；修订必须先指出字段无来源，再补入两张来源照片。",
                "sourceValue": "设备字段：BBU-01；源端口：CPRI-1；字段来源：（空）",
            },
            {
                "id": "missing-photo-index",
                "label": "字段没有照片索引",
                "detail": "设备、源端口、对端口应分别对应 IMG-031、IMG-032、IMG-033，不能只写一条笼统照片备注。",
                "sourceValue": "照片索引：（空）；成果字段：设备、源端口、对端口",
            },
            {
                "id": "missing-link-direction",
                "label": "连接结论缺少方向",
                "detail": "源端为 BBU-01 CPRI-1，对端为 AAU-01 OPT-1；修订必须明确两端及连接方向。",
                "sourceValue": "链路结论：已连接；源端、对端与方向：（空）",
            },
        ],
        "interaction": {
            "type": "revision-form",
            "fields": [
                {"id": "sourceEvidenceRevision", "label": "诊断并修订字段来源", "placeholder": "指出缺陷，并写明来源证据"},
                {"id": "photoIndexRevision", "label": "诊断并修订照片索引", "placeholder": "逐项写明字段与照片编号"},
                {"id": "directionRevision", "label": "诊断并修订连接方向", "placeholder": "写明源端、对端和方向"},
            ],
        },
        "targetedFeedback": {
            "passed": "字段来源、照片索引和链路方向均已完成缺陷诊断与可审计修订。",
            "failed": "修订尚未闭合三类缺陷；请分别补齐字段来源、逐项照片索引以及源端到对端的方向。",
        },
        "transferTarget": "把只有“已连接”的缺陷结果表修订为字段来源、照片索引和连接方向均可复核的成果记录。",
    },
    "P1T1-N02-remediation-conclusion-01": {
        "activityKind": "structured-record",
        "materials": [
            {
                "id": "review-evidence-pack",
                "label": "链路复核材料",
                "detail": "设备铭牌可识别，源端口照片清晰；对端端口照片模糊，当前不能确认对端端口编号。",
            },
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "confirmedFact", "label": "已确认事实", "placeholder": "只写证据已经支持的事实"},
                {"id": "evidenceGap", "label": "证据缺口", "placeholder": "写明尚不能确认的内容及原因"},
                {"id": "risk", "label": "专业风险", "placeholder": "写明直接下结论的风险"},
                {"id": "action", "label": "下一步动作", "placeholder": "写明补证或复核动作"},
            ],
        },
        "targetedFeedback": {
            "passed": "结论已分别说明确认事实、证据缺口、专业风险和下一步动作。",
            "failed": "四部分仍有内容缺失或混写；请让每个字段只承担确认、缺口、风险或动作中的一种职责。",
        },
        "transferTarget": "形成可直接写入成果表复核栏的四部分职业化结论。",
    },
    "P1T1-N03-micro-01": {
        "activityKind": "four-state-judgement",
        "materials": [
            {"id": "power", "label": "直流供电", "detail": "同一时间窗读数 -48.6V，波动在允许范围内。"},
            {"id": "grounding", "label": "保护接地", "detail": "照片未拍到接地线与接地排标识。"},
            {"id": "transport", "label": "传输状态", "detail": "PTN 端口在线且无当前告警。"},
            {"id": "environment", "label": "温控环境", "detail": "温度计为 26℃，同一时刻空调面板显示高温告警。"},
        ],
        "interaction": {
            "type": "state-matrix",
            "categories": [
                {"id": "confirmed", "label": "已确认"},
                {"id": "provisional", "label": "暂定"},
                {"id": "missing", "label": "缺证"},
                {"id": "conflicting", "label": "冲突"},
            ],
        },
        "targetedFeedback": {
            "passed": "四类条件已按证据充分性区分确认、缺证与冲突。",
            "failed": "不要把有记录等同于已确认；缺失和互相矛盾的材料必须单独标记。",
        },
        "transferTarget": "把四态判断迁移到成果表的运行条件、缺口和复核结论。",
    },
    "P1T1-N04-micro-01": {
        "activityKind": "defective-sheet-revision",
        "materials": [
            {
                "id": "duplicate-photo",
                "label": "重复照片编号",
                "detail": "端口照片与机柜全景都占用 IMG-024；IMG-024B 与 IMG-025 尚未占用，可作为端口照片的新编号。",
                "sourceValue": "端口照片 IMG-024；机柜全景 IMG-024",
            },
            {
                "id": "missing-source",
                "label": "设备型号无来源",
                "detail": "IMG-021 与 IMG-022 均完整显示 BBU-01 铭牌和型号，可任选其一补入来源字段。",
                "sourceValue": "BBU-01 型号来源：（空）",
            },
            {
                "id": "open-gap",
                "label": "接地缺口无动作",
                "detail": "GAP-03 缺少接地线与接地排标识证据，需写明补拍、重拍或补采动作。",
                "sourceValue": "GAP-03：未拍到",
            },
        ],
        "interaction": {
            "type": "revision-form",
            "fields": [
                {"id": "duplicatePhotoId", "label": "修订端口照片编号", "placeholder": "输入唯一编号"},
                {"id": "missingSource", "label": "补充型号来源", "placeholder": "输入来源照片编号"},
                {"id": "openGap", "label": "补齐缺口动作", "placeholder": "输入缺口编号与动作"},
            ],
        },
        "targetedFeedback": {
            "passed": "重复编号、无来源字段和开放缺口均已修订为可追溯记录。",
            "failed": "至少一项缺陷仍未闭合；唯一编号、证据来源和补采动作都必须明确。",
        },
        "transferTarget": "输出可进入 P01 室内设备与链路证据表的修订记录。",
    },
}


def _structured_record_activity(
    material_id: str,
    material_label: str,
    material_detail: str,
    passed: str,
    failed: str,
    transfer_target: str,
) -> dict[str, Any]:
    return {
        "activityKind": "structured-record",
        "materials": [{
            "id": material_id,
            "label": material_label,
            "detail": material_detail,
        }],
        "interaction": {
            "type": "record-form",
            "fields": [{
                "id": "response",
                "label": "岗位记录",
                "placeholder": "根据材料写出证据、判断依据和下一步动作",
            }],
        },
        "targetedFeedback": {"passed": passed, "failed": failed},
        "transferTarget": transfer_target,
    }


P23_ACTIVITY_SPECS: dict[str, dict[str, Any]] = {
    "P1T2-N01-micro-01": {
        "activityKind": "scope-classification",
        "materials": [
            {"id": "sector-0", "label": "目标扇区0度", "detail": "HY-02工单明确列入，位于本次站点坐标内。"},
            {"id": "hotspot-h2", "label": "道路热点H2", "detail": "位于工单采样边界内，需布设CQT点。"},
            {"id": "other-operator", "label": "同塔他网天线", "detail": "非目标运营商设备，只能记录共址环境。"},
            {"id": "west-road", "label": "河西支路", "detail": "靠近站点但超出HY-02工单边界。"},
            {"id": "unclear-sector", "label": "标签遮挡的天线", "detail": "物理位置在塔上，扇区和运营商身份无法确认。"},
        ],
        "interaction": {
            "type": "classification-board",
            "categories": [
                {"id": "in-scope", "label": "纳入采集"},
                {"id": "out-of-scope", "label": "排除并说明"},
                {"id": "pending", "label": "待工单复核"},
            ],
        },
        "targetedFeedback": {
            "passed": "对象已按工单坐标、扇区和采样边界分类，排除与待复核项均有依据。",
            "failed": "仍有对象只凭“离站点近”进入范围；请回到工单边界和设备归属重新分类。",
        },
        "transferTarget": "把采集范围、排除对象和待复核项写入P02室外站点与覆盖采集表。",
    },
    "P1T2-N02-foundation-01": {
        "activityKind": "evidence-classification",
        "materials": [
            {"id": "sector-label", "label": "扇区标签S2", "detail": "把后续参数材料回指到唯一目标扇区。"},
            {"id": "compass-north", "label": "罗盘北向照片", "detail": "显示相对真北的水平指向和校准信息。"},
            {"id": "bracket-scale", "label": "支架刻度近景", "detail": "显示机械下倾2度并与S2同框回指。"},
            {"id": "ret-current", "label": "当前RET截面", "detail": "显示扇区2电下倾4度和采集时间。"},
            {"id": "height-reference", "label": "挂高起算全景", "detail": "显示塔基起算面、天线中心和32米测量记录。"},
        ],
        "interaction": {
            "type": "classification-board",
            "categories": [
                {"id": "sector-identity", "label": "扇区身份"},
                {"id": "azimuth", "label": "方位角"},
                {"id": "mechanical-tilt", "label": "机械下倾"},
                {"id": "electrical-tilt", "label": "电下倾"},
                {"id": "mounting-height", "label": "挂高"},
            ],
        },
        "targetedFeedback": {
            "passed": "每项姿态参数都已绑定扇区身份、测量基准和独立材料。",
            "failed": "仍有参数只写数值未写对象或基准；请核对标签、真北、刻度、时间和起算面。",
        },
        "transferTarget": "形成P02成果表中的扇区姿态证据记录。",
    },
    "P1T2-N02-application-01": {
        "activityKind": "link-reconstruction",
        "materials": [
            {"id": "sector-s2", "label": "锁定扇区2", "detail": "标签S2与工单对象一致。"},
            {"id": "azimuth-120", "label": "主瓣方位120度", "detail": "罗盘相对真北测得，校准记录缺失。"},
            {"id": "tilt-2-4", "label": "下倾2度/4度", "detail": "支架机械刻度2度，当前RET电下倾4度。"},
            {"id": "height-32", "label": "挂高32米", "detail": "以塔基为起算面。"},
            {"id": "hotspot-125", "label": "H2道路方向125度", "detail": "热点距站620米，楼体位于中间。"},
        ],
        "interaction": {"type": "sequence-builder"},
        "targetedFeedback": {
            "passed": "已按身份、水平指向、垂直姿态、挂高距离和风险缺口重建关系。",
            "failed": "顺序仍从单一角度跳到覆盖结论；请先锁定对象，再依次处理水平、垂直和缺口。",
        },
        "transferTarget": "把方向关系与待校准缺口写入P02判断字段。",
    },
    "P1T2-N02-transfer-01": {
        "activityKind": "structured-record",
        "materials": [
            {"id": "concealed-antenna-pack", "label": "美化罩替代证据包", "detail": "包含工单、S2标签、外部测向、当前RET、挂高和遮挡记录。"},
            {"id": "no-removal-order", "label": "禁止拆罩要求", "detail": "工单明确现场人员无权拆卸美化罩。"},
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "objectIdentity", "label": "对象身份", "placeholder": "写扇区标签与工单回指"},
                {"id": "externalDirection", "label": "外部测向", "placeholder": "写测向值、基准和材料"},
                {"id": "retAndHeight", "label": "RET与挂高", "placeholder": "写参数、时间与起算面"},
                {"id": "permissionBoundary", "label": "权限边界", "placeholder": "写不可见项与禁止动作"},
                {"id": "reviewAction", "label": "复核动作", "placeholder": "写授权复核或替代采样"},
            ],
        },
        "targetedFeedback": {
            "passed": "替代记录同时说明了可确认事实、不可见边界和合法复核动作。",
            "failed": "仍把不可见刻度写成现场事实，或缺少权限边界与替代复核动作。",
        },
        "transferTarget": "形成美化罩场景的P02替代证据记录。",
    },
    "P1T2-N03-micro-01": {
        "activityKind": "four-state-judgement",
        "materials": [
            {"id": "obstruction", "label": "楼体遮挡", "detail": "楼体位于主瓣与H2之间，可见但影响尚待采样。"},
            {"id": "parameter-conflict", "label": "工参冲突", "detail": "当前RET为8度，授权工参为4度。"},
            {"id": "stale-ret", "label": "过期RET", "detail": "截面早于现场采集七天，当前值未知。"},
            {"id": "locked-ladder", "label": "未授权塔梯", "detail": "安全锁未授权开启，禁止登塔。"},
        ],
        "interaction": {
            "type": "state-matrix",
            "categories": [
                {"id": "satisfied", "label": "满足"},
                {"id": "anomaly", "label": "异常"},
                {"id": "pending", "label": "待复核"},
                {"id": "unauthorized", "label": "无权操作"},
            ],
        },
        "targetedFeedback": {
            "passed": "事实冲突、证据缺口和权限边界已使用不同状态表达。",
            "failed": "请勿把缺材料、参数冲突和禁止操作都写成异常；逐项核对触发条件。",
        },
        "transferTarget": "把风险状态与替代动作写入P02路线设计条件。",
    },
    "P1T2-N04-micro-01": {
        "activityKind": "defective-sheet-revision",
        "materials": [
            {"id": "route", "label": "V1路线", "detail": "路线A绕开遮挡边界，不能验证风险假设。", "sourceValue": "路线A"},
            {"id": "points", "label": "V1点位", "detail": "只有H2热点点位，没有楼前楼后对照点。", "sourceValue": "H2-01"},
            {"id": "window", "label": "V1时间窗", "detail": "未填写采样时间和业务条件。", "sourceValue": "待填写"},
            {"id": "metrics", "label": "V1指标", "detail": "只写“信号”，没有RSRP、SINR和业务现象。", "sourceValue": "信号"},
        ],
        "interaction": {
            "type": "revision-form",
            "fields": [
                {"id": "routeRevision", "label": "修订路线", "placeholder": "选择穿过风险边界的路线"},
                {"id": "comparisonPoints", "label": "对照点", "placeholder": "填写楼前、边界、楼后与热点点位"},
                {"id": "samplingWindow", "label": "时间与条件", "placeholder": "填写时间窗、终端、业务和小区"},
                {"id": "acceptanceMetrics", "label": "验收指标", "placeholder": "填写RSRP、SINR和业务现象"},
                {"id": "versionDifference", "label": "V1/V2差异", "placeholder": "逐项说明修订依据"},
            ],
        },
        "targetedFeedback": {
            "passed": "V2路线能够穿越风险边界，并含对照点、时间条件、指标和版本差异。",
            "failed": "修订仍不能验证遮挡假设；请补齐路线、对照点、条件、指标和差异。",
        },
        "transferTarget": "生成可执行的P02室外站点与覆盖采集表修订记录。",
    },
    "P1T3-N01-micro-01": {
        "activityKind": "structured-record",
        "materials": [
            {"id": "complaint-narrative", "label": "原始投诉口述", "detail": "最近下班前在公司高层开会老卡，有时重进就好。"},
            {"id": "work-order-facts", "label": "工单补充事实", "detail": "工作日18:00—19:00，A座18层会议室，视频会议5次中4次卡顿。"},
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "occurrenceWindow", "label": "发生时间", "placeholder": "填写可执行时段"},
                {"id": "location", "label": "发生地点", "placeholder": "填写楼栋、楼层和房间"},
                {"id": "business", "label": "业务", "placeholder": "填写可重复业务动作"},
                {"id": "symptomFrequency", "label": "现象与频次", "placeholder": "填写现象、次数和恢复动作"},
                {"id": "terminalNetwork", "label": "终端与网络模式", "placeholder": "填写已知值或待追问项"},
                {"id": "excludedGuess", "label": "删除的原因猜测", "placeholder": "标明未被事实支持的猜测"},
            ],
        },
        "targetedFeedback": {
            "passed": "口述已转成可复测事实，模糊项和终端缺项均保留追问动作。",
            "failed": "记录仍混入原因猜测或缺少时间、地点、业务、现象、频次和终端条件。",
        },
        "transferTarget": "形成P03投诉事实基线与追问清单。",
    },
    "P1T3-N02-foundation-01": {
        "activityKind": "structured-record",
        "materials": [
            {"id": "record-a", "label": "复测A", "detail": "原会议室、原终端、同一视频会议，未出现卡顿。"},
            {"id": "record-b", "label": "复测B", "detail": "改到一层大厅，其他条件相同，流畅。"},
            {"id": "record-c", "label": "复测C", "detail": "原会议室改做网页测速，流畅。"},
            {"id": "record-d", "label": "复测D", "detail": "原会议室改用工程测试机，流畅。"},
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "recordAComparison", "label": "A条件比对", "placeholder": "自行列出保持与变化条件"},
                {"id": "recordBComparison", "label": "B条件比对", "placeholder": "自行列出保持与变化条件"},
                {"id": "recordCComparison", "label": "C条件比对", "placeholder": "自行列出保持与变化条件"},
                {"id": "recordDComparison", "label": "D条件比对", "placeholder": "自行列出保持与变化条件"},
                {"id": "comparableConclusion", "label": "可比结论", "placeholder": "写可比记录与结论边界"},
            ],
        },
        "targetedFeedback": {
            "passed": "四份记录已独立比对条件，并正确区分同条件未复现与条件不等价。",
            "failed": "仍用“流畅”否定投诉；请逐份找出地点、业务、终端或时段变化。",
        },
        "transferTarget": "形成P03同条件复测比对记录。",
    },
    "P1T3-N02-application-01": {
        "activityKind": "link-reconstruction",
        "materials": [
            {"id": "enter-meeting", "label": "18:00进入会议", "detail": "确认原地点、原终端和5G模式。"},
            {"id": "share-screen", "label": "18:04共享屏幕", "detail": "开始投诉对应业务动作。"},
            {"id": "freeze", "label": "18:07画面卡顿", "detail": "用户侧观察到画面冻结。"},
            {"id": "retransmission", "label": "18:07:12业务重传", "detail": "业务日志记录重传事件。"},
            {"id": "radio-sample", "label": "18:07无线采样", "detail": "服务小区S2，RSRP -93dBm，SINR -3dB。"},
            {"id": "recovery", "label": "18:09业务恢复", "detail": "画面恢复但需保留前后窗口。"},
            {"id": "clock-check", "label": "结束校时复核", "detail": "记录终端、日志和采样设备的时钟偏差。"},
        ],
        "interaction": {"type": "sequence-builder"},
        "targetedFeedback": {
            "passed": "用户动作、业务事件、服务小区、无线指标和校时已进入同一15分钟时间轴。",
            "failed": "时间轴仍缺操作起点、同窗采样或校时；请按事件发生顺序重建。",
        },
        "transferTarget": "生成可重复执行的P03十五分钟复测脚本。",
    },
    "P1T3-N02-transfer-01": {
        "activityKind": "structured-record",
        "materials": [
            {"id": "rail-call-drop-case", "label": "高速列车掉线材料", "detail": "G218次固定区段18:40左右，同一终端通话，附服务小区和掉线时刻。"},
            {"id": "trajectory-log", "label": "切换轨迹", "detail": "记录沿途小区，但尚未重复同一路线。"},
        ],
        "interaction": {
            "type": "record-form",
            "fields": [
                {"id": "trainDirection", "label": "车次与方向", "placeholder": "填写车次、运行方向"},
                {"id": "routeSection", "label": "运行区段", "placeholder": "填写起止区段和定位口径"},
                {"id": "timeWindow", "label": "时间窗", "placeholder": "填写时刻和晚点校正方式"},
                {"id": "deviceBusiness", "label": "终端与业务", "placeholder": "填写需保持一致的条件"},
                {"id": "cellTrajectory", "label": "小区与切换轨迹", "placeholder": "填写连续记录字段"},
                {"id": "repeatPlan", "label": "重复复测", "placeholder": "填写同路线重复和回访计划"},
            ],
        },
        "targetedFeedback": {
            "passed": "固定点方法已正确迁移为车次、区段、时间窗和连续轨迹复测。",
            "failed": "方案仍把移动投诉当成一个坐标点，或缺少连续轨迹与重复路线。",
        },
        "transferTarget": "形成高速移动场景的P03可重复复测方案。",
    },
    "P1T3-N03-micro-01": {
        "activityKind": "four-state-judgement",
        "materials": [
            {"id": "business-freeze", "label": "18:07卡顿与重传", "detail": "用户现象和业务日志同窗。"},
            {"id": "low-sinr", "label": "SINR -3dB", "detail": "同窗、同服务小区S2的无线采样。"},
            {"id": "high-load", "label": "拥塞KPI升高", "detail": "S2同窗容量指标异常升高。"},
            {"id": "no-alarm", "label": "无当前告警", "detail": "告警系统没有同窗设备告警。"},
            {"id": "late-recovery", "label": "18:09恢复", "detail": "业务恢复时拥塞KPI仍高。"},
        ],
        "interaction": {
            "type": "state-matrix",
            "categories": [
                {"id": "supports", "label": "支持当前线索"},
                {"id": "conflicts", "label": "形成冲突"},
                {"id": "needs-correlation", "label": "需要同窗关联"},
                {"id": "cannot-conclude", "label": "不能单独定因"},
            ],
        },
        "targetedFeedback": {
            "passed": "多源材料已按同窗和服务小区交叉，支持与冲突均保留在结论边界内。",
            "failed": "仍由单条KPI或无告警直接定因；请核对来源独立性、时窗和冲突。",
        },
        "transferTarget": "形成P03可审计的交叉证据判断。",
    },
    "P1T3-N04-micro-01": {
        "activityKind": "defective-sheet-revision",
        "materials": [
            {"id": "conclusion", "label": "V1结论", "detail": "只有“晚高峰卡顿，建议优化”，未标结论边界。", "sourceValue": "建议优化"},
            {"id": "evidence", "label": "V1材料索引", "detail": "业务日志、采样和KPI未挂接到调查单字段。", "sourceValue": "附件见后"},
            {"id": "owner", "label": "V1责任人", "detail": "没有责任角色和完成时限。", "sourceValue": "相关人员"},
            {"id": "closure", "label": "V1闭环", "detail": "没有同条件复测、用户回访和验收条件。", "sourceValue": "处理完成"},
        ],
        "interaction": {
            "type": "revision-form",
            "fields": [
                {"id": "evidenceLinks", "label": "材料挂接", "placeholder": "填写日志、采样和KPI索引"},
                {"id": "boundedConclusion", "label": "结论边界", "placeholder": "写当前线索和未确定项"},
                {"id": "responsibleOwner", "label": "责任人", "placeholder": "填写可接单责任角色"},
                {"id": "deadline", "label": "完成时限", "placeholder": "填写明确时限"},
                {"id": "retestPlan", "label": "同条件复测", "placeholder": "填写条件、次数和记录要求"},
                {"id": "callback", "label": "用户回访", "placeholder": "填写回访对象、时间和问题"},
                {"id": "acceptance", "label": "验收标准", "placeholder": "填写可判定的业务与网络条件"},
            ],
        },
        "targetedFeedback": {
            "passed": "V2调查单已有材料、边界、责任人、时限、复测、回访和验收闭环。",
            "failed": "修订仍不可派单或验收；请补齐责任动作和可判定闭环条件。",
        },
        "transferTarget": "生成可进入P03成果表的投诉信息调查单修订记录。",
    },
}


P1_ACTIVITY_SPECS: dict[str, dict[str, Any]] = {
    **P01_ACTIVITY_SPECS,
    **P23_ACTIVITY_SPECS,
}


DEEP_SELF_STUDY: dict[str, dict[str, Any]] = {
    "P1T1-N02": {
        "kind": "deep",
        "nodeId": "P1T1-N02",
        "caseBackground": [
            "海岳路站点准备扩容。现场人员交回了机柜全景、BBU近景、AAU照片和若干端口照片，但照片编号没有说明它们是否属于同一站点、同一机柜和同一条链路。复核人员不能只凭设备外形或亮灯状态下结论。",
            "本节点要把零散照片整理成可回查的设备证据链：先证明设备在哪里，再证明设备是谁，最后证明信号或传输从哪个端口流向哪个端口。三类证据回答不同问题，缺少任何一类都不能形成可交付拓扑。",
        ],
        "taskQuestion": "设备位置、设备身份、连接方向分别需要哪些证据，为什么一张设备近照不能同时证明三件事？",
        "prerequisites": [
            "能区分机房、机柜、槽位、端口四个位置层级。",
            "知道BBU负责基带处理，AAU/RRU负责射频处理，ODF/PTN承担光纤配线或传输。",
            "能按站点编号、拍摄时间和照片编号建立一一对应关系。",
        ],
        "glossary": [
            {"term": "BBU", "definition": "基带处理单元，通常安装在机柜或插箱内；确认它时既要看设备铭牌，也要记录所在机柜和槽位。"},
            {"term": "AAU/RRU", "definition": "有源天线单元或射频拉远单元，承担射频处理；与BBU之间通常通过标记明确的光纤链路连接。"},
            {"term": "ODF", "definition": "光纤配线架，用于光缆成端、跳接和编号管理；端口标签是追踪链路方向的重要中间证据。"},
            {"term": "eCPRI/CPRI", "definition": "BBU与射频侧之间的前传接口关系；判断链路时必须核对两端端口和连续走线，不能只看单端插头。"},
        ],
        "annotatedFigures": [{
            "kind": "topology",
            "title": "机房—机柜—设备—双端端口证据链",
            "evidenceLabels": [
                "A 机房入口：站点名称与机房编号，回答属于哪个现场",
                "B 机柜全景：柜号与设备相对位置，回答安装在哪里",
                "C 设备铭牌：厂家、型号、序列号或网元标识，回答设备是谁",
                "D 本端端口：板卡、槽位、端口号与线缆标签",
                "E 连续走线：从本端到配线架或对端的可跟踪路径",
                "F 对端端口：对端设备身份、端口号和方向标签，回答从哪里到哪里",
            ],
        }],
        "evidenceRules": [
            {
                "claim": "位置证据回答设备在哪里",
                "requiredEvidence": ["带站点/机房编号的入口记录", "同时看见柜号和设备的机柜全景", "可辨认的槽位或安装层位"],
                "reason": "设备近照没有空间参照，同型号设备可能出现在多个机房和机柜，无法回到现场复核。",
            },
            {
                "claim": "身份信息回答设备是谁",
                "requiredEvidence": ["完整铭牌", "厂家与型号", "序列号、网元标识或板卡/端口标签"],
                "reason": "外形和亮灯只能说明看到一个正在通电的对象，不能唯一识别设备及其逻辑身份。",
            },
            {
                "claim": "连接方向回答从哪里到哪里",
                "requiredEvidence": ["本端设备与端口标签", "连续走线或可核对的线缆编号", "对端设备与端口标签"],
                "reason": "单端插线只能证明端口被占用；双端身份与中间路径一致，才能排除跳接、错接和断链。",
            },
        ],
        "reasoningSteps": [
            "先核对任务单、站点名称、机房编号和拍摄时间，排除照片混站。",
            "在机柜全景中找到柜号、安装层位和目标设备，建立位置证据。",
            "读取设备铭牌、型号、序列号或网元标识，并与任务清单核对，建立身份信息。",
            "记录本端板卡、槽位、端口号和线缆标签，明确链路起点。",
            "沿连续走线或同一线缆编号追到ODF/PTN/AAU等对端，并记录对端身份与端口，明确方向。",
            "把位置、身份和双端链路放入同一照片索引；存在冲突就回到现场补拍，不用猜测补全。",
        ],
        "examples": [
            {
                "title": "正例一：确认BBU到AAU的前传链路",
                "evidence": ["01号机房入口与K02柜全景", "K02柜第6U设备铭牌：BBU5900，网元标识HY-01", "BBU槽位3端口CPRI-1标签F-017", "F-017连续走线及AAU-1光口标签"],
                "reasoning": ["入口和柜号把设备定位到唯一空间", "铭牌与网元标识排除同柜其他BBU", "本端和对端都出现F-017且走线连续，排除仅凭单端端口猜测"],
                "conclusion": "可确认HY-01站K02柜BBU槽位3的CPRI-1，经F-017连接到AAU-1光口；位置、身份和方向均可复核。",
            },
            {
                "title": "正例二：确认BBU到PTN的回传路径",
                "evidence": ["K02柜与相邻ODF-03同框全景", "BBU主控板GE0/0铭牌与端口近景", "跳纤T-204两端标签", "ODF-03/12到PTN-02 GE1/0/7端口记录"],
                "reasoning": ["设备与配线架的空间关系明确", "GE0/0和T-204确定起点", "ODF成端与PTN对端标签闭合，排除跳纤跨接到其他设备"],
                "conclusion": "可确认BBU GE0/0通过T-204和ODF-03/12连接到PTN-02 GE1/0/7，链路方向为BBU到传输设备。",
            },
        ],
        "counterexamples": [
            {
                "title": "反例一：只有亮灯设备近照",
                "error": "照片能看见绿灯和设备外壳，但没有机房/柜号、完整铭牌和端口去向；亮灯不等于身份正确，也不等于链路正确。",
                "correctionPath": ["补拍带站点编号的入口和机柜全景，确认位置", "补拍完整铭牌和网元标识，确认身份", "补拍本端、连续走线和对端端口，确认方向"],
            },
            {
                "title": "反例二：只有BBU单端端口",
                "error": "端口CPRI-1插有光纤，只能说明端口被占用；看不到线缆编号、连续路径和AAU对端，不能判断实际连接对象。",
                "correctionPath": ["记录本端端口与线缆标签", "沿线缆或同一编号追踪经过的ODF", "记录AAU/RRU对端身份和端口并核对编号"],
            },
        ],
        "practices": {
            "foundation": [_practice(
                "P1T1-N02-foundation-01",
                "把柜号全景、设备铭牌、双端端口三张证据分别归入位置、身份、方向，并说明不能互相替代的原因。",
                ["三类证据一一归类", "每类至少一条不能替代的理由"],
                "归类正确时，应能用‘在哪里、是谁、从哪里到哪里’复述三类证据。",
                ["先写三类证据各自回答的问题", "再检查每张照片是否真的包含对应字段", "错误项清空后重试"],
            )],
            "application": [_practice(
                "P1T1-N02-application-01",
                "给定BBU端口、ODF成端和两个AAU端口记录，选择唯一能够闭合的链路并写出排除另外两条的依据。",
                ["本端与对端标签一致", "中间线缆编号连续", "排除证据明确"],
                "结论必须同时引用起点、中间路径和终点，不能只选看起来最近的设备。",
                ["标出所有端点编号", "按线缆编号连接中间路径", "发现断点就标记待补证后重试"],
            )],
            "transfer": [
                _practice(
                    "P1T1-N02-transfer-01",
                    "将同样的证据方法迁移到电源链：证明某AAU由哪一路直流配电端子供电。",
                    ["AAU位置与身份", "电源线两端标签", "配电端子和方向"],
                    "设备类型改变后，位置—身份—双端方向的证明逻辑仍保持不变。",
                    ["先确定AAU唯一身份", "记录设备侧电源端", "追踪到配电侧端子并核对线号"],
                ),
                _practice(
                    "P1T1-N02-remediation-revision-01",
                    "诊断只有“已连接”结论的缺陷结果表，并分别修订字段来源、照片索引和连接方向。",
                    ["明确指出三类缺陷", "每项修订引用给定证据", "源端、对端和方向可复核"],
                    "通过时，修订记录应能让复核者从每个字段回到证据，并沿源端到对端重建链路。",
                    ["先逐项指出原表缺什么", "再把给定照片编号写入对应字段", "最后补齐源端、对端与连接方向"],
                ),
                _practice(
                    "P1T1-N02-remediation-conclusion-01",
                    "根据给定复核材料，分别填写已确认事实、证据缺口、专业风险和下一步动作。",
                    ["确认事实只引用清晰证据", "缺口说明当前不能确认的内容", "风险与动作具体对应缺口"],
                    "四部分共同形成职业化结论，但不能用猜测填补模糊的对端端口证据。",
                    ["先写铭牌和源端口支持的事实", "再写对端端口照片模糊造成的缺口", "最后写风险和补拍复核动作"],
                ),
            ],
        },
        "transferTask": {
            "scenario": "另一座共享机房内有两套不同厂家的BBU和共用ODF，请为其中一条BBU—RRU链路制定补拍清单。",
            "deliverable": "一页设备链路证据单，包含照片编号、位置、身份、本端、路径、对端和待补证项。",
            "successCriteria": ["任何照片都可回到唯一站点/机柜", "设备铭牌可唯一识别", "链路两端和连续路径可闭合", "缺失证据明确标记而非猜测"],
        },
        "outputTemplate": {
            "stationAndRoom": "站点名称、机房编号、采集时间",
            "locationEvidence": "柜号、安装层位、全景照片编号",
            "identityEvidence": "厂家、型号、序列号/网元标识、铭牌照片编号",
            "connectionEvidence": "本端设备/端口、线缆编号、经过节点、对端设备/端口、照片编号",
            "judgement": "链路结论、冲突证据、待补证项",
        },
        "rubric": [
            {"criterion": "位置证据完整且可回查", "maxScore": 20},
            {"criterion": "身份信息唯一且与任务清单一致", "maxScore": 20},
            {"criterion": "双端端口与连续链路方向闭合", "maxScore": 25},
            {"criterion": "推理能排除歧义和冲突", "maxScore": 15},
            {"criterion": "照片索引与字段一一对应", "maxScore": 10},
            {"criterion": "缺口和补证动作明确", "maxScore": 10},
        ],
    },
    "P1T2-N02": {
        "kind": "deep",
        "nodeId": "P1T2-N02",
        "caseBackground": [
            "海滨大道站点的道路东侧出现弱覆盖。工参表写着扇区2方位角120°、机械下倾4°、挂高32米，现场照片却只拍到天线外观。团队需要判断工参是否与现场一致，并说明天线姿态怎样影响主瓣方向和覆盖距离。",
            "方位角、下倾角和挂高是三个不同维度：方位角决定水平指向，下倾角改变垂直主瓣落点，挂高与遮挡共同影响可视范围。每个参数都必须绑定扇区身份、测量基准和现场证据。",
        ],
        "taskQuestion": "怎样用可复核证据分别确认某扇区的方位角、下倾角和挂高，并把三项参数组合成覆盖方向判断？",
        "prerequisites": [
            "能用站点编号和扇区标签唯一识别天线。",
            "理解正北为0°、顺时针计角的方位角基准。",
            "能区分机械下倾与电下倾，并知道高度测量需要地面基准。",
        ],
        "glossary": [
            {"term": "方位角", "definition": "天线水平方向相对正北顺时针的角度，必须与扇区编号、罗盘基准和拍摄方向同时记录。"},
            {"term": "机械下倾", "definition": "天线本体物理向下倾斜的角度，可通过倾角仪和支架刻度核验。"},
            {"term": "电下倾", "definition": "通过天线内部电气相位调整形成的下倾，需读取RET/网管参数，不能仅凭外观推断。"},
            {"term": "挂高", "definition": "天线参考点相对地面基准的垂直高度；测量时要说明地面起算点和测量方法。"},
        ],
        "annotatedFigures": [{
            "kind": "antenna",
            "title": "扇区身份—水平指向—垂直姿态—地面基准图",
            "evidenceLabels": [
                "A 扇区铭牌：站点、扇区号、天线编号",
                "B 正北基准线：罗盘校准位置与无磁干扰点",
                "C 主瓣指向线：方位角读数与目标道路方向",
                "D 支架/倾角仪：机械下倾读数",
                "E RET/网管参数：电下倾值与采集时间",
                "F 地面基准到天线参考点：挂高测量线",
                "G 建筑与树木：遮挡高度和相对方向",
            ],
        }],
        "evidenceRules": [
            {
                "claim": "方位角证明水平朝向",
                "requiredEvidence": ["扇区身份", "校准后的正北基准", "罗盘/测向读数", "目标道路或地标方向"],
                "reason": "只有角度而没有扇区和北向基准，无法判断读数属于哪副天线或是否受金属塔体干扰。",
            },
            {
                "claim": "下倾角证明垂直主瓣姿态",
                "requiredEvidence": ["机械倾角仪读数", "支架刻度", "RET或网管电下倾", "采集时间"],
                "reason": "机械下倾和电下倾来源不同；只拍支架外观会漏掉电下倾，也不能保证读数绑定正确扇区。",
            },
            {
                "claim": "挂高证明天线相对地面的高度",
                "requiredEvidence": ["地面起算点", "测距/测高读数", "天线参考点", "测量方法与遮挡关系"],
                "reason": "塔高、平台高和天线挂高不是同一个数；没有起算点会把不同高度口径混用。",
            },
        ],
        "reasoningSteps": [
            "用站点与扇区铭牌锁定目标天线，避免把相邻扇区参数混入。",
            "在远离金属干扰的位置校准正北，记录方位角读数并与道路/地标方向交叉核对。",
            "分别读取机械下倾和RET/网管电下倾，保留扇区与时间信息，不把两者合并成模糊的‘下倾角’。",
            "从明确地面基准测到天线参考点，记录挂高和测量方法。",
            "把方位角、总下倾趋势、挂高及遮挡放到同一剖面中，推断主瓣可能落点。",
            "现场值与工参不一致时先标记差异并复测，不用工参覆盖现场读数。",
        ],
        "examples": [
            {
                "title": "正例一：道路扇区姿态核验",
                "evidence": ["扇区2铭牌与站点编号", "校准后方位角121°", "机械下倾4°、电下倾2°", "地面基准到天线参考点31.8米", "道路中心线方向118°"],
                "reasoning": ["扇区身份唯一", "方位角与道路方向差3°，水平指向一致", "两类下倾来源可追溯", "挂高口径明确，可结合道路距离判断主瓣落点"],
                "conclusion": "现场姿态与工参基本一致，扇区2主瓣朝向海滨大道；弱覆盖调查应继续核对远端遮挡和下倾是否过大。",
            },
            {
                "title": "正例二：楼间扇区偏航识别",
                "evidence": ["扇区1标签", "两次无磁干扰点读数均为76°", "工参60°", "挂高24.5米", "东侧高楼方向78°且高于天线参考点"],
                "reasoning": ["重复读数排除单次手持误差", "现场与工参相差16°", "主瓣更接近高楼方向", "挂高和遮挡关系支持楼体影响假设"],
                "conclusion": "应登记扇区1现场方位角偏差并复核安装；在修正前不能按60°工参规划测试路线。",
            },
        ],
        "counterexamples": [
            {
                "title": "反例一：罗盘截图没有扇区身份",
                "error": "截图显示120°，但没有站点、扇区、校准位置和目标方向；读数可能来自相邻天线或受塔体磁干扰。",
                "correctionPath": ["补拍站点和扇区铭牌", "移到无磁干扰点校准并重复测量", "把读数与道路/地标方向同图标注"],
            },
            {
                "title": "反例二：把‘下倾6°’当成完整姿态",
                "error": "没有说明6°是机械、电下倾还是两者合计，也没有挂高和地面基准，无法推断覆盖落点。",
                "correctionPath": ["分别读取机械支架和RET/网管值", "记录挂高的起算点与参考点", "结合方位角和遮挡重新判断"],
            },
        ],
        "practices": {
            "foundation": [_practice(
                "P1T2-N02-foundation-01",
                "将方位角、机械下倾、电下倾、挂高四条记录分别配对到所需证据和测量基准。",
                ["参数与证据一一对应", "方位角含北向基准", "挂高含地面起算点"],
                "正确答案应区分水平角、两种下倾来源和垂直高度口径。",
                ["先写每个参数描述的空间维度", "再补身份和基准", "修正混用项后重试"],
            )],
            "application": [_practice(
                "P1T2-N02-application-01",
                "根据某扇区现场方位角、两类下倾、挂高和道路方向，判断主瓣是否面向投诉路段并列出仍缺的证据。",
                ["水平指向比较", "垂直姿态解释", "挂高/遮挡关系", "缺口清单"],
                "参数必须组合解释；只说某个角度‘正常’不能形成覆盖判断。",
                ["先锁定扇区", "分别画水平和垂直关系", "最后叠加遮挡并重试"],
            )],
            "transfer": [_practice(
                "P1T2-N02-transfer-01",
                "把姿态证据方法迁移到楼顶美化罩内天线，制定不拆罩情况下的复核方案。",
                ["扇区身份替代证据", "可用测向/工参证据", "挂高和遮挡记录", "不确定性说明"],
                "受限场景可以使用替代证据，但必须写清证据边界和需要复核的参数。",
                ["列出不可直接读取的参数", "为每项选择独立替代证据", "标记置信度后重试"],
            )],
        },
        "transferTask": {
            "scenario": "一座楼顶站的工参长期未更新，三个扇区分别覆盖主干道、校园和高层住宅，请制定现场姿态复核记录。",
            "deliverable": "三扇区姿态对照表与一张主瓣—场景关系图。",
            "successCriteria": ["每项参数绑定唯一扇区", "方位角有北向基准", "机械/电下倾分开", "挂高起算点明确", "现场差异和遮挡被标注"],
        },
        "outputTemplate": {
            "sectorIdentity": "站点、扇区、天线编号、采集时间",
            "azimuth": "北向基准、两次读数、道路/地标方向",
            "tilt": "机械下倾、电子下倾、证据来源",
            "height": "地面基准、天线参考点、挂高、测量方法",
            "environment": "遮挡体、相对方向、高度关系",
            "judgement": "与工参差异、覆盖方向判断、待复核项",
        },
        "rubric": [
            {"criterion": "扇区身份和采集时间可追溯", "maxScore": 15},
            {"criterion": "方位角基准与读数完整", "maxScore": 20},
            {"criterion": "机械/电下倾证据分离", "maxScore": 20},
            {"criterion": "挂高口径与测量方法明确", "maxScore": 15},
            {"criterion": "场景遮挡与参数关系解释", "maxScore": 15},
            {"criterion": "结论、差异和复核动作可执行", "maxScore": 15},
        ],
    },
    "P1T3-N02": {
        "kind": "deep",
        "nodeId": "P1T3-N02",
        "caseBackground": [
            "用户投诉每天18:00左右在滨江中心A座18层视频会议卡顿。第一次复测人员在楼下大厅用另一部手机播放短视频，结果正常，便写下‘现场未复现’。这次测试改变了地点、业务、终端和时间，不能反证原投诉。",
            "投诉复现不是简单地‘再测一次’，而是控制关键条件：同地点、同业务、同终端，并尽量保持同一时间窗和操作步骤；同时记录服务小区、无线指标和终端状态，才能判断测试现象是否与用户投诉处于同一场景。",
        ],
        "taskQuestion": "怎样证明一次复测与用户投诉处于同一场景，并区分‘没有复现’和‘复测条件不等价’？",
        "prerequisites": [
            "能把投诉口述拆成时间、地点、业务、终端、现象和频次。",
            "知道RSRP、SINR、服务小区和业务结果分别描述信号、质量、连接对象和用户体验。",
            "理解控制变量：一次只改变待验证因素，其余关键条件保持一致。",
        ],
        "glossary": [
            {"term": "场景等价", "definition": "复测在地点、业务、终端和关键时间窗上与投诉一致；不一致时必须明确记录差异，不能直接比较结果。"},
            {"term": "服务小区", "definition": "终端当前接入的网络小区；同一位置可能因移动、重选或负荷变化接入不同小区，因此复测必须留痕。"},
            {"term": "RSRP/SINR", "definition": "RSRP反映参考信号强度，SINR反映信号与干扰噪声关系；两者要与业务现象和服务小区同时解释。"},
            {"term": "控制变量", "definition": "为比较投诉与复测，只改变需要验证的因素，保持地点、业务流程、终端和时间窗等关键条件稳定。"},
        ],
        "annotatedFigures": [{
            "kind": "complaint",
            "title": "投诉事实—同条件复测—网络证据对齐图",
            "evidenceLabels": [
                "A 地点：楼栋、楼层、房间/坐标与室内位置照片",
                "B 业务：视频会议应用、账号、操作步骤、持续时间",
                "C 终端：品牌型号、系统/基带版本、SIM与网络模式",
                "D 时间：投诉高发时段与复测时间窗",
                "E 现象：卡顿时刻、业务日志、测速或失败截图",
                "F 网络：服务小区、RSRP、SINR、频点与切换记录",
                "G 对照：同地点重复测试和可控的单变量变化",
            ],
        }],
        "evidenceRules": [
            {
                "claim": "同地点证明空间条件一致",
                "requiredEvidence": ["楼栋/楼层/房间或坐标", "测试点照片", "站位和移动路径"],
                "reason": "从18层会议室换到大厅会改变覆盖、遮挡和服务小区，正常结果不能反证原地点投诉。",
            },
            {
                "claim": "同业务证明负载与操作一致",
                "requiredEvidence": ["应用与业务类型", "相同操作步骤", "持续时间和业务结果日志"],
                "reason": "短视频缓存、实时会议和语音通话对时延、上行和丢包的要求不同，不能互相替代。",
            },
            {
                "claim": "同终端证明设备条件一致",
                "requiredEvidence": ["终端型号", "系统/基带版本", "SIM与网络模式", "终端状态"],
                "reason": "不同终端的频段能力、天线和软件策略不同，换机后结果可能来自终端差异。",
            },
            {
                "claim": "同时间窗和网络留痕证明可比较",
                "requiredEvidence": ["投诉与复测时间", "服务小区", "RSRP/SINR", "现象发生时刻"],
                "reason": "负荷、干扰和小区选择随时间变化；没有同步网络证据就无法解释为何出现或未出现现象。",
            },
        ],
        "reasoningSteps": [
            "从工单提取地点、业务、终端、时间、现象和频次，缺项先向用户核实。",
            "制定同地点、同业务、同终端的复测步骤，并把高发时间窗设为首选测试窗口。",
            "测试前记录终端版本、SIM、网络模式和初始服务小区，保证条件可回放。",
            "按用户操作顺序执行足够时长，给业务步骤和网络采样统一时间戳。",
            "现象发生时同步保存业务日志、服务小区、RSRP/SINR及终端状态；未发生也记录完整测试时长。",
            "比较投诉与复测条件：只有关键条件等价时才能讨论复现结果；条件不同应结论为‘未完成等价复测’。",
            "通过重复测试或一次只改变一个变量建立对照，区分偶发现象、终端因素和网络因素。",
        ],
        "examples": [
            {
                "title": "正例一：高峰期视频会议卡顿复现",
                "evidence": ["A座18层原会议室与用户座位照片", "同型号终端、同SIM和5G模式", "18:00同一会议应用入会步骤", "18:07卡顿日志与同秒RSRP -109 dBm、SINR -3 dB、服务小区切换记录"],
                "reasoning": ["地点、业务、终端和时间窗均与投诉一致", "业务卡顿与无线质量下降时间对齐", "切换记录提供可继续验证的网络线索"],
                "conclusion": "投诉现象在等价场景下复现，可将18:07前后的覆盖/干扰与切换作为后续网络侧核查窗口。",
            },
            {
                "title": "正例二：排除终端个体故障",
                "evidence": ["同一商场投诉点和同一测速业务", "用户终端连续三次上行失败", "同型号同版本对照机在相同SIM配置下也失败", "两机均接入同一小区且SINR持续低于0 dB"],
                "reasoning": ["先保持地点和业务一致", "同型号对照机复现，降低单台终端硬件故障可能", "两机网络指标一致，支持场景性无线问题假设"],
                "conclusion": "现有证据更支持该位置的无线质量问题，而非用户单台终端故障；仍需结合小区告警和KPI交叉验证。",
            },
        ],
        "counterexamples": [
            {
                "title": "反例一：换地点、换终端测一次",
                "error": "在大厅用另一型号手机测试正常，地点、终端和服务小区都可能改变，只能说明大厅这台手机当时正常。",
                "correctionPath": ["返回投诉原位置并记录精确站位", "优先使用用户原终端或同型号同配置终端", "按原业务步骤和高发时间窗重复测试"],
            },
            {
                "title": "反例二：只截一张低速率图就判定弱覆盖",
                "error": "测速低可能来自负荷、服务器、终端或无线质量；没有业务步骤、服务小区、RSRP/SINR和重复对照，不能直接归因弱覆盖。",
                "correctionPath": ["补齐测速服务器、业务步骤和时间戳", "同步采集服务小区及无线指标", "重复测试并设置单变量对照后再归因"],
            },
        ],
        "practices": {
            "foundation": [_practice(
                "P1T3-N02-foundation-01",
                "判断四份复测记录是否满足同地点、同业务、同终端，并指出每份缺少的可比条件。",
                ["逐项核对三同条件", "区分未复现与条件不等价"],
                "只有关键条件可比，‘正常/异常’结果才有解释意义。",
                ["画出投诉条件基线", "逐项与复测记录比对", "把不等价结论修正后重试"],
            )],
            "application": [_practice(
                "P1T3-N02-application-01",
                "根据投诉工单设计一份15分钟复测脚本，使业务日志与网络采样能够按时间对齐。",
                ["用户操作步骤", "采样起止时间", "服务小区和无线指标", "现象记录点"],
                "脚本应让另一名工程师按同样步骤得到可比较记录。",
                ["先固定三同条件", "给每一步写时间和采样项", "检查是否能重复执行后重试"],
            )],
            "transfer": [_practice(
                "P1T3-N02-transfer-01",
                "把复现方法迁移到高速列车通话掉线投诉，说明哪些条件必须改用路线和时间段表达。",
                ["相同车次/区段", "相同业务和终端", "沿途服务小区与掉线时刻", "可重复路线"],
                "移动场景不能固定一个坐标，但仍要保持路线、速度、业务和终端可比。",
                ["把地点转换为区段与轨迹", "保持业务终端一致", "统一时间轴并重试"],
            )],
        },
        "transferTask": {
            "scenario": "校园宿舍晚间游戏高时延投诉，白天无法复现，请制定一次高峰期和一次对照时段的复测方案。",
            "deliverable": "投诉条件基线、两时段复测脚本、同步网络采样字段和结论模板。",
            "successCriteria": ["同地点/同业务/同终端明确", "高峰与对照只改变时间变量", "业务与网络证据时间对齐", "未复现时也能说明测试边界"],
        },
        "outputTemplate": {
            "complaintBaseline": "时间、地点、业务、终端、现象、频次",
            "reproductionConditions": "地点证据、业务步骤、终端配置、复测时间窗",
            "businessEvidence": "操作时间轴、结果、失败/卡顿时刻、日志或截图",
            "networkEvidence": "服务小区、RSRP、SINR、频点、切换/重选",
            "comparison": "与投诉条件的相同项、差异项、对照测试",
            "judgement": "已复现/未复现/条件不等价、证据边界、下一步核查",
        },
        "rubric": [
            {"criterion": "投诉事实基线完整", "maxScore": 20},
            {"criterion": "同地点/同业务/同终端条件可证明", "maxScore": 25},
            {"criterion": "业务与网络证据时间对齐", "maxScore": 20},
            {"criterion": "复测步骤可重复", "maxScore": 15},
            {"criterion": "控制变量和对照合理", "maxScore": 10},
            {"criterion": "结论区分结果与证据边界", "maxScore": 10},
        ],
    },
}


STANDARD_NODE_SPECS: dict[str, dict[str, Any]] = {
    "P1T1-N01": {
        "case": "新到海岳路站点时，任务单写有两个机房和三排机柜。采集人员必须先圈定本次站点、机房和机柜边界，避免把共享机房中的其他运营商设备混入台账。",
        "glossary": [("资源边界", "本次任务允许采集的站点、机房、机柜和配套对象范围。"), ("站点编码", "运营商用于唯一识别物理站点的编号。"), ("机柜编号", "机房内定位设备安装位置的柜体标识。")],
        "figureKind": "indoor-boundary",
        "labels": ["任务单站点编码", "机房入口编号", "机柜排号与柜号", "不在本次范围的共享设备"],
        "steps": ["核对任务单中的站点与机房", "用入口标识确认现场身份", "按排号和柜号圈定采集对象"],
        "exampleEvidence": ["任务单HY-01", "入口HY-01/01号机房", "K01—K04柜全景"],
        "conclusion": "本次采集边界为HY-01站01号机房K01—K04柜，其他共享设备不进入台账。",
        "error": "到场后先拍全部设备，回去再猜照片属于哪个机房，导致对象混站。",
        "correction": ["先核对任务单", "补拍入口与柜号全景", "删除无法回到边界的孤立照片"],
        "prompt": "给定任务单和两张机房平面图，圈出本次采集对象并排除共享设备。",
        "practiceEvidence": ["站点/机房编号一致", "柜号范围明确", "排除对象有理由"],
        "feedback": "答案必须先证明现场身份，再圈定柜号范围。",
        "recordFields": ["stationId", "roomId", "cabinetRange", "excludedObjects", "photoIndex"],
    },
    "P1T1-N03": {
        "case": "BBU和AAU均已安装并亮灯，但机房直流电压波动、接地标识缺失且空调告警。仅确认主设备在位不能说明站点具备稳定运行条件。",
        "glossary": [("直流供电", "基站设备常用的-48V直流供电及允许波动范围。"), ("保护接地", "将设备外壳和接地系统连接以降低故障风险。"), ("传输可用性", "业务回传链路容量、端口和告警状态是否满足运行要求。")],
        "figureKind": "operating-conditions",
        "labels": ["直流配电端子", "接地排与线缆", "PTN/光纤端口", "温湿度与空调告警"],
        "steps": ["按安全规程记录供电值", "核对接地与传输状态", "把温控告警与设备状态放到同一时间窗"],
        "exampleEvidence": ["-48.6V读数", "接地线与接地排标签", "PTN端口无告警", "室温26℃"],
        "conclusion": "供电、接地、传输和温控证据齐全，当前运行条件可交付。",
        "error": "只拍设备绿灯就写‘站点运行正常’，没有配套条件证据。",
        "correction": ["补齐供电和接地记录", "核对传输告警", "记录同一时刻温控状态"],
        "prompt": "从六条现场记录中选出能够证明站点运行条件的证据组合。",
        "practiceEvidence": ["供电", "接地", "传输", "温控"],
        "feedback": "四类条件缺一项都只能标记待核验，不能直接判定正常。",
        "recordFields": ["powerReading", "grounding", "transport", "temperature", "alarms"],
    },
    "P1T1-N04": {
        "case": "现场采集结束后共有42张照片、18条设备记录和3项缺口。交付前需要让每条字段都能回到照片、位置和采集时间，并把缺口写入复核结论。",
        "glossary": [("影像索引", "用照片编号关联站点、对象和字段的清单。"), ("可追溯性", "结论可以沿字段、照片和现场对象逐级回查。"), ("缺口清单", "尚未取得的证据、影响和补采动作记录。")],
        "figureKind": "evidence-archive",
        "labels": ["对象主键", "字段记录", "照片编号", "采集时间", "缺口与复核结论"],
        "steps": ["统一照片与对象编号", "核对字段—照片一一对应", "汇总缺口并形成交付结论"],
        "exampleEvidence": ["K02-BBU01对象记录", "IMG-021铭牌照片", "IMG-024双端端口照片", "缺口GAP-03"],
        "conclusion": "对象、证据和缺口均可追溯，可形成室内设备与链路证据表。",
        "error": "结论只写‘现场正常，照片见附件’，无法知道哪张照片证明哪个字段。",
        "correction": ["建立对象主键", "逐字段绑定照片", "给缺口分配补采责任和时限"],
        "prompt": "修复一份照片编号重复、字段无来源的归档表。",
        "practiceEvidence": ["对象唯一", "照片可回查", "缺口有动作"],
        "feedback": "归档不是堆附件，而是让对象、字段、照片和结论互相索引。",
        "recordFields": ["objectId", "fieldName", "value", "photoIds", "gap", "reviewConclusion"],
    },
    "P1T2-N01": {
        "case": "室外采集范围同时包含站点、三个扇区、主干道、校园热点和邻区边界。若只拍站点外观，后续无法把覆盖风险放回具体空间。",
        "glossary": [("扇区", "基站按方向划分的无线覆盖单元。"), ("业务热点", "用户或业务活动密集、需要重点验证的空间区域。"), ("邻区边界", "服务小区与相邻小区可能切换或重选的空间范围。")],
        "figureKind": "outdoor-boundary",
        "labels": ["站点坐标", "扇区方向", "道路与热点", "邻区边界", "采样范围"],
        "steps": ["定位站点和扇区", "把道路热点落到底图", "圈定邻区和采样边界"],
        "exampleEvidence": ["站点坐标", "三扇区标签和方向", "道路/校园热点图层"],
        "conclusion": "站点、扇区、热点和邻区使用同一坐标口径，室外采集边界明确。",
        "error": "只拍铁塔全景，没有方向、坐标和道路关系。",
        "correction": ["补录站点坐标", "标注扇区方向", "把道路热点和邻区叠加到底图"],
        "prompt": "在底图上标出三个扇区、两类热点和本次采样边界。",
        "practiceEvidence": ["坐标一致", "方向明确", "热点和邻区可见"],
        "feedback": "空间边界必须能指导下一步到哪里采、采哪个扇区。",
        "recordFields": ["siteCoordinate", "sectorIds", "hotspots", "neighborBoundary", "surveyExtent"],
    },
    "P1T2-N03": {
        "case": "扇区东南侧有一栋高楼，现场人员怀疑它造成弱覆盖。单张楼体照片只是观察，必须把遮挡方向、坐标、道路热点和后续采样点组合成可验证假设。",
        "glossary": [("遮挡体", "可能阻断或衰减无线传播的建筑、地形或植被。"), ("风险假设", "可通过后续采样验证的覆盖原因判断。"), ("对照点", "与风险点条件接近但不受目标因素影响的比较位置。")],
        "figureKind": "obstacle-evidence",
        "labels": ["扇区主瓣方向", "遮挡体坐标与高度", "业务热点", "风险采样点", "对照采样点"],
        "steps": ["标注热点和主瓣", "记录遮挡方向与坐标", "布置风险点和对照点"],
        "exampleEvidence": ["扇区方位角121°", "高楼方向124°", "楼后热点H2", "遮挡两侧采样点"],
        "conclusion": "高楼处于扇区主瓣与热点之间，形成需要通过两侧采样验证的遮挡假设。",
        "error": "看到楼体就直接写‘存在弱覆盖’，没有扇区、热点和采样证据。",
        "correction": ["补齐扇区方向", "标注遮挡与热点坐标", "设置风险点和对照点"],
        "prompt": "判断三张遮挡照片中哪一张足以支持可验证的风险假设。",
        "practiceEvidence": ["方向关系", "空间位置", "验证采样点"],
        "feedback": "风险结论必须能转成下一步采样动作，而不是停留在目测。",
        "recordFields": ["sectorDirection", "obstacle", "hotspot", "riskPoints", "controlPoints", "hypothesis"],
    },
    "P1T2-N04": {
        "case": "完成站点、姿态和遮挡采集后，需要把风险假设转成DT/CQT路线。路线既要穿过风险边界，也要保留对照点、时间窗和判断指标。",
        "glossary": [("DT", "沿规划路线连续采集无线和业务数据的路测。"), ("CQT", "在固定重点位置执行可重复业务测试。"), ("风险图层", "汇总扇区、遮挡、热点和待验证区域的空间图层。")],
        "figureKind": "coverage-route",
        "labels": ["风险区域", "路线进入/离开点", "热点CQT点", "遮挡两侧对照点", "指标与时间窗"],
        "steps": ["汇总空间证据", "布置风险与对照采样点", "输出路线、时间窗和判断指标"],
        "exampleEvidence": ["风险图层R-02", "穿越遮挡边界的DT路线", "H2热点CQT点", "RSRP/SINR/吞吐指标"],
        "conclusion": "路线能够验证遮挡假设并形成室外站点与覆盖采集表。",
        "error": "沿最方便的道路测试，没有经过风险区也没有对照点。",
        "correction": ["让路线穿过风险边界", "增加热点和对照点", "写明时间窗与判断指标"],
        "prompt": "从三条候选路线中选择能验证风险假设的一条并补齐CQT点。",
        "practiceEvidence": ["穿越风险区", "包含对照点", "指标可判定"],
        "feedback": "测试路线由风险问题驱动，而不是由道路便利性驱动。",
        "recordFields": ["riskLayer", "dtRoute", "cqtPoints", "timeWindow", "metrics", "acceptanceRule"],
    },
    "P1T3-N01": {
        "case": "工单只写‘用户反映网络很差’。受理人员需要把口述拆成可复测事实：何时、何地、做什么业务、使用什么终端、出现什么现象以及发生频次。",
        "glossary": [("投诉事实", "不含原因猜测、可以核对的时间地点业务终端和现象。"), ("复测边界", "后续复现必须覆盖的地点、时间和业务条件。"), ("频次", "现象在给定次数或时间窗内出现的比例。")],
        "figureKind": "complaint-facts",
        "labels": ["时间窗", "精确地点", "业务动作", "终端信息", "现象与频次"],
        "steps": ["读取工单原话", "拆分事实字段并追问缺项", "确认可执行的复测边界"],
        "exampleEvidence": ["工作日18:00—19:00", "A座18层会议室", "视频会议入会10分钟", "X60终端5G模式", "5次中4次卡顿"],
        "conclusion": "投诉已转换为可按条件重复执行的事实清单。",
        "error": "把‘网络差’直接改写成‘弱覆盖’，混入未经验证的原因。",
        "correction": ["删除原因判断", "补齐六类事实字段", "让用户确认复测条件"],
        "prompt": "把一段用户口述拆成事实字段，标出仍需追问的缺项。",
        "practiceEvidence": ["事实无归因", "六字段完整", "复测边界明确"],
        "feedback": "先把现象说清楚，原因判断必须留到证据交叉之后。",
        "recordFields": ["timeWindow", "location", "service", "terminal", "symptom", "frequency", "missingFacts"],
    },
    "P1T3-N03": {
        "case": "等价场景下出现一次低速率，但同一时间小区没有告警。调查人员需要把投诉、复测日志、告警、KPI、工参和覆盖图层按同一时间与空间口径交叉，而不是用单条日志直接定因。",
        "glossary": [("证据交叉", "使用两个以上独立来源相互支持或否定同一判断。"), ("时间窗对齐", "不同系统证据覆盖同一现象发生时段。"), ("冲突线索", "与当前根因假设不一致、需要解释或复核的证据。")],
        "figureKind": "complaint-evidence",
        "labels": ["投诉与业务日志", "服务小区与无线指标", "告警/KPI", "工参与覆盖图", "支持和冲突线索"],
        "steps": ["对齐时间和空间", "关联终端侧与网络侧证据", "解释冲突并保留备选假设"],
        "exampleEvidence": ["18:07卡顿日志", "同秒SINR -3 dB", "服务小区拥塞KPI升高", "工参和覆盖图一致"],
        "conclusion": "业务现象与无线质量及拥塞KPI同窗出现，支持网络侧容量/干扰联合假设。",
        "error": "看到一次低速率就写‘弱覆盖’，忽略SINR、负荷和服务器因素。",
        "correction": ["对齐现象时刻", "至少加入一类网络侧证据", "记录不支持当前假设的线索"],
        "prompt": "把六条不同时间的证据放到统一时间轴，选出能够支持同一判断的组合。",
        "practiceEvidence": ["时间同窗", "对象同小区", "至少两个独立来源", "冲突被记录"],
        "feedback": "交叉验证既要找支持证据，也要主动寻找会推翻结论的线索。",
        "recordFields": ["timeWindow", "location", "servingCell", "terminalEvidence", "networkEvidence", "conflicts", "hypotheses"],
    },
    "P1T3-N04": {
        "case": "投诉调查结束后不能只写‘建议优化’。调查单需要说明事实、证据、根因假设、责任边界、处理动作、时限、复测条件和回访结果，才能派单和闭环。",
        "glossary": [("责任边界", "根据证据明确网络、终端、业务平台或物业等责任范围。"), ("闭环条件", "处理完成后用于判断问题是否解决的复测与回访标准。"), ("置信边界", "结论被现有证据支持的程度以及仍未排除的不确定性。")],
        "figureKind": "complaint-closure",
        "labels": ["事实与证据", "根因假设", "责任人与时限", "处理动作", "复测与回访"],
        "steps": ["分层归因并标注证据", "形成责任和处理动作", "安排复测回访并定义闭环"],
        "exampleEvidence": ["等价复测记录", "网络侧KPI与告警", "处理工单及责任人", "同条件复测和用户回访"],
        "conclusion": "投诉信息调查单具备派单、复核和关闭条件。",
        "error": "工单只写‘建议优化’，没有证据、责任人、时限和复测标准。",
        "correction": ["补齐事实和证据链", "明确动作责任与时限", "写出同条件复测和回访标准"],
        "prompt": "把一条模糊处理建议改写成可派单、可验收的投诉闭环记录。",
        "practiceEvidence": ["证据支撑", "责任动作明确", "闭环可验收"],
        "feedback": "专业结论必须回答为什么这样判断、谁做什么、何时以及怎样确认完成。",
        "recordFields": ["facts", "evidenceChain", "rootCauseHypothesis", "owner", "action", "deadline", "retest", "callback", "closureStatus"],
    },
}


def _build_standard_self_study(node_id: str) -> dict[str, Any]:
    spec = STANDARD_NODE_SPECS[node_id]
    return {
        "kind": "standard",
        "nodeId": node_id,
        "caseBackground": [spec["case"]],
        "glossary": [
            {"term": term, "definition": definition}
            for term, definition in spec["glossary"]
        ],
        "relationshipFigure": {
            "kind": spec["figureKind"],
            "evidenceLabels": spec["labels"],
        },
        "reasoningSteps": spec["steps"],
        "example": {
            "evidence": spec["exampleEvidence"],
            "conclusion": spec["conclusion"],
        },
        "counterexample": {
            "error": spec["error"],
            "correctionPath": spec["correction"],
        },
        "microPractice": [_practice(
            f"{node_id}-micro-01",
            spec["prompt"],
            spec["practiceEvidence"],
            spec["feedback"],
            spec["correction"],
        )],
        "nodeRecordTemplate": {
            field_name: ""
            for field_name in spec["recordFields"]
        },
    }


def _self_study_content(node_id: str) -> dict[str, Any]:
    if node_id in DEEP_SELF_STUDY:
        return DEEP_SELF_STUDY[node_id]
    return _build_standard_self_study(node_id)


def build_p1_demo_content(
    source_artifacts: dict[str, dict[str, Any]],
    widget_manifest: dict[str, Any],
    media_manifest: dict[str, str],
    *,
    source_media_fallback: dict[str, set[str]] | None = None,
) -> dict[str, Any]:
    widget_projects = _dict_value(widget_manifest.get("projects"), "widget manifest projects")
    stable_extracted_media = {str(url) for url in media_manifest.values()}
    for refs in (source_media_fallback or {}).values():
        stable_extracted_media.update(refs)
    tasks: list[dict[str, Any]] = []
    for task_spec in P1_TASK_STRUCTURE:
        task_id = str(task_spec["taskId"])
        runtime_task_id = str(task_spec["runtimeTaskId"])
        artifact = _dict_value(source_artifacts.get(task_id), f"{task_id} source artifact")
        lesson_ast = _dict_value(artifact.get("lessonAst"), f"{task_id} lesson AST")
        lesson = _dict_value(lesson_ast.get("lesson"), f"{task_id} lesson")
        source = _dict_value(lesson_ast.get("source"), f"{task_id} lesson source")
        storyboard = _dict_value(artifact.get("storyboard"), f"{task_id} storyboard")
        source_units = _list_value(storyboard.get("knowledgeUnits"), f"{task_id} storyboard knowledge units")
        selected_units = [source_units[index] for index in task_spec["sourceUnitIndexes"]]
        normalized_storyboard = _dict_value(
            _dict_value(lesson_ast.get("content"), f"{task_id} lesson content").get("storyboard"),
            f"{task_id} normalized storyboard",
        )

        if lesson.get("id") != task_id or storyboard.get("pageId") != task_id:
            raise ValueError(f"{task_id} source artifacts have mismatched identities")
        if normalized_storyboard.get("schema") != storyboard.get("schema"):
            raise ValueError(f"{task_id} lesson AST and storyboard schemas disagree")

        widgets = [_dict_value(item, f"{task_id} widget") for item in _list_value(artifact.get("widgets"), f"{task_id} widgets")]
        widgets_by_id = {str(widget.get("id")): widget for widget in widgets}
        widget_ids = [str(item) for item in _list_value(widget_projects.get(task_id), f"{task_id} widget manifest")]
        widget_refs: list[dict[str, str]] = []
        media_refs: set[str] = set(P1_VERIFIED_MANIM_MEDIA[task_id])
        _collect_media_refs(storyboard, media_refs)
        verified_task_media = (source_media_fallback or {}).get(task_id, set())
        media_refs = {
            media_ref
            for media_ref in media_refs
            if not media_ref.startswith("/media/5g/") or media_ref in verified_task_media
        }
        media_refs.update(verified_task_media)
        for widget_id in widget_ids:
            widget = widgets_by_id.get(widget_id)
            if widget is None:
                raise ValueError(f"{task_id} widget manifest references missing widget {widget_id}")
            widget_refs.append({
                "id": widget_id,
                "path": f"textbook/5g/widgets/{widget_id}.json",
            })
            _collect_media_refs(widget, media_refs)

        media_refs = {
            media_ref
            for media_ref in media_refs
            if not media_ref.startswith("/media/5g/") or media_ref in verified_task_media
        }

        for media_ref in media_refs:
            if media_ref.startswith("/media/5g/") and media_ref not in stable_extracted_media:
                raise ValueError(f"{task_id} references media outside the current import manifest: {media_ref}")
        if not widget_refs or not media_refs:
            raise ValueError(f"{task_id} must retain stable widget and media references")

        output_title = str(task_spec["taskOutputTitle"])
        nodes: list[dict[str, Any]] = []
        for node_index, source_unit_value in enumerate(selected_units, start=1):
            source_unit = _dict_value(source_unit_value, f"{task_id} source unit {node_index}")
            is_node_test = node_index == 2
            is_task_end = node_index == 4
            node_id = f"{runtime_task_id}-N0{node_index}"
            node = {
                "id": node_id,
                "title": _non_empty_text(source_unit.get("title"), f"{task_id} source unit title"),
                "goal": _non_empty_text(source_unit.get("shortText"), f"{task_id} source unit goal"),
                "sourceKnowledgeUnitId": _non_empty_text(source_unit.get("id"), f"{task_id} source unit ID"),
                "assessmentRole": "node-test" if is_node_test else "none",
                "requiresFormalTest": is_node_test,
                "requiresProfessionalOutput": is_task_end,
                "requiresTeacherVerification": is_task_end,
                "selfStudy": _self_study_content(node_id),
            }
            if is_node_test:
                node["formalPassScore"] = 80
            if is_task_end:
                node["professionalOutputTitle"] = output_title
            nodes.append(node)
        task = {
            "taskId": task_id,
            "runtimeTaskId": runtime_task_id,
            "title": _non_empty_text(lesson.get("title"), f"{task_id} lesson title"),
            "why": str(task_spec["why"]),
            "taskOutputTitle": output_title,
            "source": {
                "lessonAstId": str(lesson["id"]),
                "lessonAstPath": f"textbook/5g/generated/lesson-ast/{task_id}.json",
                "sourceDocumentPath": _non_empty_text(source.get("path"), f"{task_id} source document"),
                "storyboardSchema": _non_empty_text(storyboard.get("schema"), f"{task_id} storyboard schema"),
                "knowledgeUnitRefs": [str(unit["id"]) for unit in selected_units],
                "widgetRefs": widget_refs,
                "mediaRefs": sorted(media_refs),
            },
            "nodes": nodes,
        }
        if "prerequisiteTaskId" in task_spec:
            task["prerequisiteTaskId"] = str(task_spec["prerequisiteTaskId"])
        tasks.append(task)

    return {
        "schema": SCHEMA_ID,
        "project": {
            "id": "P1",
            "title": "5G网络信息采集",
            "finalOutput": "5G网络信息采集成果包",
        },
        "tasks": tasks,
    }


def write_p1_demo_content(
    root: Path,
    output_path: Path,
    *,
    source_artifacts: dict[str, dict[str, Any]],
    widget_manifest: dict[str, Any],
    media_manifest: dict[str, str],
) -> dict[str, Any]:
    schema_path = root / "schemas" / "p1-demo-content" / "v1.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)

    for task_id, media_refs in P1_VERIFIED_MANIM_MEDIA.items():
        for media_ref in media_refs:
            media_path = root / "apps/web/public" / media_ref.removeprefix("/")
            if not media_path.is_file():
                raise ValueError(f"{task_id} verified media is unavailable: {media_ref}")

    content = build_p1_demo_content(
        source_artifacts,
        widget_manifest,
        media_manifest,
        source_media_fallback=_source_owned_runtime_media_refs(root, source_artifacts),
    )
    errors = sorted(
        Draft202012Validator(schema).iter_errors(content),
        key=lambda error: tuple(str(part) for part in error.absolute_path),
    )
    if errors:
        details = "; ".join(
            f"{'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}"
            for error in errors
        )
        raise ValueError(f"P1 demo content does not match {SCHEMA_ID}: {details}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    written_content = json.loads(output_path.read_text(encoding="utf-8"))
    if written_content != content:
        raise RuntimeError("generated P1 demo content differs from the validated builder output")
    return content


def _dict_value(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _list_value(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be an array")
    return value


def _non_empty_text(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} must be non-empty")
    return text


def _collect_media_refs(value: Any, refs: set[str]) -> None:
    if isinstance(value, str) and value.startswith("/media/"):
        refs.add(value)
    elif isinstance(value, list):
        for item in value:
            _collect_media_refs(item, refs)
    elif isinstance(value, dict):
        for item in value.values():
            _collect_media_refs(item, refs)


def _source_owned_runtime_media_refs(
    root: Path,
    source_artifacts: dict[str, dict[str, Any]],
) -> dict[str, set[str]]:
    runtime_root = root / "apps/web/public/media/5g"
    if not runtime_root.is_dir():
        return {}
    available_names = {path.name for path in runtime_root.iterdir() if path.is_file()}
    relationships_by_source: dict[Path, dict[str, str]] = {}
    fallback: dict[str, set[str]] = {}
    resolved_root = root.resolve()

    for task_id, artifact_value in source_artifacts.items():
        artifact = _dict_value(artifact_value, f"{task_id} source artifact")
        lesson_ast = _dict_value(artifact.get("lessonAst"), f"{task_id} lesson AST")
        source = _dict_value(lesson_ast.get("source"), f"{task_id} lesson source")
        source_path = (root / _non_empty_text(source.get("path"), f"{task_id} source path")).resolve()
        try:
            source_path.relative_to(resolved_root)
        except ValueError as error:
            raise ValueError(f"{task_id} source document escapes the repository root") from error
        relationships = relationships_by_source.get(source_path)
        if relationships is None:
            relationships = _docx_media_relationships(source_path)
            relationships_by_source[source_path] = relationships

        content = _dict_value(lesson_ast.get("content"), f"{task_id} lesson content")
        blocks = _list_value(content.get("blocks"), f"{task_id} lesson blocks")
        refs: set[str] = set()
        for block_value in blocks:
            block = _dict_value(block_value, f"{task_id} lesson block")
            for relationship_id in block.get("mediaRefs", []):
                target = relationships.get(str(relationship_id))
                if target is None:
                    raise ValueError(f"{task_id} references unknown DOCX media relationship {relationship_id}")
                target_path = PurePosixPath(target)
                if target_path.is_absolute() or ".." in target_path.parts or "\\" in target:
                    raise ValueError(f"{task_id} references unsafe DOCX media target {target}")
                if len(target_path.parts) != 2 or target_path.parts[0] != "media":
                    raise ValueError(f"{task_id} references non-media DOCX target {target}")
                if target_path.name in available_names:
                    refs.add(f"/media/5g/{target_path.name}")
        fallback[task_id] = refs
    return fallback


def _docx_media_relationships(source_path: Path) -> dict[str, str]:
    with ZipFile(source_path) as archive:
        relationships_xml = archive.read("word/_rels/document.xml.rels")
    relationships_root = ET.fromstring(relationships_xml)
    return {
        relationship_id: target
        for relationship in relationships_root
        if (relationship_id := relationship.attrib.get("Id"))
        and (target := relationship.attrib.get("Target"))
    }
