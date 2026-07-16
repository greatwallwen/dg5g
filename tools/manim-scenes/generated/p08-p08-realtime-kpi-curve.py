# dgbook-visual-signature: realtime-monitoring-topn-correlation
# dgbook-visual-motif: monitoring-correlation
# dgbook-learning-focus: align alarm, KPI curve, TOPN list, and closed-loop action on one time window
# dgbook-visual-primitives: time-window, multi-kpi-curves, topn-list, action-loop
# dgbook-knowledge-parameters: P08-ku-realtime-monitoring; 运行监控要把告警、KPI 曲线、TOPN 和闭环动作对齐; 15 分钟 KPI/告警/TOPN 同窗
from manim import *
import numpy as np


class P08P08RealtimeKpiCurve(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.78, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.58 + UP * 2.18)

    def chip(self, text, color, width=1.38):
        box = RoundedRectangle(width=width, height=0.48, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 15, color).move_to(box)
        return VGroup(box, word)

    def trans(self, page, stage, next_text):
        next_stage = self.stage(next_text)
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.75)
        return next_stage

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("P08 运行监控：告警、KPI 与 TOPN 闭环", 30, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("先看同窗波动，再把异常压到 TOPN 清单和处置回看", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 监控触发")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.25)

        axes = Axes(x_range=[0, 6, 1], y_range=[0, 6, 1], x_length=8.4, y_length=3.0, tips=False, axis_config={"color": "#cbd5e1"}).shift(DOWN * 0.22)
        rsrp = axes.plot(lambda x: 3.9 - 1.15 * np.exp(-((x - 4.35) ** 2) / 0.2) + 0.18 * np.sin(x * 2.1), color="#2563eb", stroke_width=5)
        sinr = axes.plot(lambda x: 3.05 - 0.95 * np.exp(-((x - 4.1) ** 2) / 0.26) + 0.22 * np.cos(x * 1.6), color="#0f766e", stroke_width=5)
        prb = axes.plot(lambda x: 1.65 + 1.42 * np.exp(-((x - 4.25) ** 2) / 0.34) + 0.12 * np.sin(x), color="#f59e0b", stroke_width=5)
        threshold = DashedLine(axes.c2p(0, 2.55), axes.c2p(6, 2.55), color="#e11d48", dash_length=0.13)
        window = Rectangle(width=1.35, height=3.0, color="#e11d48", fill_color="#fee2e2", fill_opacity=0.25).move_to(axes.c2p(4.25, 3.0))
        cursor = Line(axes.c2p(4.25, 0.35), axes.c2p(4.25, 5.55), color="#e11d48", stroke_width=4)
        labels = VGroup(
            self.chip("RSRP跌落", "#2563eb", 1.5).move_to(LEFT * 3.4 + DOWN * 1.92),
            self.chip("SINR恶化", "#0f766e", 1.5).move_to(LEFT * 1.38 + DOWN * 1.92),
            self.chip("PRB拥塞", "#f59e0b", 1.42).move_to(RIGHT * 0.58 + DOWN * 1.92),
            self.chip("告警触发", "#e11d48", 1.5).move_to(RIGHT * 2.58 + DOWN * 1.92),
        )
        alert = VGroup(
            RoundedRectangle(width=2.05, height=0.68, corner_radius=0.13, color="#e11d48", fill_color="#fff1f2", fill_opacity=1),
            self.label("ALARM", 18, "#e11d48").shift(UP * 0.11),
            self.label("15分钟异常", 13, "#7f1d1d").shift(DOWN * 0.15),
        ).move_to(RIGHT * 3.45 + UP * 1.42)
        page = VGroup(axes, rsrp, sinr, prb, threshold, window, cursor, labels, alert)
        self.play(Create(axes), run_time=0.8)
        self.play(Create(rsrp), Create(sinr), Create(prb), run_time=1.7)
        self.play(FadeIn(window), Create(threshold), Create(cursor), FadeIn(alert, shift=LEFT * 0.16), run_time=1.2)
        self.play(LaggedStart(*[FadeIn(item, shift=UP * 0.12) for item in labels], lag_ratio=0.1), Indicate(alert, color="#e11d48"), run_time=1.2)
        stage = self.trans(page, stage, "02 TOPN定位")

        panel = RoundedRectangle(width=8.2, height=3.38, corner_radius=0.16, color="#dbeafe", fill_color="#eff6ff", fill_opacity=0.92).shift(DOWN * 0.08)
        headers = VGroup(
            self.label("小区", 16, "#334155").move_to(LEFT * 3.58 + UP * 1.3),
            self.label("告警", 16, "#334155").move_to(LEFT * 1.95 + UP * 1.3),
            self.label("KPI偏离", 16, "#334155").move_to(RIGHT * 0.05 + UP * 1.3),
            self.label("处置优先级", 16, "#334155").move_to(RIGHT * 2.65 + UP * 1.3),
        )
        rows = VGroup()
        data = [("Cell-07", 0.92, "P1", "#e11d48"), ("Cell-12", 0.74, "P2", "#f59e0b"), ("Cell-03", 0.58, "P3", "#2563eb"), ("Cell-18", 0.38, "观察", "#0f766e")]
        for i, (name, value, level, color) in enumerate(data):
            y = 0.72 - i * 0.64
            row_bg = RoundedRectangle(width=7.55, height=0.48, corner_radius=0.1, color=color, fill_color=color, fill_opacity=0.08).move_to(UP * y)
            bar_bg = Line(LEFT * 0.9 + UP * y, RIGHT * 1.15 + UP * y, color="#cbd5e1", stroke_width=8)
            bar = Line(LEFT * 0.9 + UP * y, LEFT * 0.9 + RIGHT * (2.05 * value) + UP * y, color=color, stroke_width=8)
            rows.add(VGroup(
                row_bg,
                self.label(name, 17, "#0f172a").move_to(LEFT * 3.42 + UP * y),
                self.label("多源", 15, color).move_to(LEFT * 1.95 + UP * y),
                bar_bg,
                bar,
                self.chip(level, color, 0.92).scale(0.86).move_to(RIGHT * 2.65 + UP * y),
            ))
        funnel = VGroup(
            Arrow(LEFT * 4.05 + DOWN * 1.48, LEFT * 2.55 + DOWN * 1.48, buff=0.08, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12),
            self.chip("告警池", "#e11d48", 1.25).move_to(LEFT * 4.62 + DOWN * 1.48),
            self.chip("TOPN", "#2563eb", 1.15).move_to(LEFT * 1.98 + DOWN * 1.48),
            Arrow(LEFT * 1.36 + DOWN * 1.48, RIGHT * 0.2 + DOWN * 1.48, buff=0.08, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12),
            self.chip("派单", "#f59e0b", 1.05).move_to(RIGHT * 0.76 + DOWN * 1.48),
        )
        page = VGroup(panel, headers, rows, funnel)
        self.play(Create(panel), FadeIn(headers), run_time=0.85)
        self.play(LaggedStart(*[FadeIn(row, shift=RIGHT * 0.12) for row in rows], lag_ratio=0.12), run_time=1.5)
        self.play(LaggedStart(*[FadeIn(item, shift=UP * 0.12) for item in funnel], lag_ratio=0.1), rows[0].animate.scale(1.04), run_time=1.2)
        self.play(Indicate(rows[0], color="#e11d48"), run_time=0.9)
        stage = self.trans(page, stage, "03 处置闭环")

        nodes = VGroup(
            self.chip("告警", "#e11d48", 1.24).move_to(LEFT * 3.65 + UP * 0.75),
            self.chip("TOPN", "#2563eb", 1.24).move_to(LEFT * 1.25 + UP * 0.75),
            self.chip("工单", "#f59e0b", 1.24).move_to(RIGHT * 1.25 + UP * 0.75),
            self.chip("复核", "#0f766e", 1.24).move_to(RIGHT * 3.65 + UP * 0.75),
        )
        arrows = VGroup(*[
            Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.12, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12)
            for i in range(3)
        ])
        loop = ArcBetweenPoints(nodes[-1].get_bottom(), nodes[0].get_bottom(), angle=-TAU / 3.2, color="#0f766e", stroke_width=4)
        loop_tip = Triangle(color="#0f766e", fill_color="#0f766e", fill_opacity=1).scale(0.09).rotate(-0.85).move_to(nodes[0].get_bottom() + RIGHT * 0.14 + DOWN * 0.12)
        before = VMobject(color="#e11d48", stroke_width=5).set_points_smoothly([LEFT * 3.2 + DOWN * 1.12, LEFT * 1.35 + DOWN * 0.55, RIGHT * 0.25 + DOWN * 1.22, RIGHT * 3.2 + DOWN * 0.9])
        after = VMobject(color="#0f766e", stroke_width=5).set_points_smoothly([LEFT * 3.2 + DOWN * 1.55, LEFT * 1.35 + DOWN * 1.2, RIGHT * 0.25 + DOWN * 1.28, RIGHT * 3.2 + DOWN * 1.16])
        compare = VGroup(
            self.label("异常KPI", 15, "#e11d48").next_to(before, LEFT, buff=0.18),
            self.label("复核达标", 15, "#0f766e").next_to(after, LEFT, buff=0.18),
            DashedLine(LEFT * 3.35 + DOWN * 1.3, RIGHT * 3.35 + DOWN * 1.3, color="#94a3b8", dash_length=0.12),
        )
        seal = VGroup(Circle(radius=0.34, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1), self.label("闭环", 17, "#0f766e")).move_to(RIGHT * 4.55 + DOWN * 1.18)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.14) for node in nodes], lag_ratio=0.12), run_time=1.0)
        self.play(LaggedStart(*[GrowArrow(arrow) for arrow in arrows], lag_ratio=0.12), Create(loop), FadeIn(loop_tip), run_time=1.2)
        self.play(Create(before), Create(after), FadeIn(compare), run_time=1.4)
        self.play(FadeIn(seal, scale=1.1), Indicate(nodes[-1], color="#0f766e"), run_time=1.0)
        self.wait(3.2)
