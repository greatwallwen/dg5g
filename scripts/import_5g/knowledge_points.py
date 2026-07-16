"""Knowledge-point extraction for 5G lesson structure."""

from __future__ import annotations

import re
from typing import Any


SHELL_TITLES = {
    "任务总览",
    "项目概述",
    "项目导学",
    "任务导入",
    "任务要求",
    "知识准备",
    "任务实施",
    "随堂测试",
    "直击难点",
    "重点难点",
    "任务测评",
    "经典案例",
    "网优趣味课堂",
}

GENERIC_FALLBACKS = [
    {"label": "对象", "description": "先明确分析对象、现场范围、数据来源和输出口径。"},
    {"label": "采集", "description": "按测试计划采集日志、指标、图层、表格和现场证据。"},
    {"label": "指标", "description": "把覆盖、质量、接入、切换和业务体验放到同一条证据链上判断。"},
    {"label": "定位", "description": "沿着现象、数据、原因和责任边界逐层缩小问题范围。"},
    {"label": "处置", "description": "按硬件、软件、参数、协调和现场条件选择处理动作。"},
    {"label": "复测", "description": "用复测数据验证结论，并沉淀问题清单和报告。"},
]

SCENARIO_STEPS = {
    "dtcqt": [
        ("DT/CQT", "DT 是车载连续路测，CQT 是重点区域呼叫质量测试，两者共同验证覆盖、接入、保持和业务体验。"),
        ("准备", "准备基站规划、邻区、FTP、电子地图、测试终端、GPS、扫频仪、车辆和测试模板。"),
        ("路线", "DT 按道路连续覆盖规划路线，CQT 按重点室内外区域、热点场景和客户要求布点。"),
        ("采集", "按脚本采集 GPS、LOG、业务指标和异常事件，保证时间、位置和业务动作可回放。"),
        ("指标", "重点观察 RSRP、SINR、RSSI、切换、接入、吞吐量和掉线等指标。"),
        ("复测", "输出问题点、原因判断、优化建议和复测证据，形成测试闭环。"),
    ],
    "test-issues": [
        ("硬件", "先排查 GPS、终端、扫频仪、逆变器、USB 端口、电源和线缆等硬件链路。"),
        ("GPS", "GPS 无打点或丢点时，检查端口、驱动、线缆、天线位置和替换验证。"),
        ("终端", "终端异常时先确认开机、拨测、信号一致性、驱动和电脑端口。"),
        ("软件", "软件异常重点看 license、密钥、设备连接、驱动、存储空间和重装验证。"),
        ("协调", "现场受阻时按客户接口、入场许可、车辆设备和责任人链路及时反馈。"),
        ("闭环", "把问题现象、排查动作、责任人、处置结果和复测结论记录成清单。"),
    ],
    "test-analysis": [
        ("LOG", "把测试 LOG、IE、事件和信令导入分析软件，统一数据口径后再判断。"),
        ("PCI", "PCI 用于无线侧小区标识，重点避免相邻小区冲突和复用层数不足。"),
        ("RSRP", "SS-RSRP 反映同步参考信号功率，是判断覆盖强弱的核心指标。"),
        ("SINR", "SS-SINR 反映信号与干扰噪声关系，直接影响解调、CQI 和速率。"),
        ("覆盖", "弱覆盖、越区覆盖、重复覆盖要结合站点、工参、功率、天线和邻区定位。"),
        ("报告", "按覆盖、质量、切换、吞吐量和异常原因输出分析报告与优化建议。"),
    ],
    "signaling": [
        ("RRC", "先看 UE 与 gNB 之间的 RRC 建立、重配或恢复，确认无线接入是否成立。"),
        ("注册", "再看 UE 经 AMF 完成注册、鉴权、安全和移动性管理。"),
        ("会话", "SMF 控制 UPF 建立 PDU Session 和 QoS 规则，形成业务承载。"),
        ("定时器", "用超时点、失败原因值和消息方向判断异常发生在哪一段。"),
        ("证据", "把 RRC、NAS、N2/N3、KPI 和日志时间线对齐，避免单点判断。"),
        ("闭环", "输出异常节点、根因假设、处置动作和复测依据。"),
    ],
}


def build_knowledge_steps(task: Any, sections: list[dict[str, Any]], project_title: str, limit: int = 6) -> list[dict[str, str]]:
    task_title = str(getattr(task, "title", ""))
    text = collect_task_text(task, sections, project_title)
    scenario = infer_scenario(text, task_title)
    seeds = SCENARIO_STEPS.get(scenario, [])
    candidates = [make_step(label, desc) for label, desc in seeds]
    candidates.extend(extract_heading_candidates(text))
    candidates.extend(extract_keyword_candidates(text))
    candidates.extend(GENERIC_FALLBACKS)
    return dedupe_steps(candidates, limit)


def collect_task_text(task: Any, sections: list[dict[str, Any]], project_title: str) -> str:
    parts = [project_title, getattr(task, "title", "")]
    for block in getattr(task, "blocks", []):
        if getattr(block, "kind", "") == "p":
            parts.append(str(getattr(block, "text", "")))
        elif getattr(block, "kind", "") == "table":
            rows = getattr(block, "rows", [])
            parts.extend(" ".join(map(str, row)) for row in rows[:6])
    for section in sections:
        parts.append(str(section.get("title", "")))
        parts.extend(str(item) for item in section.get("texts", []))
    return normalize_space(" ".join(parts))


