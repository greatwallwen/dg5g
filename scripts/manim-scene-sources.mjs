import { buildP08MonitoringSceneSource, buildP09ParameterRiskTreeSceneSource } from './manim-special-monitoring-scenes.mjs';
import { buildP12ValidationLoopSceneSource, buildP18SignalingFaultSceneSource } from './manim-special-validation-scenes.mjs';
export { MANIM_REQUIRED_TARGETS, MANIM_SCENE_TEMPLATE_ALIASES, MANIM_VISUAL_SIGNATURES, MANIM_KNOWLEDGE_PARAMETERS } from './manim-scene-catalog.mjs';
import { MANIM_KNOWLEDGE_PARAMETERS, MANIM_SCENE_TEMPLATE_ALIASES, MANIM_VISUAL_SIGNATURES } from './manim-scene-catalog.mjs';
import { manimProjectExtra } from './manim-project-extras.mjs';

export function buildDtCqtSceneSource(className) {
  return `from manim import *
import numpy as np


class ${className}(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.55, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.7 + UP * 2.18)

    def chip(self, text, color):
        box = RoundedRectangle(width=1.28, height=0.48, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 16, color).move_to(box)
        return VGroup(box, word)

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("DT / CQT: 路测与定点拨测", 32, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("把采样方式画清楚，再解释指标差异", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 移动采样")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.4)

        map_area = RoundedRectangle(width=9.3, height=3.4, corner_radius=0.18, color="#bfdbfe", fill_color="#eff6ff", fill_opacity=0.9).shift(DOWN * 0.18)
        roads = VGroup(
            Line(LEFT * 4.4 + UP * 0.95, RIGHT * 4.1 + UP * 0.25, color="#93c5fd", stroke_width=10),
            Line(LEFT * 4.25 + DOWN * 1.05, RIGHT * 4.3 + DOWN * 1.1, color="#93c5fd", stroke_width=10),
            Line(LEFT * 2.9 + UP * 1.35, LEFT * 2.4 + DOWN * 1.35, color="#93c5fd", stroke_width=7),
            Line(RIGHT * 1.5 + UP * 1.18, RIGHT * 1.1 + DOWN * 1.4, color="#93c5fd", stroke_width=7),
        )
        route = VMobject(color="#0f766e", stroke_width=7).set_points_smoothly([
            LEFT * 4.25 + DOWN * 0.92,
            LEFT * 3.3 + UP * 0.6,
            LEFT * 1.55 + UP * 0.18,
            RIGHT * 0.35 + DOWN * 0.55,
            RIGHT * 2.35 + DOWN * 0.15,
            RIGHT * 4.1 + UP * 0.55,
        ])
        car = VGroup(
            RoundedRectangle(width=0.58, height=0.34, corner_radius=0.08, fill_color="#0f766e", fill_opacity=1, color="#0f766e"),
            Dot(color="#fbbf24", radius=0.05).shift(RIGHT * 0.14),
        ).move_to(route.get_start())
        samples = VGroup(*[Dot(point, radius=0.06, color="#f59e0b") for point in route.get_points()[::max(1, len(route.get_points()) // 9)]])
        page = VGroup(map_area, roads, route, car, samples)
        self.play(Create(map_area), Create(roads), run_time=1.1)
        self.play(Create(route), FadeIn(car), run_time=1.0)
        self.play(MoveAlongPath(car, route), LaggedStart(*[FadeIn(dot, scale=1.5) for dot in samples], lag_ratio=0.12), run_time=3.8, rate_func=smooth)

        next_stage = self.stage("02 定点复测")
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.8)
        stage = next_stage

        site_area = RoundedRectangle(width=7.2, height=3.45, corner_radius=0.18, color="#fecdd3", fill_color="#fff1f2", fill_opacity=0.92).shift(DOWN * 0.12)
        rooms = VGroup(
            RoundedRectangle(width=1.65, height=1.12, corner_radius=0.12, color="#fda4af", fill_color="#ffe4e6", fill_opacity=1).move_to(LEFT * 2.25 + UP * 0.65),
            RoundedRectangle(width=1.65, height=1.12, corner_radius=0.12, color="#fda4af", fill_color="#ffe4e6", fill_opacity=1).move_to(RIGHT * 2.15 + DOWN * 0.62),
            RoundedRectangle(width=1.65, height=1.12, corner_radius=0.12, color="#fda4af", fill_color="#ffe4e6", fill_opacity=1).move_to(RIGHT * 0.15 + UP * 0.2),
        )
        cqt_points = VGroup(*[Dot(RIGHT * x + UP * y, radius=0.08, color="#e11d48") for x, y in [(-2.25, 0.65), (-0.45, 1.05), (0.15, 0.2), (1.2, -0.35), (2.15, -0.62), (2.85, 0.72)]])
        rings = VGroup(*[Circle(radius=0.28, color="#fb7185", stroke_width=2).move_to(dot) for dot in cqt_points])
        point_tags = VGroup(self.chip("室内点", "#be123c").move_to(LEFT * 2.25 + DOWN * 1.65), self.chip("路口点", "#be123c").move_to(RIGHT * 2.15 + DOWN * 1.65))
        page = VGroup(site_area, rooms, cqt_points, rings, point_tags)
        self.play(Create(site_area), FadeIn(rooms, shift=UP * 0.15), run_time=1.2)
        self.play(LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.1), FadeIn(cqt_points), run_time=1.8)
        self.play(LaggedStart(*[FadeIn(tag, shift=UP * 0.12) for tag in point_tags], lag_ratio=0.2), run_time=0.8)

        next_stage = self.stage("03 合并证据")
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.8)
        stage = next_stage

        left = self.chip("DT", "#0f766e").scale(1.35).move_to(LEFT * 3.2 + UP * 0.85)
        right = self.chip("CQT", "#e11d48").scale(1.35).move_to(RIGHT * 3.2 + UP * 0.85)
        report = RoundedRectangle(width=3.05, height=1.55, corner_radius=0.16, color="#f59e0b", fill_color="#fffbeb", fill_opacity=1).shift(DOWN * 0.15)
        report_title = self.label("覆盖 + 体验", 23, "#92400e").move_to(report.get_center() + UP * 0.24)
        report_note = self.label("同一结论", 18, "#0f172a").move_to(report.get_center() + DOWN * 0.24)
        stream_l = VMobject(color="#0f766e", stroke_width=6).set_points_smoothly([left.get_right(), LEFT * 1.35 + UP * 0.45, report.get_left() + UP * 0.2])
        stream_r = VMobject(color="#e11d48", stroke_width=6).set_points_smoothly([right.get_left(), RIGHT * 1.35 + UP * 0.45, report.get_right() + UP * 0.2])
        evidence = VGroup(*[self.chip(name, color).move_to(LEFT * 2.55 + RIGHT * i * 1.7 + DOWN * 1.75) for i, (name, color) in enumerate([("GPS", "#2563eb"), ("LOG", "#0f766e"), ("业务", "#f59e0b"), ("报告", "#7c3aed")])])
        self.play(FadeIn(left, shift=RIGHT * 0.12), FadeIn(right, shift=LEFT * 0.12), run_time=0.9)
        self.play(Create(stream_l), Create(stream_r), FadeIn(report), Write(report_title), Write(report_note), run_time=1.6)
        self.play(LaggedStart(*[FadeIn(item, shift=UP * 0.15) for item in evidence], lag_ratio=0.14), run_time=1.2)
        self.play(Indicate(report, color="#f59e0b"), run_time=1.0)
        self.wait(4.0)
`;
}

