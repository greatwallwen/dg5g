from __future__ import annotations

from typing import Any, Callable

from .knowledge_template_data import PROJECT_PLANS, PROJECT_TEMPLATE_MAP, TEMPLATE_LAYOUTS

MakeAction = Callable[..., dict[str, Any]]


ACTION_STAGE_DURATION_MS = 610_000
ACTION_RELATIONS = ("process", "dependency", "data-flow", "cause", "feedback")
SCENARIO_FOCUS_TARGETS = {
    "site-survey": {1: "site-panel", 2: "site-panel", 3: "rack-panel", 4: "support-2", 5: "form-panel", 6: "evidence-table"},
    "drive-test": {1: "dt-field", 2: "hub", 3: "road-1", 4: "evidence-table", 5: "metric-chart", 6: "caption-text"},
    "kpi": {1: "dashboard", 2: "dashboard", 3: "dashboard", 4: "dashboard", 5: "evidence-table", 6: "metric-chart"},
    "signaling": {1: "actor-0", 2: "actor-1", 3: "actor-2", 4: "actor-3", 5: "evidence-table", 6: "metric-chart"},
}

TEMPLATE_FOCUS_TARGETS = {
    "site-survey": {1: "site-panel", 2: "site-panel", 3: "rack-panel", 4: "rack-panel", 5: "form-panel", 6: "evidence-table"},
    "dt-cqt-concept": {1: "dt-field", 2: "hub", 3: "road-1", 4: "evidence-table", 5: "metric-chart", 6: "caption-text"},
    "test-process": {1: "step-01", 2: "step-02", 3: "step-03", 4: "step-04", 5: "evidence-table", 6: "metric-chart"},
    "kpi-diagnosis": {1: "step-01", 2: "step-02", 3: "step-03", 4: "dashboard", 5: "evidence-table", 6: "metric-chart"},
    "optimization-loop": {1: "step-01", 2: "step-02", 3: "loop-core", 4: "step-04", 5: "evidence-table", 6: "metric-chart"},
    "signaling-ladder": {1: "actor-0", 2: "actor-1", 3: "actor-2", 4: "actor-3", 5: "evidence-table", 6: "metric-chart"},
}



DEFAULT_PHASES = [
    {"label": "准备", "target": "step-01", "effect": "draw", "suffix": "line-2", "text": "先把输入对象、工具和记录口径摆到同一张图里。"},
    {"label": "定位", "target": "step-02", "effect": "flow", "suffix": "line-3", "text": "再沿流程定位关键证据，避免只看孤立证据图或单个指标。"},
    {"label": "设备", "target": "step-03", "effect": "packetMove", "suffix": "line-4", "text": "随后检查设备、配置和采样链路，让图形中的数据流动起来。"},
    {"label": "证据", "target": "step-04", "effect": "cameraZoom", "suffix": "top-band", "text": "接着收拢表格、照片、日志和指标，形成可以复核的证据。"},
    {"label": "闭环", "target": "step-final", "effect": "captionUpdate", "suffix": "caption-text", "text": "最后输出判断、动作和复测结论，完成一次工程闭环。"},
]

