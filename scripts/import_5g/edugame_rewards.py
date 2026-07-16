"""Reward labels for generated 5G EduGame challenges."""
from __future__ import annotations

BADGES_BY_TEMPLATE: dict[str, list[str]] = {
    "device-connect": ["连线闭合", "接口准确", "采集就绪", "零误接"],
    "evidence-chain": ["证据闭环", "抗干扰命中", "限时达标", "复盘清晰"],
    "route-runner": ["路线成形", "点位命中", "采样连续", "复测可用"],
    "kpi-guard": ["阈值守住", "趋势识别", "多证交叉", "结论稳健"],
    "match-3": ["分类成链", "三连命中", "口径清晰", "复盘完成"],
    "risk-gate": ["风险拦截", "回退可控", "变更合规", "闸门通过"],
    "card-flow": ["流程成链", "动作有序", "复测闭环", "归档完整"],
    "signaling-order": ["阶段归位", "网元协同", "消息有序", "断点清晰"],
    "fault-hunt": ["根因命中", "现象排除", "链路追踪", "优化闭合"],
    "boss-review": ["风险守线", "连续命中", "高压达标", "值守完成"],
}


def badges_for_template(template_id: str) -> list[str]:
    return BADGES_BY_TEMPLATE.get(template_id, BADGES_BY_TEMPLATE["evidence-chain"])