export function buildSignalingLadderSceneSource(className, project = '') {
  if (project === 'P18') return buildP18SignalingFaultSceneSource(className);
  return `from manim import *


class ${className}(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.65, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.65 + UP * 2.18)

    def chip(self, text, color):
        box = RoundedRectangle(width=1.32, height=0.44, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 15, color).move_to(box)
        return VGroup(box, word)

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("5G 信令流程: 从时间线定位问题", 31, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("少看长表，先看角色、方向和停顿点", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 角色入场")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.4)

        names = ["UE", "gNB", "AMF", "SMF", "UPF"]
        xs = [-4.8, -2.4, 0.0, 2.4, 4.8]
        lanes = VGroup()
        for name, x in zip(names, xs):
            top = self.chip(name, "#0f172a").move_to(RIGHT * x + UP * 1.55)
            line = DashedLine(RIGHT * x + UP * 1.2, RIGHT * x + DOWN * 1.75, color="#94a3b8", dash_length=0.14)
            lanes.add(VGroup(top, line))
        self.play(LaggedStart(*[FadeIn(lane, shift=DOWN * 0.12) for lane in lanes], lag_ratio=0.08), run_time=1.6)

        next_stage = self.stage("02 消息流动")
        self.play(ReplacementTransform(stage, next_stage), run_time=0.55)
        stage = next_stage

        messages = [
            (0, 1, 0.88, "RRC", "#2563eb"),
            (0, 2, 0.28, "注册", "#0f766e"),
            (2, 3, -0.32, "会话", "#7c3aed"),
            (3, 4, -0.92, "承载", "#0ea5e9"),
            (2, 0, -1.45, "拒绝", "#e11d48"),
        ]
        packet = Dot(color="#f59e0b", radius=0.09).move_to(RIGHT * xs[0] + UP * messages[0][2])
        arrows = VGroup()
        labels = VGroup()
        self.play(FadeIn(packet, scale=1.4), run_time=0.35)
        for src, dst, y, label, color in messages:
            start = RIGHT * xs[src] + UP * y
            end = RIGHT * xs[dst] + UP * (y - 0.14)
            arrow = Arrow(start, end, buff=0.16, color=color, stroke_width=5, max_tip_length_to_length_ratio=0.08)
            tag = self.chip(label, color).scale(0.82).next_to(arrow, UP, buff=0.04)
            arrows.add(arrow)
            labels.add(tag)
            self.play(GrowArrow(arrow), FadeIn(tag, shift=UP * 0.06), MoveAlongPath(packet, arrow), run_time=1.55, rate_func=smooth)

        next_stage = self.stage("03 定位断点")
        self.play(ReplacementTransform(stage, next_stage), run_time=0.55)
        stage = next_stage

        fail_mark = VGroup(
            Line(LEFT * 0.15 + DOWN * 0.15, RIGHT * 0.15 + UP * 0.15, color="#e11d48", stroke_width=7),
            Line(LEFT * 0.15 + UP * 0.15, RIGHT * 0.15 + DOWN * 0.15, color="#e11d48", stroke_width=7),
        ).move_to(arrows[-1].get_center())
        window = RoundedRectangle(width=3.25, height=1.18, corner_radius=0.16, color="#f59e0b", fill_color="#fffbeb", fill_opacity=0.95).move_to(DOWN * 2.32)
        rule_1 = self.label("时间窗", 18, "#92400e").move_to(window.get_center() + LEFT * 0.9)
        rule_2 = self.label("失败点", 18, "#e11d48").move_to(window.get_center())
        rule_3 = self.label("回退证据", 18, "#0f766e").move_to(window.get_center() + RIGHT * 0.9)
        focus = RoundedRectangle(width=2.95, height=0.72, corner_radius=0.14, color="#e11d48").move_to(arrows[-1].get_center())
        self.play(Create(focus), FadeIn(fail_mark, scale=1.2), run_time=0.9)
        self.play(FadeIn(window, shift=UP * 0.15), LaggedStart(Write(rule_1), Write(rule_2), Write(rule_3), lag_ratio=0.16), run_time=1.3)
        self.play(Indicate(focus, color="#e11d48"), run_time=1.0)
        self.wait(4.5)
`;
}

