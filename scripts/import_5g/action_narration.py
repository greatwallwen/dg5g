from __future__ import annotations

from .knowledge_template_data import TEMPLATE_LABELS, TEMPLATE_LAYOUTS


TEMPLATE_ACTION_CONTEXT = {
    "site-survey": "现场信息采集",
    "dt-cqt-concept": "DT 与 CQT 测试",
    "test-process": "测试流程",
    "kpi-diagnosis": "指标诊断",
    "optimization-loop": "优化闭环",
    "signaling-ladder": "信令定位",
    "signaling-fault-ladder": "信令故障定位",
}

RELATION_NARRATION = {
    "process": "这一段主要看先后顺序：当前输出是否自然交给下一步，不能把流程箭头当成结论。",
    "dependency": "这一段主要看前置条件：对象、工具或字段少一项，后面的判断就不可靠。",
    "data-flow": "这一段主要看数据流向：数据从哪里来、经过哪里、最后沉淀成哪类证据。",
    "cause": "这一段主要看因果链：现象、证据和原因必须互相印证，不能只凭单点经验判断。",
    "feedback": "这一段主要看反馈闭环：处理动作必须回到复测结果，才算形成工程结论。",
}

ACTION_SPEECH_PATTERNS = [
    "先把“{label}”当成{context}里的判断入口。画面只保留短标签，真正要核对的是：{desc}。{relation}",
    "接着看“{label}”对应的工程对象。它不是独立步骤，而是把图上的对象和现场证据接起来：{desc}。{relation}",
    "到“{label}”这里，重点不是记住名称，而是判断它解决哪一个问题。这里的证据口径是：{desc}。{relation}",
    "再看“{label}”这一层。学习时要追问三个问题：对象是谁，证据在哪里，结论能否复测。当前要点是：{desc}。{relation}",
    "最后用“{label}”把前面的信息收束起来。不要把图形看成装饰，要把它读成可执行的判据：{desc}。{relation}",
    "复盘“{label}”时，先说清场景，再说清证据，最后再给判断。这里要保留的专业口径是：{desc}。{relation}",
]


def template_action_speech(template: str, label: str, desc: str, relation: str, index: int) -> str:
    layout = TEMPLATE_LAYOUTS.get(template, template)
    context = TEMPLATE_ACTION_CONTEXT.get(layout, TEMPLATE_LABELS.get(template, "知识图解"))
    relation_text = RELATION_NARRATION.get(relation, "这一段主要看对象、证据、判据和复测结论是否能互相支撑。")
    pattern = ACTION_SPEECH_PATTERNS[(index - 1) % len(ACTION_SPEECH_PATTERNS)]
    return pattern.format(label=label, context=context, desc=desc, relation=relation_text)


def template_intro_speech(template: str, intro: str) -> str:
    layout = TEMPLATE_LAYOUTS.get(template, template)
    context = TEMPLATE_ACTION_CONTEXT.get(layout, TEMPLATE_LABELS.get(template, "知识图解"))
    return (
        f"{intro} 这一页先建立{context}的观察顺序：先看对象，再看证据，最后看判据和复测结论。"
        "画面里的文字只保留关键词，详细解释会跟随重点框逐步展开。"
    )