PHASES_BY_SCENARIO = {
    "site-survey": [
        {"label": "站址", "target": "step-01", "effect": "draw", "suffix": "line-2", "text": "先确认站址、机房、走线和设备位置，让采集对象在图中落点。"},
        {"label": "环境", "target": "step-02", "effect": "flow", "suffix": "line-3", "text": "再沿室内外环境移动，记录遮挡、供电、传输和接地等约束。"},
        {"label": "设备", "target": "step-03", "effect": "packetMove", "suffix": "line-4", "text": "随后把 AAU、BBU、RRU 等设备与照片证据连起来。"},
        {"label": "表单", "target": "step-04", "effect": "cameraZoom", "suffix": "top-band", "text": "接着核对经纬度、照片、编号和表单字段，保证证据可复核。"},
        {"label": "归档", "target": "step-final", "effect": "captionUpdate", "suffix": "caption-text", "text": "最后沉淀一份可用于规划、测试和优化的现场信息清单。"},
    ],
    "drive-test": [
        {"label": "路线", "target": "step-01", "effect": "draw", "suffix": "line-2", "text": "先区分 DT 的车行路线和 CQT 的定点区域，明确测试覆盖面。"},
        {"label": "脚本", "target": "step-02", "effect": "flow", "suffix": "line-3", "text": "再配置终端、业务脚本、GPS 和日志，让采样过程连续可追踪。"},
        {"label": "采样", "target": "step-03", "effect": "packetMove", "suffix": "line-4", "text": "测试中关注 RSRP、SINR、切换和掉线事件，把异常标到路线。"},
        {"label": "回放", "target": "step-04", "effect": "cameraZoom", "suffix": "top-band", "text": "回放日志时把地图、信令和 KPI 曲线对齐，找到问题发生点。"},
        {"label": "复测", "target": "step-final", "effect": "captionUpdate", "suffix": "caption-text", "text": "整改后按同一路线或同一点位复测，确认指标真正改善。"},
    ],
    "kpi": [
        {"label": "指标", "target": "step-01", "effect": "draw", "suffix": "line-2", "text": "先把 RSRP、SINR、吞吐率和 5QI 放到同一张指标面板里。"},
        {"label": "阈值", "target": "step-02", "effect": "flow", "suffix": "line-3", "text": "再用阈值线区分正常、告警和重点排查区域。"},
        {"label": "趋势", "target": "step-03", "effect": "packetMove", "suffix": "line-4", "text": "观察指标随时间和区域的变化，避免只看一个瞬时数值。"},
        {"label": "归因", "target": "step-04", "effect": "cameraZoom", "suffix": "top-band", "text": "把覆盖、干扰、容量和参数证据叠加起来判断根因。"},
        {"label": "验证", "target": "step-final", "effect": "captionUpdate", "suffix": "caption-text", "text": "最终用优化前后对比说明效果，而不是只描述处理动作。"},
    ],
    "signaling": [
        {"label": "接入", "target": "step-01", "effect": "draw", "suffix": "line-2", "text": "先看 UE 与 gNB 的接入消息，确认无线侧是否顺利建立。"},
        {"label": "注册", "target": "step-02", "effect": "flow", "suffix": "line-3", "text": "再跟踪 AMF 的注册、鉴权和安全流程，定位核心控制面节点。"},
        {"label": "会话", "target": "step-03", "effect": "packetMove", "suffix": "line-4", "text": "随后观察 SMF 与 UPF 的会话建立，确认业务承载路径。"},
        {"label": "异常", "target": "step-04", "effect": "cameraZoom", "suffix": "top-band", "text": "异常定位时按消息方向、定时器和失败码逐层收敛。"},
        {"label": "闭环", "target": "step-final", "effect": "captionUpdate", "suffix": "caption-text", "text": "最后把失败节点、证据和建议动作整理成可复测结论。"},
    ],
}


def _legacy_animation_playback_actions(project_id: str, widget_id: str, make_action: MakeAction, scenario: str = "") -> list[dict[str, Any]]:
    phases = animation_phases_for_project(project_id, scenario)
    actions = [
        make_action(project_id, "animation", 1, "widget_highlight", title="查看核心图", widgetId=widget_id, target=widget_id),
        make_action(
            project_id,
            "animation",
            2,
            "widget_setState",
            title="回到起点",
            widgetId=widget_id,
            state={"activeStep": 0, "currentTimeMs": 0},
        ),
    ]
    for phase, item in enumerate(phases, start=1):
        target = focus_target_for_phase(project_id, scenario, phase, item["target"])
        cue_target = f"{project_id}-line-{phase}"
        if phase > 1:
            actions.append(make_action(
                project_id,
                "animation",
                len(actions) + 1,
                "widget_setState",
                title=f"切换到{item['label']}页",
                widgetId=widget_id,
                state={"activeStep": phase - 1, "currentTimeMs": (phase - 1) * 15000},
            ))
            actions.append(make_action(
                project_id,
                "animation",
                len(actions) + 1,
                "widget_timelineCue",
                title=f"{item['label']}切换",
                widgetId=widget_id,
                target=f"{project_id}-top-band",
                content="sceneTransition",
                state={"targets": [f"{project_id}-top-band"], "phase": phase, "phaseLabel": item["label"]},
                durationMs=1120,
                delayMs=560,
            ))
        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "speech",
            title=f"{item['label']}讲解",
            text=item["text"],
            widgetId=widget_id,
            elementId=target,
            target=target,
        ))
        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "widget_timelineCue",
            title=f"{item['label']}动效",
            widgetId=widget_id,
            target=cue_target,
            content=item["effect"],
            state={"targets": [cue_target], "phase": phase, "caption": item["label"], "speechId": actions[-1]["id"]},
            durationMs=1300,
            delayMs=900,
        ))
    return actions