export const GENERIC_TEMPLATES = {
  'P02:p02-outdoor-site-survey': {
    title: '室外站点勘察：把环境建成覆盖模型',
    subtitle: '空间关系、遮挡变化、证据底图',
    mode: 'survey',
    scenes: ['01 概念建模', '02 动态演化', '03 证据结论'],
    items: [['区域', '楼宇'], ['站点', '方向'], ['遮挡', '路径'], ['照片', '证据']],
    colors: ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed'],
  },
  'P01:p01-site-survey-map': {
    title: '室内环境信息采集',
    subtitle: '空间定位、现场证据和底图分层',
    mode: 'survey',
    scenes: ['01 空间定位', '02 采集证据', '03 汇成底图'],
    items: [['站址', '位置'], ['设备', '对象'], ['照片', '证据'], ['表单', '记录']],
    colors: ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed'],
  },
  'P03:p03-complaint-evidence-chain': {
    title: '投诉信息：从用户感知追到证据链',
    subtitle: '把主诉、位置、日志和复测结论串成闭环',
    mode: 'flow',
    scenes: ['01 接收主诉', '02 对齐证据', '03 形成结论'],
    items: [['主诉', '场景'], ['位置', '小区'], ['日志', '时间'], ['复测', '结论']],
    colors: ['#2563eb', '#f59e0b', '#dc2626', '#0f766e'],
  },
  'P05:p05-test-trouble-triage': {
    title: '测试问题处理：从异常点分流原因',
    subtitle: '先定位故障现场，再选择覆盖、参数或业务路径',
    mode: 'flow',
    scenes: ['01 锁定异常', '02 分流原因', '03 复核处置'],
    items: [['异常', '现场'], ['覆盖', '回放'], ['参数', '复核'], ['业务', '验证']],
    colors: ['#0891b2', '#dc2626', '#f59e0b', '#7c3aed'],
  },
  'P06:p06-test-data-threshold-drilldown': {
    title: '测试数据分析：阈值下探定位低谷',
    subtitle: '把曲线低谷、门限线和现场片段对应起来',
    mode: 'kpi',
    scenes: ['01 画出曲线', '02 标出低谷', '03 回看现场'],
    items: [['RSRP', '低谷'], ['SINR', '波动'], ['门限', '告警'], ['片段', '复查']],
    colors: ['#2563eb', '#0f766e', '#f59e0b', '#dc2626'],
  },
  'P07:p07-nms-function-hub': {
    title: '网管功能图：从中心能力看支撑对象',
    subtitle: '围绕告警、配置、性能、拓扑和工单展开',
    mode: 'flow',
    scenes: ['01 中心能力', '02 功能分区', '03 支撑闭合'],
    items: [['告警', '事件'], ['配置', '参数'], ['性能', '指标'], ['工单', '协同']],
    colors: ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed'],
  },
  'P08:kpi-curve': {
    title: '5G 网络运行监控',
    subtitle: '用同一时间轴观察异常、阈值和根因',
    mode: 'kpi',
    scenes: ['01 实时曲线', '02 异常放大', '03 关联根因'],
    items: [['RSRP', '覆盖'], ['SINR', '质量'], ['5QI', '业务'], ['告警', '事件']],
    colors: ['#2563eb', '#0f766e', '#f59e0b', '#e11d48'],
  },
  'P09:parameter-decision-tree': {
    title: '5G 网络参数检查',
    subtitle: '改参前先看对象、影响面和回退条件',
    mode: 'tree',
    scenes: ['01 锁定对象', '02 影响半径', '03 决策门'],
    items: [['对象', '小区'], ['影响', '邻区'], ['回退', '条件'], ['验证', '复测']],
    colors: ['#7c3aed', '#2563eb', '#0f766e', '#f59e0b'],
  },
  'P10:p10-parameter-governance-gates': {
    title: '参数调整：从目标到回退条件',
    subtitle: '对象、影响半径、执行门和回退条件',
    mode: 'tree',
    scenes: ['01 目标门', '02 影响门', '03 回退门'],
    items: [['目标', '问题'], ['参数', '对象'], ['影响', '邻区'], ['回退', '条件']],
    colors: ['#7c3aed', '#2563eb', '#0f766e', '#f59e0b'],
  },
  'P11:p11-field-implementation-wave': {
    title: '方案实施：现场动作如何分批落地',
    subtitle: '从试点、变更、观察到复测，控制执行节奏',
    mode: 'rollout',
    scenes: ['01 试点变更', '02 分批执行', '03 现场复测'],
    items: [['试点', '首站'], ['变更', '窗口'], ['观察', '指标'], ['复测', '确认']],
    colors: ['#2563eb', '#7c3aed', '#0f766e', '#f59e0b'],
  },
  'P12:p12-validation-before-after': {
    title: '5G 网络优化结果验证',
    subtitle: '把优化前后放到同一把尺上比较',
    mode: 'validate',
    scenes: ['01 优化前', '02 优化后', '03 验证结论'],
    items: [['覆盖', 'RSRP'], ['质量', 'SINR'], ['速率', 'DL'], ['投诉', '体验']],
    colors: ['#e11d48', '#2563eb', '#0f766e', '#f59e0b'],
  },
  'P13:p13-report-evidence-package': {
    title: '优化报告输出：把证据装订成结论',
    subtitle: '图表、日志、复测结果进入同一交付包',
    mode: 'flow',
    scenes: ['01 收集材料', '02 编排证据', '03 输出结论'],
    items: [['图表', '趋势'], ['日志', '原因'], ['复测', '结果'], ['报告', '交付']],
    colors: ['#2563eb', '#f59e0b', '#7c3aed', '#0f766e'],
  },
  'P14:p14-kpi-source-pipeline': {
    title: '全网指标采集：多源数据进入同一口径',
    subtitle: 'PM、告警、配置和基线按时间窗汇聚',
    mode: 'kpi',
    scenes: ['01 接入数据源', '02 对齐时间窗', '03 汇成口径'],
    items: [['PM', '指标'], ['告警', '事件'], ['配置', '版本'], ['基线', '口径']],
    colors: ['#2563eb', '#0f766e', '#e11d48', '#f59e0b'],
  },
  'P15:p15-network-performance-rollout': {
    title: '5G 全网性能提升实施',
    subtitle: '从试点到全网，以波次推进并持续监测',
    mode: 'rollout',
    scenes: ['01 全网分层', '02 波次实施', '03 稳态监测'],
    items: [['试点', '首批'], ['扩展', '波次'], ['监控', '稳态'], ['复盘', '沉淀']],
    colors: ['#2563eb', '#7c3aed', '#0f766e', '#f59e0b'],
  },
  'P16:p16-validation-delta': {
    title: '效果验收：前后曲线同尺比较',
    subtitle: '基线、目标、异常复查',
    mode: 'validate',
    scenes: ['01 固定基线', '02 对比目标', '03 复查异常'],
    items: [['基线', '提升前'], ['目标', '阈值'], ['对比', '曲线'], ['结论', '验收']],
    colors: ['#e11d48', '#2563eb', '#0f766e', '#f59e0b'],
  },
};