def infer_scenario(text: str, task_title: str = "") -> str:
    if "信令" in task_title:
        return "signaling"
    if "问题处理" in task_title:
        return "test-issues"
    if "数据分析" in task_title or "LOG" in task_title:
        return "test-analysis"
    if "DT/CQT" in task_title or "路测" in task_title:
        return "dtcqt"
    if "关键信令" in text or "信令流程" in text:
        return "signaling"
    if "DT/CQT" in text or "CQT测试" in text:
        return "dtcqt"
    if "GPS" in text and ("软件" in text or "硬件" in text or "协调" in text):
        return "test-issues"
    if "测试LOG" in text or "SS-RSRP" in text or "SS-SINR" in text or "PCI" in text:
        return "test-analysis"
    if "路测" in text and "路线" in text:
        return "dtcqt"
    if "信令" in text or "RRC" in text and "NAS" in text:
        return "signaling"
    return "generic"


def extract_heading_candidates(text: str) -> list[dict[str, str]]:
    patterns = [
        r"一、([^。；\n]{2,28})",
        r"二、([^。；\n]{2,28})",
        r"三、([^。；\n]{2,28})",
        r"四、([^。；\n]{2,28})",
        r"（[一二三四五六七八九十]）([^。；\n]{2,28})",
        r"\([0-9]+\)([^。；\n]{2,28})",
    ]
    steps: list[dict[str, str]] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            title = cleanup_title(match.group(1))
            if not usable_title(title):
                continue
            steps.append(make_step(short_label(title), sentence_around(text, title)))
    return steps


def extract_keyword_candidates(text: str) -> list[dict[str, str]]:
    specs = [
        ("DT", ["DT", "DriverTest", "路测"], "DT 是沿道路连续移动采样，用于发现覆盖、质量、切换和业务体验问题。"),
        ("CQT", ["CQT", "CallQualityTest", "呼叫质量"], "CQT 面向重点区域定点测试，用接通、掉话和业务质量验证用户体验。"),
        ("路线", ["路线", "道路", "图层", "mapinfor"], "路线规划要覆盖道路、重点区域、重叠区和客户要求的测试范围。"),
        ("GPS", ["GPS", "打点", "经纬度"], "GPS 负责给测试日志绑定位置，是问题点回放和地图呈现的基础。"),
        ("RSRP", ["RSRP", "SS-RSRP", "-110dBm"], "RSRP 用于判断覆盖强度，弱覆盖会影响接入、保持和业务体验。"),
        ("SINR", ["SINR", "SS-SINR", "干扰"], "SINR 用于判断信道质量和干扰水平，直接影响解调和吞吐量。"),
        ("切换", ["切换", "A3", "事件"], "切换分析要同时看服务小区、邻区、事件触发、执行结果和失败点。"),
        ("吞吐", ["吞吐量", "CQI", "MCS"], "吞吐量受 SINR、CQI、MCS、调度、带宽和终端能力共同影响。"),
        ("告警", ["告警", "退服", "射频单元"], "覆盖或业务异常要结合后台告警确认站点、射频和传输状态。"),
        ("报告", ["报告", "输出", "复测"], "最终输出问题清单、优化建议、复测结果和可追溯证据。"),
    ]
    steps: list[dict[str, str]] = []
    for label, terms, desc in specs:
        if any(term in text for term in terms):
            steps.append(make_step(label, sentence_around(text, terms[0]) or desc))
    return steps


def evidence_score(text: str, label: str, desc: str) -> int:
    score = 0
    for token in {label, *re.findall(r"[A-Za-z0-9-]{2,}|[\u4e00-\u9fff]{2,}", desc)}:
        if token and token in text:
            score += 1
    return score


def make_step(label: str, description: str) -> dict[str, str]:
    return {"label": normalize_space(label)[:10], "description": normalize_space(description)[:140]}


def dedupe_steps(steps: list[dict[str, str]], limit: int) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    seen: set[str] = set()
    for step in steps:
        label = cleanup_title(step.get("label", ""))
        if not usable_title(label):
            continue
        key = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", "", label).lower()
        if key in seen:
            continue
        seen.add(key)
        output.append({"label": label, "description": step.get("description", label)})
        if len(output) >= limit:
            return output
    return output


def usable_title(title: str) -> bool:
    title = cleanup_title(title)
    if not title or title in SHELL_TITLES:
        return False
    if len(title) > 18:
        return False
    return not any(shell in title for shell in SHELL_TITLES)


def cleanup_title(value: str) -> str:
    return normalize_space(value).strip("：:，。；、, .")


def short_label(value: str) -> str:
    value = cleanup_title(value)
    aliases = [
        ("DT/CQT", "DT/CQT"),
        ("SS-RSRP", "RSRP"),
        ("SS-SINR", "SINR"),
        ("测试软件", "软件"),
        ("测试终端", "终端"),
        ("测试数据", "数据"),
        ("测试路线", "路线"),
        ("弱覆盖", "弱覆盖"),
        ("覆盖", "覆盖"),
        ("吞吐量", "吞吐"),
    ]
    for needle, label in aliases:
        if needle in value:
            return label
    return value[:6]


def sentence_around(text: str, needle: str) -> str:
    if not needle:
        return ""
    index = text.find(needle)
    if index < 0:
        return ""
    start = max(text.rfind("。", 0, index), text.rfind("；", 0, index), text.rfind("：", 0, index))
    end_candidates = [pos for pos in [text.find("。", index), text.find("；", index)] if pos >= 0]
    end = min(end_candidates) if end_candidates else min(len(text), index + 120)
    return normalize_space(text[start + 1:end + 1])


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