def action_relation_for_phase(index: int, total: int) -> str:
    if total > 1 and index == total:
        return "feedback"
    return ACTION_RELATIONS[(index - 1) % (len(ACTION_RELATIONS) - 1)]


def action_effect_for_relation(relation: str) -> str:
    if relation == "data-flow":
        return "packetMove"
    if relation in {"process", "feedback"}:
        return "flow"
    return "draw"


def phase_spoken_text(item: dict[str, str], relation: str, phase: int, phase_count: int) -> str:
    label = item["label"]
    base = item["text"]
    relation_text = {
        "process": "重点看先后顺序，以及这一步输出给下一步的对象。",
        "dependency": "重点看前置条件，少一个条件就不能进入下一步。",
        "data-flow": "重点看数据从哪里来、经过哪里、沉淀成哪类证据。",
        "cause": "重点看现象、证据和原因之间是否能互相印证。",
        "feedback": "重点看处理动作是否回到复测结果，形成闭环。",
    }.get(relation, "重点看对象、证据、判据和复测结论是否互相支撑。")
    return f"{base} 这里聚焦“{label}”这个判断点。{relation_text}学习时把它落成三件事：看哪个对象，用哪条证据，得到什么工程结论。"


def animation_phases_for_project(project_id: str, scenario: str) -> list[dict[str, str]]:
    plan = PROJECT_PLANS.get(project_id)
    if not plan:
        return PHASES_BY_SCENARIO.get(scenario, DEFAULT_PHASES)
    phases: list[dict[str, str]] = []
    total = len(plan)
    for index, (label, description) in enumerate(plan, start=1):
        relation = action_relation_for_phase(index, total)
        phases.append({
            "label": label,
            "target": f"step-{index:02d}",
            "effect": action_effect_for_relation(relation),
            "suffix": f"line-{index}",
            "text": f"{label}阶段关注{description}，先看对象，再看证据，最后形成可复核的工程判断。",
        })
    return phases


def focus_target_for_phase(project_id: str, scenario: str, phase: int, fallback: str) -> str:
    if project_id == "P18":
        return f"{project_id}-step-{phase:02d}"
    template = PROJECT_TEMPLATE_MAP.get(project_id, "")
    layout = TEMPLATE_LAYOUTS.get(template, template)
    local = (
        TEMPLATE_FOCUS_TARGETS.get(template, {}).get(phase)
        or TEMPLATE_FOCUS_TARGETS.get(layout, {}).get(phase)
        or SCENARIO_FOCUS_TARGETS.get(scenario, {}).get(phase)
        or SCENARIO_FOCUS_TARGETS.get(layout, {}).get(phase)
    )
    return f"{project_id}-{local}" if local else f"{project_id}-{fallback}"


def focus_dim(target: str) -> float:
    return 0.006 if any(token in target for token in ("panel", "field", "lane", "dashboard", "loop-core", "table", "chart")) else 0.008