export function buildGenericKnowledgeSceneSource(className, project, templateId) {
  const sceneTemplateId = sceneTemplateFor(project, templateId);
  if (sceneTemplateId === 'dt-cqt-concept') return withVisualSignatureHeader(buildDtCqtSceneSource(className), project, templateId, sceneTemplateId);
  if (sceneTemplateId === 'signaling-procedure-ladder' || sceneTemplateId === 'signaling-fault-ladder') {
    return withVisualSignatureHeader(buildSignalingLadderSceneSource(className, project), project, templateId, sceneTemplateId);
  }
  if (project === 'P08' && sceneTemplateId === 'kpi-curve') {
    return withVisualSignatureHeader(buildP08MonitoringSceneSource(className), project, templateId, sceneTemplateId);
  }
  if (project === 'P09' && sceneTemplateId === 'parameter-decision-tree') {
    return withVisualSignatureHeader(buildP09ParameterRiskTreeSceneSource(className), project, templateId, sceneTemplateId);
  }
  if (project === 'P12' && sceneTemplateId === 'p12-validation-before-after') {
    return withVisualSignatureHeader(buildP12ValidationLoopSceneSource(className), project, templateId, sceneTemplateId);
  }

  const data = GENERIC_TEMPLATES[`${project}:${sceneTemplateId}`] ?? GENERIC_TEMPLATES[`${project}:${templateId}`] ?? {
    title: `${project} 关键概念`,
    subtitle: '用少量图形解释一个核心原理',
    mode: 'flow',
    scenes: ['01 看对象', '02 看过程', '03 看结论'],
    items: [['概念', '对象'], ['流程', '动作'], ['证据', '观察'], ['交付', '结论']],
    colors: ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed'],
  };
  const extra = manimProjectExtra(project, templateId);
  const visual = manimVisualSignatureFor(project, templateId, sceneTemplateId);
  return `${visualHeaderFor(project, templateId, sceneTemplateId)}from manim import *
import numpy as np


class ${className}(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.55, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.7 + UP * 2.18)

    def chip(self, label, note, color):
        box = RoundedRectangle(width=1.54, height=0.62, corner_radius=0.13, color=color, fill_color=color, fill_opacity=0.11)
        top = self.label(label, 18, color).move_to(box.get_center() + UP * 0.12)
        bottom = self.label(note, 13, "#334155").move_to(box.get_center() + DOWN * 0.15)
        return VGroup(box, top, bottom)

    def trans(self, page, stage, next_text):
        next_stage = self.stage(next_text)
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.8)
        return next_stage

    def visual_identity(self, signature, primitives, colors):
        primary = colors[0]
        secondary = colors[1]
        warn = colors[2]
        danger = colors[3]
        frame = RoundedRectangle(width=8.6, height=2.55, corner_radius=0.18, color="#cbd5e1", fill_color="#ffffff", fill_opacity=0.82).move_to(DOWN * 0.22)
        tokens = VGroup()
        for index, name in enumerate(primitives):
            marker = RoundedRectangle(width=1.36, height=0.42, corner_radius=0.1, color=colors[index % len(colors)], fill_color=colors[index % len(colors)], fill_opacity=0.1)
            dot = Dot(radius=0.045, color=colors[index % len(colors)]).move_to(marker.get_left() + RIGHT * 0.18)
            label = self.label(name.replace("-", " "), 10, colors[index % len(colors)]).move_to(marker.get_center() + RIGHT * 0.15)
            tokens.add(VGroup(marker, dot, label).move_to(LEFT * 3.0 + RIGHT * index * 2.0 + DOWN * 1.58))

        if signature == "floorplan-layered-pin-map":
            rooms = VGroup(*[RoundedRectangle(width=1.15, height=0.7, corner_radius=0.08, color=primary, fill_color=primary, fill_opacity=0.08).move_to(LEFT * 2.5 + RIGHT * (i % 3) * 1.15 + UP * (0.55 - int(i / 3) * 0.78)) for i in range(6)])
            route = VMobject(color=secondary, stroke_width=5).set_points_smoothly([LEFT * 3.0 + DOWN * 0.55, LEFT * 1.65 + UP * 0.35, LEFT * 0.35 + DOWN * 0.15, RIGHT * 0.65 + UP * 0.48])
            pins = VGroup(*[Dot(point, radius=0.055, color=warn) for point in route.get_points()[::max(1, len(route.get_points()) // 5)]])
            motif = VGroup(rooms, route, pins)
        elif signature == "outdoor-sector-obstruction-map":
            tower = VGroup(Triangle(color=primary, fill_color=primary, fill_opacity=0.15).scale(0.42), Line(DOWN * 0.42, UP * 0.62, color=primary, stroke_width=5)).move_to(LEFT * 2.15)
            sectors = VGroup(*[Arc(radius=1.0 + i * 0.36, start_angle=-0.48, angle=0.96, color=secondary, stroke_width=5).move_to(tower.get_center()) for i in range(3)])
            blocks = VGroup(*[Rectangle(width=0.52, height=0.95 + i * 0.22, color=danger, fill_color=danger, fill_opacity=0.12).move_to(RIGHT * (0.25 + i * 0.72) + DOWN * 0.15) for i in range(4)])
            motif = VGroup(tower, sectors, blocks)
        elif signature == "complaint-evidence-chain-loop":
            nodes = VGroup(*[Circle(radius=0.34, color=colors[i], fill_color=colors[i], fill_opacity=0.12).move_to(np.array([np.cos(i * TAU / 4), np.sin(i * TAU / 4), 0]) * 1.25 + LEFT * 1.0) for i in range(4)])
            arrows = VGroup(*[Arrow(nodes[i].get_center(), nodes[(i + 1) % 4].get_center(), buff=0.36, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.14) for i in range(4)])
            ticket = RoundedRectangle(width=1.4, height=1.05, corner_radius=0.1, color=danger, fill_color="#fff1f2", fill_opacity=1).move_to(RIGHT * 2.15)
            motif = VGroup(nodes, arrows, ticket)
        elif signature == "fault-triage-cause-funnel":
            funnel = VGroup(Polygon(LEFT * 2.3 + UP * 0.95, RIGHT * 0.65 + UP * 0.95, RIGHT * 0.05 + DOWN * 0.9, LEFT * 1.65 + DOWN * 0.9, color=danger, fill_color=danger, fill_opacity=0.08))
            branches = VGroup(*[Arrow(LEFT * 0.15 + DOWN * 0.55, RIGHT * (1.0 + i * 0.82) + UP * (0.55 - i * 0.42), buff=0.08, color=colors[i], stroke_width=4, max_tip_length_to_length_ratio=0.12) for i in range(3)])
            spark = VGroup(Line(LEFT * 0.16, RIGHT * 0.16, color=danger, stroke_width=7), Line(DOWN * 0.16, UP * 0.16, color=danger, stroke_width=7)).move_to(LEFT * 2.0 + UP * 0.48)
            motif = VGroup(funnel, branches, spark)
        elif signature == "threshold-drilldown-low-valley":
            axes = Axes(x_range=[0, 5, 1], y_range=[0, 4, 1], x_length=4.4, y_length=1.9, tips=False, axis_config={"color": "#cbd5e1"}).shift(LEFT * 1.1)
            curve = axes.plot(lambda x: 2.45 - 1.2 * np.exp(-((x - 3.4) ** 2) / 0.28) + 0.16 * np.sin(x * 2), color=primary, stroke_width=5)
            threshold = DashedLine(axes.c2p(0, 1.85), axes.c2p(5, 1.85), color=warn, dash_length=0.12)
            lens = Circle(radius=0.48, color=danger, stroke_width=5).move_to(axes.c2p(3.4, 1.25))
            motif = VGroup(axes, curve, threshold, lens)
        elif signature == "nms-capability-hub-spokes":
            hub = Circle(radius=0.46, color=primary, fill_color=primary, fill_opacity=0.14).move_to(ORIGIN)
            spokes = VGroup()
            for i in range(5):
                end = np.array([np.cos(i * TAU / 5), np.sin(i * TAU / 5), 0]) * 1.45
                spokes.add(VGroup(Line(ORIGIN, end, color="#94a3b8", stroke_width=4), RoundedRectangle(width=0.72, height=0.36, corner_radius=0.08, color=colors[i % 4], fill_color=colors[i % 4], fill_opacity=0.11).move_to(end)))
            motif = VGroup(hub, spokes)
        elif signature == "parameter-governance-gate-matrix":
            cells = VGroup(*[RoundedRectangle(width=0.92, height=0.56, corner_radius=0.08, color=colors[(r + c) % 4], fill_color=colors[(r + c) % 4], fill_opacity=0.11).move_to(LEFT * 1.4 + RIGHT * c * 1.05 + UP * (0.45 - r * 0.72)) for r in range(2) for c in range(4)])
            gates = VGroup(*[Line(cells[i].get_bottom(), cells[i + 4].get_top(), color="#64748b", stroke_width=3) for i in range(4)])
            motif = VGroup(cells, gates)
        elif signature == "field-implementation-wavefront" or signature == "network-performance-rollout-waves":
            sites = VGroup(*[Circle(radius=0.13, color="#94a3b8", fill_color="#e2e8f0", fill_opacity=1).move_to(LEFT * 2.3 + RIGHT * (i % 6) * 0.82 + UP * (0.72 - int(i / 6) * 0.65)) for i in range(18)])
            waves = VGroup(*[Circle(radius=0.55 + i * 0.45, color=colors[i], stroke_width=4).move_to(sites[2 + i * 5]) for i in range(3)])
            motif = VGroup(sites, waves)
        elif signature == "report-evidence-package-binder":
            sheets = VGroup(*[RoundedRectangle(width=1.05, height=1.35, corner_radius=0.08, color=colors[i], fill_color=colors[i], fill_opacity=0.09).move_to(LEFT * 1.55 + RIGHT * i * 0.62 + UP * (i * 0.08)) for i in range(4)])
            spine = Rectangle(width=0.18, height=1.65, color=primary, fill_color=primary, fill_opacity=0.45).move_to(LEFT * 1.95)
            clip = Arc(radius=0.52, start_angle=-PI / 2, angle=PI, color=warn, stroke_width=5).move_to(RIGHT * 1.72 + UP * 0.15)
            motif = VGroup(sheets, spine, clip)
        elif signature == "multi-source-kpi-pipeline-window":
            buckets = VGroup(*[RoundedRectangle(width=0.82, height=0.58, corner_radius=0.09, color=colors[i], fill_color=colors[i], fill_opacity=0.12).move_to(LEFT * 3.0 + RIGHT * i * 1.1 + UP * 0.52) for i in range(4)])
            pipe = VMobject(color=primary, stroke_width=6).set_points_smoothly([LEFT * 2.8 + DOWN * 0.35, LEFT * 1.0 + DOWN * 0.75, RIGHT * 0.85 + DOWN * 0.25, RIGHT * 2.5 + DOWN * 0.58])
            output = RoundedRectangle(width=1.15, height=0.7, corner_radius=0.1, color=secondary, fill_color=secondary, fill_opacity=0.12).move_to(RIGHT * 3.05 + DOWN * 0.55)
            motif = VGroup(buckets, pipe, output)
        elif signature == "acceptance-delta-baseline-target":
            axes = Axes(x_range=[0, 5, 1], y_range=[0, 4, 1], x_length=4.8, y_length=1.9, tips=False, axis_config={"color": "#cbd5e1"}).shift(LEFT * 0.6)
            baseline = axes.plot(lambda x: 1.45 + 0.16 * np.sin(x * 2.2), color=danger, stroke_width=5)
            target = axes.plot(lambda x: 2.55 + 0.12 * np.cos(x * 1.7), color=secondary, stroke_width=5)
            delta = DoubleArrow(axes.c2p(4.3, 1.45), axes.c2p(4.3, 2.55), buff=0.04, color=warn, stroke_width=4, max_tip_length_to_length_ratio=0.2)
            motif = VGroup(axes, baseline, target, delta)
        else:
            nodes = VGroup(*[self.chip(item, str(i + 1), colors[i % len(colors)]).scale(0.82).move_to(LEFT * 2.4 + RIGHT * i * 1.6) for i, item in enumerate(primitives[:4])])
            links = VGroup(*[Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.12, color="#94a3b8", stroke_width=4, max_tip_length_to_length_ratio=0.12) for i in range(len(nodes) - 1)])
            motif = VGroup(nodes, links)

        page = VGroup(frame, motif, tokens)
        self.play(FadeIn(frame, shift=UP * 0.08), run_time=0.35)
        self.play(LaggedStart(*[FadeIn(part, shift=UP * 0.1) for part in motif], lag_ratio=0.08), run_time=1.15)
        self.play(LaggedStart(*[FadeIn(token, shift=UP * 0.08) for token in tokens], lag_ratio=0.05), run_time=0.65)
        self.play(Indicate(motif, color=primary), run_time=0.65)
        self.play(FadeOut(page, shift=DOWN * 0.18), run_time=0.35)
${extra.method}

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label(${pyString(data.title)}, 32, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label(${pyString(data.subtitle)}, 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        scenes = ${pyList(data.scenes)}
        items = ${pyPairs(data.items)}
        colors = ${pyList(data.colors)}
        stage = self.stage(scenes[0])
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.4)
${extra.call}
        visual_signature = ${pyString(visual.signature)}
        visual_primitives = ${pyList(visual.primitives)}
        self.visual_identity(visual_signature, visual_primitives, colors)
        mode = ${pyString(data.mode)}
        if mode == "survey":
            self.story_survey(stage, scenes, items, colors)
        elif mode == "kpi":
            self.story_kpi(stage, scenes, items, colors)
        elif mode == "tree":
            self.story_tree(stage, scenes, items, colors)
        elif mode == "validate":
            self.story_validate(stage, scenes, items, colors)
        elif mode == "rollout":
            self.story_rollout(stage, scenes, items, colors)
        else:
            self.story_flow(stage, scenes, items, colors)
        self.wait(3.5)

    def story_survey(self, stage, scenes, items, colors):
        floor = RoundedRectangle(width=7.6, height=3.35, corner_radius=0.16, color="#bfdbfe", fill_color="#eff6ff", fill_opacity=0.95).shift(DOWN * 0.1)
        walls = VGroup(
            Line(LEFT * 3.35 + UP * 0.9, RIGHT * 3.35 + UP * 0.9, color="#93c5fd", stroke_width=6),
            Line(LEFT * 2.2 + UP * 0.9, LEFT * 2.2 + DOWN * 1.1, color="#93c5fd", stroke_width=6),
            Line(RIGHT * 0.45 + UP * 0.9, RIGHT * 0.45 + DOWN * 1.1, color="#93c5fd", stroke_width=6),
        )
        path = VMobject(color=colors[0], stroke_width=7).set_points_smoothly([LEFT * 3.1 + DOWN * 1.0, LEFT * 1.8 + UP * 0.35, LEFT * 0.25 + DOWN * 0.25, RIGHT * 1.55 + UP * 0.55, RIGHT * 3.1 + DOWN * 0.75])
        dot = Dot(path.get_start(), radius=0.1, color="#f59e0b")
        pins = VGroup(*[Dot(p, radius=0.065, color=colors[i % len(colors)]) for i, p in enumerate(path.get_points()[::max(1, len(path.get_points()) // 7)])])
        page = VGroup(floor, walls, path, dot, pins)
        self.play(Create(floor), Create(walls), run_time=1.0)
        self.play(Create(path), FadeIn(dot), run_time=0.8)
        self.play(MoveAlongPath(dot, path), LaggedStart(*[FadeIn(pin, scale=1.5) for pin in pins], lag_ratio=0.12), run_time=3.3)
        stage = self.trans(page, stage, scenes[1])

        phone = RoundedRectangle(width=1.35, height=2.25, corner_radius=0.18, color=colors[1], fill_color="#eff6ff", fill_opacity=1).move_to(LEFT * 2.4)
        lens = Circle(radius=0.35, color=colors[2], fill_color="#fffbeb", fill_opacity=1).move_to(RIGHT * 0.1 + UP * 0.45)
        form = RoundedRectangle(width=1.8, height=2.1, corner_radius=0.12, color=colors[3], fill_color="#faf5ff", fill_opacity=1).move_to(RIGHT * 2.45)
        form_lines = VGroup(*[Line(form.get_left() + RIGHT * 0.3 + UP * y, form.get_right() + LEFT * 0.3 + UP * y, color="#c4b5fd", stroke_width=3) for y in [0.55, 0.15, -0.25, -0.65]])
        beams = VGroup(*[Circle(radius=r, color=colors[0], stroke_width=2).move_to(lens) for r in [0.48, 0.72, 0.96]])
        chips = VGroup(*[self.chip(item[0], item[1], colors[i]).scale(0.82).move_to(LEFT * 3.15 + RIGHT * i * 2.1 + DOWN * 1.95) for i, item in enumerate(items)])
        capture_flow = VGroup(
            Arrow(phone.get_right(), lens.get_left(), buff=0.15, color=colors[0], stroke_width=4, max_tip_length_to_length_ratio=0.12),
            Arrow(lens.get_right(), form.get_left(), buff=0.15, color=colors[2], stroke_width=4, max_tip_length_to_length_ratio=0.12),
        )
        page = VGroup(phone, lens, form, form_lines, beams, chips, capture_flow)
        self.play(FadeIn(phone, shift=UP * 0.12), FadeIn(lens, scale=1.1), FadeIn(form, shift=UP * 0.12), Create(form_lines), run_time=1.2)
        self.play(LaggedStart(*[GrowFromCenter(beam) for beam in beams], lag_ratio=0.16), LaggedStart(*[GrowArrow(arrow) for arrow in capture_flow], lag_ratio=0.18), run_time=1.1)
        self.play(LaggedStart(*[FadeIn(chip, shift=UP * 0.14) for chip in chips], lag_ratio=0.12), run_time=1.2)
        stage = self.trans(page, stage, scenes[2])

        layers = VGroup()
        for i, item in enumerate(items):
            layer = RoundedRectangle(width=4.8, height=0.58, corner_radius=0.12, color=colors[i], fill_color=colors[i], fill_opacity=0.12).move_to(UP * (0.9 - i * 0.38) + RIGHT * (i * 0.18))
            layers.add(VGroup(layer, self.label(item[0], 18, colors[i]).move_to(layer.get_center() + LEFT * 1.75), self.label(item[1], 14, "#334155").move_to(layer.get_center() + RIGHT * 1.65)))
        base = RoundedRectangle(width=5.25, height=2.35, corner_radius=0.16, color="#cbd5e1").shift(DOWN * 0.05)
        self.play(Create(base), LaggedStart(*[FadeIn(layer, shift=UP * 0.2) for layer in layers], lag_ratio=0.16), run_time=1.7)
        self.play(Indicate(layers, color=colors[0]), run_time=0.9)

    def story_kpi(self, stage, scenes, items, colors):
        axes = Axes(x_range=[0, 6, 1], y_range=[0, 6, 1], x_length=8.6, y_length=3.1, tips=False, axis_config={"color": "#cbd5e1"}).shift(DOWN * 0.15)
        curve_a = axes.plot(lambda x: 2.2 + 0.8 * np.sin(x * 1.1), color=colors[0], stroke_width=5)
        curve_b = axes.plot(lambda x: 3.35 + 0.65 * np.cos(x * 0.9), color=colors[1], stroke_width=5)
        cursor = Dot(axes.c2p(4.4, 2.15), radius=0.1, color=colors[3])
        page = VGroup(axes, curve_a, curve_b, cursor)
        self.play(Create(axes), run_time=0.9)
        self.play(Create(curve_a), Create(curve_b), run_time=2.0)
        self.play(FadeIn(cursor, scale=1.4), cursor.animate.move_to(axes.c2p(4.7, 2.7)), run_time=1.2)
        stage = self.trans(page, stage, scenes[1])

        axes = Axes(x_range=[0, 6, 1], y_range=[0, 6, 1], x_length=8.6, y_length=3.1, tips=False, axis_config={"color": "#cbd5e1"}).shift(DOWN * 0.15)
        curve = axes.plot(lambda x: 3.0 + 0.5 * np.cos(x * 0.8) - 1.1 * np.exp(-((x - 4.2) ** 2) / 0.22), color=colors[0], stroke_width=5)
        threshold = DashedLine(axes.c2p(0, 2.5), axes.c2p(6, 2.5), color=colors[2], dash_length=0.14)
        lens = Circle(radius=0.72, color=colors[3], stroke_width=5).move_to(axes.c2p(4.2, 2.0))
        badge = self.chip("异常", "放大", colors[3]).move_to(RIGHT * 3.55 + UP * 1.25)
        page = VGroup(axes, curve, threshold, lens, badge)
        self.play(Create(axes), Create(curve), run_time=1.4)
        self.play(Create(threshold), GrowFromCenter(lens), FadeIn(badge, shift=LEFT * 0.15), run_time=1.2)
        self.play(Indicate(lens, color=colors[3]), run_time=0.8)
        stage = self.trans(page, stage, scenes[2])

        tracks = VGroup()
        for i, item in enumerate(items[:3]):
            y = 0.85 - i * 0.75
            line = Line(LEFT * 3.5 + UP * y, RIGHT * 3.3 + UP * y, color="#cbd5e1", stroke_width=4)
            signal = VMobject(color=colors[i], stroke_width=5).set_points_smoothly([LEFT * 3.3 + UP * y, LEFT * 1.3 + UP * (y + 0.25 - i * 0.08), RIGHT * 0.8 + UP * (y - 0.22), RIGHT * 3.1 + UP * (y + 0.18)])
            tracks.add(VGroup(self.label(item[0], 17, colors[i]).next_to(line, LEFT, buff=0.25), line, signal))
        marker = Line(UP * 1.3, DOWN * 1.35, color=colors[3], stroke_width=5).shift(RIGHT * 0.75)
        cause = self.chip("告警", "同窗", colors[3]).move_to(RIGHT * 3.65 + DOWN * 1.35)
        evidence_arrow = Arrow(marker.get_bottom(), cause.get_left(), buff=0.12, color=colors[3], stroke_width=4, max_tip_length_to_length_ratio=0.12)
        self.play(LaggedStart(*[FadeIn(track[0], shift=RIGHT * 0.1) for track in tracks], lag_ratio=0.1), LaggedStart(*[Create(track[1]) for track in tracks], lag_ratio=0.1), run_time=1.0)
        self.play(LaggedStart(*[Create(track[2]) for track in tracks], lag_ratio=0.12), Create(marker), run_time=1.5)
        self.play(GrowArrow(evidence_arrow), FadeIn(cause, shift=UP * 0.15), Indicate(marker, color=colors[3]), run_time=1.0)

    def story_tree(self, stage, scenes, items, colors):
        sites = VGroup(*[Circle(radius=0.24, color="#94a3b8", fill_color="#e2e8f0", fill_opacity=1).move_to(LEFT * 3.0 + RIGHT * (i % 4) * 2.0 + UP * (0.85 - int(i / 4) * 1.35)) for i in range(8)])
        target = sites[5]
        label = self.chip(items[0][0], items[0][1], colors[0]).move_to(target.get_center() + DOWN * 1.05)
        page = VGroup(sites, label)
        self.play(LaggedStart(*[FadeIn(site, scale=0.9) for site in sites], lag_ratio=0.05), run_time=1.1)
        self.play(target.animate.set_color(colors[0]).set_fill(colors[0], opacity=0.18).scale(1.35), FadeIn(label, shift=UP * 0.12), run_time=1.0)
        stage = self.trans(page, stage, scenes[1])

        core = Dot(ORIGIN, radius=0.12, color=colors[0])
        rings = VGroup(*[Circle(radius=r, color=colors[i % len(colors)], stroke_width=4).move_to(core) for i, r in enumerate([0.75, 1.45, 2.15])])
        neighbors = VGroup(*[Dot(np.array([np.cos(a), np.sin(a), 0]) * r, radius=0.08, color=colors[1]) for a, r in [(0.2, 1.45), (1.7, 2.15), (3.4, 1.45), (4.8, 2.15)]])
        chips = VGroup(self.chip(items[1][0], items[1][1], colors[1]).move_to(LEFT * 3.4 + DOWN * 1.75), self.chip("半径", "可控", colors[2]).move_to(RIGHT * 3.4 + DOWN * 1.75))
        page = VGroup(core, rings, neighbors, chips)
        self.play(FadeIn(core, scale=1.2), run_time=0.4)
        self.play(LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.18), FadeIn(neighbors), run_time=1.7)
        self.play(LaggedStart(*[FadeIn(chip, shift=UP * 0.12) for chip in chips], lag_ratio=0.18), run_time=0.9)
        stage = self.trans(page, stage, scenes[2])

        gates = VGroup(*[self.chip(item[0], item[1], colors[i]).move_to(LEFT * 2.6 + RIGHT * i * 2.55 + UP * (0.35 if i == 1 else -0.25)) for i, item in enumerate(items)])
        rails = VGroup(*[Arrow(gates[i].get_right(), gates[i + 1].get_left(), buff=0.14, color="#94a3b8", stroke_width=4, max_tip_length_to_length_ratio=0.12) for i in range(len(gates) - 1)])
        commit = RoundedRectangle(width=1.45, height=0.54, corner_radius=0.13, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1).move_to(DOWN * 1.55)
        commit_text = self.label("执行", 18, "#0f766e").move_to(commit)
        self.play(LaggedStart(*[FadeIn(gate, shift=UP * 0.14) for gate in gates], lag_ratio=0.12), run_time=1.2)
        self.play(LaggedStart(*[Create(rail) for rail in rails], lag_ratio=0.12), FadeIn(VGroup(commit, commit_text), shift=UP * 0.14), run_time=1.1)
        self.play(Indicate(gates[2], color=colors[2]), run_time=0.9)

    def story_validate(self, stage, scenes, items, colors):
        def bars(values, palette):
            group = VGroup()
            for i, value in enumerate(values):
                bar = Rectangle(width=0.42, height=value, color=palette[i], fill_color=palette[i], fill_opacity=0.72)
                bar.move_to(LEFT * 2.4 + RIGHT * i * 1.55 + DOWN * 1.2 + UP * value / 2)
                group.add(VGroup(bar, self.label(items[i][0], 15, palette[i]).next_to(bar, DOWN, buff=0.12)))
            return group
        base = RoundedRectangle(width=7.6, height=3.25, corner_radius=0.16, color="#fecdd3", fill_color="#fff1f2", fill_opacity=0.9).shift(DOWN * 0.1)
        before = bars([0.85, 1.25, 0.75, 1.45], colors)
        page = VGroup(base, before)
        self.play(Create(base), LaggedStart(*[FadeIn(item, shift=UP * 0.12) for item in before], lag_ratio=0.1), run_time=1.3)
        self.play(Indicate(before[3], color=colors[3]), run_time=0.9)
        stage = self.trans(page, stage, scenes[1])

        base = RoundedRectangle(width=7.6, height=3.25, corner_radius=0.16, color="#bbf7d0", fill_color="#f0fdf4", fill_opacity=0.92).shift(DOWN * 0.1)
        after = bars([1.55, 1.85, 1.65, 0.62], colors)
        wave = VMobject(color="#0f766e", stroke_width=5).set_points_smoothly([LEFT * 3.1 + DOWN * 0.95, LEFT * 1.2 + UP * 0.25, RIGHT * 0.65 + DOWN * 0.05, RIGHT * 3.2 + UP * 0.9])
        page = VGroup(base, after, wave)
        self.play(Create(base), LaggedStart(*[FadeIn(item, shift=UP * 0.12) for item in after], lag_ratio=0.1), run_time=1.2)
        self.play(Create(wave), run_time=1.1)
        stage = self.trans(page, stage, scenes[2])

        before_chip = self.chip("优化前", "波动", colors[0]).move_to(LEFT * 2.25 + UP * 0.45)
        after_chip = self.chip("优化后", "收敛", colors[2]).move_to(RIGHT * 2.25 + UP * 0.45)
        gauge = Circle(radius=0.72, color=colors[2], fill_color="#ecfdf5", fill_opacity=1).move_to(DOWN * 0.55)
        tick = VGroup(Line(LEFT * 0.26 + DOWN * 0.02, LEFT * 0.05 + DOWN * 0.24, color=colors[2], stroke_width=7), Line(LEFT * 0.05 + DOWN * 0.24, RIGHT * 0.34 + UP * 0.24, color=colors[2], stroke_width=7)).move_to(gauge)
        compare_arrows = VGroup(
            Arrow(before_chip.get_bottom(), gauge.get_left(), buff=0.14, color=colors[0], stroke_width=4, max_tip_length_to_length_ratio=0.12),
            Arrow(after_chip.get_bottom(), gauge.get_right(), buff=0.14, color=colors[2], stroke_width=4, max_tip_length_to_length_ratio=0.12),
        )
        self.play(FadeIn(before_chip, shift=RIGHT * 0.12), FadeIn(after_chip, shift=LEFT * 0.12), run_time=0.9)
        self.play(LaggedStart(*[GrowArrow(arrow) for arrow in compare_arrows], lag_ratio=0.12), GrowFromCenter(gauge), Create(tick), run_time=0.9)
        self.play(Indicate(after_chip, color=colors[2]), run_time=0.9)

    def story_rollout(self, stage, scenes, items, colors):
        sites = VGroup()
        for row in range(3):
            for col in range(5):
                sites.add(Circle(radius=0.18, color="#94a3b8", fill_color="#e2e8f0", fill_opacity=1).move_to(LEFT * 3.6 + RIGHT * col * 1.8 + UP * (1.0 - row * 0.85)))
        clusters = VGroup(self.chip(items[0][0], items[0][1], colors[0]).move_to(LEFT * 3.25 + DOWN * 1.65), self.chip(items[1][0], items[1][1], colors[1]).move_to(ORIGIN + DOWN * 1.65), self.chip(items[2][0], items[2][1], colors[2]).move_to(RIGHT * 3.25 + DOWN * 1.65))
        cluster_arrows = VGroup(*[Arrow(clusters[i].get_right(), clusters[i + 1].get_left(), buff=0.14, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12) for i in range(len(clusters) - 1)])
        page = VGroup(sites, clusters, cluster_arrows)
        self.play(LaggedStart(*[FadeIn(site, scale=0.85) for site in sites], lag_ratio=0.035), run_time=1.2)
        self.play(LaggedStart(*[FadeIn(chip, shift=UP * 0.12) for chip in clusters], lag_ratio=0.12), LaggedStart(*[GrowArrow(arrow) for arrow in cluster_arrows], lag_ratio=0.12), run_time=0.9)
        stage = self.trans(page, stage, scenes[1])

        sites = VGroup()
        for row in range(3):
            for col in range(5):
                sites.add(Circle(radius=0.18, color="#94a3b8", fill_color="#e2e8f0", fill_opacity=1).move_to(LEFT * 3.6 + RIGHT * col * 1.8 + UP * (1.0 - row * 0.85)))
        pulse = Circle(radius=0.48, color=colors[1], stroke_width=4).move_to(sites[0])
        page = VGroup(sites, pulse)
        self.play(FadeIn(sites), FadeIn(pulse), run_time=0.7)
        for i in range(len(sites)):
            self.play(pulse.animate.move_to(sites[i]), sites[i].animate.set_color(colors[min(i // 5, 2)]).set_fill(colors[min(i // 5, 2)], opacity=0.28), run_time=0.18)
        stage = self.trans(page, stage, scenes[2])

        axes = Axes(x_range=[0, 6, 1], y_range=[0, 6, 1], x_length=7.4, y_length=2.65, tips=False, axis_config={"color": "#cbd5e1"}).shift(DOWN * 0.1)
        stable = axes.plot(lambda x: 3.8 + 0.22 * np.sin(x * 2.0), color=colors[2], stroke_width=5)
        band = Rectangle(width=7.4, height=0.52, color=colors[2], fill_color=colors[2], fill_opacity=0.08).move_to(axes.c2p(3, 3.8))
        chips = VGroup(self.chip(items[2][0], items[2][1], colors[2]).move_to(LEFT * 2.9 + DOWN * 1.8), self.chip(items[3][0], items[3][1], colors[3]).move_to(RIGHT * 2.9 + DOWN * 1.8))
        self.play(Create(axes), FadeIn(band), run_time=0.9)
        self.play(Create(stable), LaggedStart(*[FadeIn(chip, shift=UP * 0.12) for chip in chips], lag_ratio=0.16), run_time=1.4)
        self.play(Indicate(stable, color=colors[2]), run_time=0.8)

    def story_flow(self, stage, scenes, items, colors):
        nodes = VGroup(*[self.chip(item[0], item[1], colors[i % len(colors)]).move_to(LEFT * 3.2 + RIGHT * i * 2.1) for i, item in enumerate(items)])
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.14) for node in nodes], lag_ratio=0.14), run_time=1.2)
        self.play(LaggedStart(*[Indicate(node, color=colors[i % len(colors)]) for i, node in enumerate(nodes)], lag_ratio=0.18), run_time=1.4)
`;
}

export function manimSceneTemplateFor(project, templateId) {
  return MANIM_SCENE_TEMPLATE_ALIASES[`${project}:${templateId}`] ?? templateId;
}

export function manimSceneSpecFor(project, templateId) {
  const sceneTemplateId = manimSceneTemplateFor(project, templateId);
  const withVisual = (spec) => ({ ...spec, ...visualSpecFields(project, templateId, sceneTemplateId) });
  const generic = GENERIC_TEMPLATES[`${project}:${sceneTemplateId}`] ?? GENERIC_TEMPLATES[`${project}:${templateId}`];
  if (generic) return withVisual({ ...generic, sceneTemplateId, generator: 'generic' });
  if (sceneTemplateId === 'dt-cqt-concept') {
    return withVisual({
      title: 'DT/CQT 测试：移动采样与定点复测',
      subtitle: '把采样方式、采样位置和结论证据分清',
      mode: 'dt-cqt',
      scenes: ['01 移动采样', '02 定点复测', '03 合并证据'],
      items: [['DT', '路线'], ['CQT', '定点'], ['GPS', '位置'], ['报告', '结论']],
      colors: ['#0f766e', '#e11d48', '#2563eb', '#f59e0b'],
      sceneTemplateId,
      generator: 'dt-cqt',
    });
  }
  if (project === 'P08' && sceneTemplateId === 'kpi-curve') {
    return withVisual({ ...GENERIC_TEMPLATES['P08:kpi-curve'], sceneTemplateId, generator: 'special-monitoring' });
  }
  if (project === 'P09' && sceneTemplateId === 'parameter-decision-tree') {
    return withVisual({ ...GENERIC_TEMPLATES['P09:parameter-decision-tree'], sceneTemplateId, generator: 'special-parameter-tree' });
  }
  if (project === 'P12' && sceneTemplateId === 'p12-validation-before-after') {
    return withVisual({ ...GENERIC_TEMPLATES['P12:p12-validation-before-after'], sceneTemplateId, generator: 'special-validation' });
  }
  if (sceneTemplateId === 'signaling-procedure-ladder') {
    return withVisual({
      title: '关键信令流程：按角色和方向读懂时序',
      subtitle: '从 UE 到核心网，跟踪消息角色、方向和停顿点',
      mode: 'signaling-procedure',
      scenes: ['01 角色入场', '02 消息流动', '03 定位断点'],
      items: [['UE', '发起'], ['gNB', '接入'], ['AMF', '注册'], ['UPF', '承载']],
      colors: ['#2563eb', '#0f766e', '#7c3aed', '#e11d48'],
      sceneTemplateId,
      generator: 'signaling-procedure',
    });
  }
  if (sceneTemplateId === 'signaling-fault-ladder') {
    return withVisual({
      title: '信令问题分析：从失败返回找根因',
      subtitle: '把拒绝、超时和回退证据放在同一时序上',
      mode: 'signaling-fault',
      scenes: ['01 失败返回', '02 定位节点', '03 收敛根因'],
      items: [['Reject', '拒绝'], ['Timer', '超时'], ['Cause', '原因'], ['Rollback', '回退']],
      colors: ['#e11d48', '#f59e0b', '#2563eb', '#0f766e'],
      sceneTemplateId,
      generator: 'signaling-fault',
    });
  }
  return withVisual({
    title: `${project} 关键概念`,
    subtitle: '用少量图形解释一个核心原理',
    mode: 'flow',
    scenes: ['01 看对象', '02 看过程', '03 看结论'],
    items: [['概念', '对象'], ['流程', '动作'], ['证据', '观察'], ['交付', '结论']],
    colors: ['#0f766e', '#2563eb', '#f59e0b', '#7c3aed'],
    sceneTemplateId,
    generator: 'fallback',
  });
}