def animation_playback_actions(project_id: str, widget_id: str, make_action: MakeAction, scenario: str = "") -> list[dict[str, Any]]:
    phases = animation_phases_for_project(project_id, scenario)
    phase_count = max(4, min(6, len(phases) or 4))
    phases = phases[:phase_count]
    phase_width = ACTION_STAGE_DURATION_MS // phase_count
    actions = [
        make_action(project_id, "animation", 1, "widget_highlight", title="查看核心图", widgetId=widget_id, target=widget_id),
        make_action(
            project_id,
            "animation",
            2,
            "widget_setState",
            title="回到起点",
            widgetId=widget_id,
            state={"activeStep": 0, "currentTimeMs": 0},
        ),
    ]

    for phase, item in enumerate(phases, start=1):
        phase_start = (phase - 1) * phase_width
        phase_end = ACTION_STAGE_DURATION_MS if phase == phase_count else phase * phase_width
        transition_time = max(0, phase_start - 520)
        transition_cutoff = phase_end - 520 if phase < phase_count else phase_end - 200
        focus_time = phase_start + 1300
        cue_time = phase_start + 2600
        caption_time = phase_start + 3500
        caption_hold = max(0, transition_cutoff - caption_time - 850)
        target = focus_target_for_phase(project_id, scenario, phase, item["target"])
        cue_target = f"{project_id}-line-{phase}"
        relation = action_relation_for_phase(phase, phase_count)
        cue_is_line = "-line-" in cue_target
        cue_effect = action_effect_for_relation(relation) if cue_is_line else item["effect"]
        spoken_text = phase_spoken_text(item, relation, phase, phase_count)

        if phase > 1:
            actions.append(make_action(
                project_id,
                "animation",
                len(actions) + 1,
                "widget_setState",
                title=f"准备{item['label']}",
                widgetId=widget_id,
                state={"activeStep": phase - 2, "currentTimeMs": transition_time},
            ))
            actions.append(make_action(
                project_id,
                "animation",
                len(actions) + 1,
                "widget_timelineCue",
                title=f"{item['label']}切换",
                widgetId=widget_id,
                target=f"{project_id}-top-band",
                content="sceneTransition",
                state={"targets": [f"{project_id}-top-band"], "phase": phase, "phaseLabel": item["label"], "currentTimeMs": transition_time},
                currentTimeMs=transition_time,
                durationMs=1080,
            ))
            actions.append(make_action(
                project_id,
                "animation",
                len(actions) + 1,
                "widget_setState",
                title=f"进入{item['label']}",
                widgetId=widget_id,
                state={"activeStep": phase - 1, "currentTimeMs": phase_start},
            ))

        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "spotlight" if phase % 2 else "laser",
            title=item["label"],
            content=item["text"],
            caption=item["text"],
            displayText=item["label"],
            widgetId=widget_id,
            elementId=target,
            target=target,
            dimOpacity=focus_dim(target),
            focusPolicy="hold",
            currentTimeMs=focus_time,
            durationMs=max(900, phase_end - focus_time - 520),
        ))
        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "speech",
            title=f"{item['label']}讲解",
            text=item["text"],
            spokenText=spoken_text,
            caption=item["text"],
            widgetId=widget_id,
            elementId=target,
            target=target,
            dimOpacity=focus_dim(target),
            focusPolicy="hold",
            currentTimeMs=focus_time + 160,
            durationMs=3600,
        ))
        cue_state = {"targets": [cue_target], "phase": phase, "caption": item["label"], "speechId": actions[-1]["id"], "currentTimeMs": cue_time, "holdMs": 350}
        if cue_is_line:
            cue_state.update({"semantic": relation, "relationType": relation})
        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "widget_timelineCue",
            title=f"{item['label']}关系",
            widgetId=widget_id,
            target=cue_target,
            content=cue_effect,
            state=cue_state,
            currentTimeMs=cue_time,
            durationMs=1000,
            holdMs=350,
        ))
        actions.append(make_action(
            project_id,
            "animation",
            len(actions) + 1,
            "widget_timelineCue",
            title=f"{item['label']}要点",
            widgetId=widget_id,
            target=f"{project_id}-caption-text",
            content="captionUpdate",
            state={"targets": [f"{project_id}-caption-text"], "phase": phase, "caption": item["text"], "phaseLabel": item["label"], "currentTimeMs": caption_time, "holdMs": caption_hold},
            currentTimeMs=caption_time,
            durationMs=850,
            holdMs=caption_hold,
        ))
    return actions