export function manimManifestCopyFor(project, templateId) {
  const spec = manimSceneSpecFor(project, templateId);
  return {
    title: spec.title,
    body: spec.subtitle,
  };
}

function sceneTemplateFor(project, templateId) {
  return manimSceneTemplateFor(project, templateId);
}

export function manimVisualSignatureFor(project, templateId, sceneTemplateId = manimSceneTemplateFor(project, templateId)) {
  return MANIM_VISUAL_SIGNATURES[`${project}:${templateId}`]
    ?? MANIM_VISUAL_SIGNATURES[`${project}:${sceneTemplateId}`]
    ?? {
      signature: `${String(project).toLowerCase()}-${sceneTemplateId}-visual-signature`,
      motif: 'fallback-knowledge-map',
      learningFocus: 'show the core object, process, evidence, and conclusion as separate visual layers',
      primitives: ['core-object', 'process-flow', 'evidence-card', 'conclusion-mark'],
    };
}

export function manimKnowledgeParametersFor(project, templateId, sceneTemplateId = manimSceneTemplateFor(project, templateId)) {
  return MANIM_KNOWLEDGE_PARAMETERS[`${project}:${templateId}`]
    ?? MANIM_KNOWLEDGE_PARAMETERS[`${project}:${sceneTemplateId}`]
    ?? {
      unitId: `${project}-ku-manim`,
      knowledgePoint: `${project} 核心知识点`,
      engineeringObject: '5G 工程对象',
      primaryMetric: 'KPI/证据口径',
      evidence: ['KPI', '日志', '复测'],
      decisionRule: '本页动画必须服务一个可复核判断',
    };
}

function visualSpecFields(project, templateId, sceneTemplateId) {
  const visual = manimVisualSignatureFor(project, templateId, sceneTemplateId);
  return {
    visualSignature: visual.signature,
    visualMotif: visual.motif,
    learningFocus: visual.learningFocus,
    visualPrimitives: [...visual.primitives],
    knowledgeParameters: manimKnowledgeParametersFor(project, templateId, sceneTemplateId),
  };
}

function visualHeaderFor(project, templateId, sceneTemplateId) {
  const visual = manimVisualSignatureFor(project, templateId, sceneTemplateId);
  const params = manimKnowledgeParametersFor(project, templateId, sceneTemplateId);
  return [
    `# dgbook-visual-signature: ${visual.signature}`,
    `# dgbook-visual-motif: ${visual.motif}`,
    `# dgbook-learning-focus: ${visual.learningFocus}`,
    `# dgbook-visual-primitives: ${visual.primitives.join(', ')}`,
    `# dgbook-knowledge-parameters: ${params.unitId}; ${params.knowledgePoint}; ${params.primaryMetric}`,
    '',
  ].join('\n');
}

function withVisualSignatureHeader(source, project, templateId, sceneTemplateId) {
  return `${visualHeaderFor(project, templateId, sceneTemplateId)}${source}`;
}

function pyString(value) {
  return JSON.stringify(String(value));
}

function pyList(values) {
  return `[${values.map(pyString).join(', ')}]`;
}

function pyPairs(values) {
  return `[${values.map(([a, b]) => `(${pyString(a)}, ${pyString(b)})`).join(', ')}]`;
}
