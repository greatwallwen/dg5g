# dgbook-visual-signature: validation-before-after-delta-loop
# dgbook-visual-motif: before-after-delta
# dgbook-learning-focus: compare before and after optimization on a shared validation scale
# dgbook-visual-primitives: before-bars, after-bars, delta-arrow, validation-loop
# dgbook-knowledge-parameters: P12-ku-before-after-validation; 优化结果必须用同口径前后数据验证; 基线/复测/目标阈值差值
from manim import *
import numpy as np


class P12P12OptimizationValidationLoop(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.92, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.48 + UP * 2.18)

    def chip(self, text, color, width=1.4):
        box = RoundedRectangle(width=width, height=0.48, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 15, color).move_to(box)
        return VGroup(box, word)

    def trans(self, page, stage, next_text):
        next_stage = self.stage(next_text)
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.75)
        return next_stage

    def metric_bar(self, name, value, color, x):
        base = Line(DOWN * 1.45 + RIGHT * x, UP * 1.18 + RIGHT * x, color="#cbd5e1", stroke_width=3)
        bar = Rectangle(width=0.48, height=value, color=color, fill_color=color, fill_opacity=0.72).move_to(DOWN * 1.45 + UP * value / 2 + RIGHT * x)
        label = self.label(name, 15, color).next_to(bar, DOWN, buff=0.12)
        return VGroup(base, bar, label)

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("P12 优化验证：前后对比到闭环结论", 30, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("同路线、同时间窗、同指标口径，避免只看单点改善", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 优化前基线")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.25)

        area = RoundedRectangle(width=8.4, height=3.24, corner_radius=0.16, color="#fecdd3", fill_color="#fff1f2", fill_opacity=0.92).shift(DOWN * 0.08)
        route = VMobject(color="#e11d48", stroke_width=6).set_points_smoothly([LEFT * 3.75 + DOWN * 1.0, LEFT * 2.25 + UP * 0.62, LEFT * 0.8 + DOWN * 0.42, RIGHT * 0.55 + UP * 0.22, RIGHT * 2.2 + DOWN * 0.55, RIGHT * 3.62 + UP * 0.72])
        holes = VGroup(*[Circle(radius=r, color="#e11d48", fill_color="#fee2e2", fill_opacity=0.62).move_to(pos) for r, pos in [(0.42, LEFT * 1.0 + DOWN * 0.32), (0.34, RIGHT * 2.1 + DOWN * 0.54), (0.28, RIGHT * 3.1 + UP * 0.42)]])
        bars = VGroup(
            self.metric_bar("RSRP", 0.86, "#e11d48", -3.18).scale(0.8).shift(DOWN * 0.16),
            self.metric_bar("SINR", 1.02, "#f59e0b", -2.24).scale(0.8).shift(DOWN * 0.16),
            self.metric_bar("DL", 0.72, "#e11d48", -1.3).scale(0.8).shift(DOWN * 0.16),
        )
        baseline = self.chip("投诉高发", "#e11d48", 1.46).move_to(RIGHT * 3.5 + DOWN * 1.42)
        page = VGroup(area, route, holes, bars, baseline)
        self.play(Create(area), Create(route), run_time=1.0)
        self.play(LaggedStart(*[GrowFromCenter(hole) for hole in holes], lag_ratio=0.12), LaggedStart(*[FadeIn(bar, shift=UP * 0.1) for bar in bars], lag_ratio=0.08), FadeIn(baseline, shift=UP * 0.1), run_time=1.35)
        self.play(Indicate(holes[1], color="#e11d48"), run_time=0.9)
        stage = self.trans(page, stage, "02 优化后复测")

        area = RoundedRectangle(width=8.4, height=3.24, corner_radius=0.16, color="#bbf7d0", fill_color="#f0fdf4", fill_opacity=0.92).shift(DOWN * 0.08)
        before = VMobject(color="#e11d48", stroke_width=4).set_points_smoothly([LEFT * 3.75 + DOWN * 1.0, LEFT * 2.25 + UP * 0.62, LEFT * 0.8 + DOWN * 0.42, RIGHT * 0.55 + UP * 0.22, RIGHT * 2.2 + DOWN * 0.55, RIGHT * 3.62 + UP * 0.72]).set_opacity(0.38)
        after = VMobject(color="#0f766e", stroke_width=6).set_points_smoothly([LEFT * 3.75 + DOWN * 0.9, LEFT * 2.25 + UP * 0.45, LEFT * 0.8 + DOWN * 0.05, RIGHT * 0.55 + UP * 0.36, RIGHT * 2.2 + DOWN * 0.08, RIGHT * 3.62 + UP * 0.82])
        sample_points = VGroup(*[Dot(point, radius=0.055, color="#0f766e") for point in after.get_points()[::max(1, len(after.get_points()) // 8)]])
        bars = VGroup(
            self.metric_bar("RSRP", 1.42, "#0f766e", -3.18).scale(0.8).shift(DOWN * 0.16),
            self.metric_bar("SINR", 1.48, "#0f766e", -2.24).scale(0.8).shift(DOWN * 0.16),
            self.metric_bar("DL", 1.55, "#0f766e", -1.3).scale(0.8).shift(DOWN * 0.16),
        )
        delta = VGroup(
            self.chip("同路线", "#2563eb", 1.26).move_to(RIGHT * 2.12 + DOWN * 1.42),
            self.chip("同时间窗", "#7c3aed", 1.42).move_to(RIGHT * 3.62 + DOWN * 1.42),
        )
        page = VGroup(area, before, after, sample_points, bars, delta)
        self.play(Create(area), Create(before), run_time=0.85)
        self.play(Create(after), LaggedStart(*[FadeIn(dot, scale=1.4) for dot in sample_points], lag_ratio=0.08), run_time=1.35)
        self.play(LaggedStart(*[FadeIn(bar, shift=UP * 0.1) for bar in bars], lag_ratio=0.08), FadeIn(delta, shift=UP * 0.1), run_time=1.2)
        self.play(Indicate(after, color="#0f766e"), run_time=0.9)
        stage = self.trans(page, stage, "03 验证闭环")

        nodes = VGroup(
            self.chip("基线", "#e11d48", 1.16).move_to(LEFT * 3.75 + UP * 0.78),
            self.chip("动作", "#f59e0b", 1.16).move_to(LEFT * 1.25 + UP * 0.78),
            self.chip("复测", "#2563eb", 1.16).move_to(RIGHT * 1.25 + UP * 0.78),
            self.chip("结论", "#0f766e", 1.16).move_to(RIGHT * 3.75 + UP * 0.78),
        )
        arrows = VGroup(*[
            Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.12, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12)
            for i in range(3)
        ])
        compare_box = RoundedRectangle(width=5.7, height=1.34, corner_radius=0.16, color="#cbd5e1", fill_color="#ffffff", fill_opacity=0.9).move_to(DOWN * 0.68)
        checks = VGroup(
            self.chip("覆盖达标", "#0f766e", 1.42).move_to(LEFT * 1.9 + DOWN * 0.68),
            self.chip("质量达标", "#0f766e", 1.42).move_to(ORIGIN + DOWN * 0.68),
            self.chip("投诉下降", "#0f766e", 1.42).move_to(RIGHT * 1.9 + DOWN * 0.68),
        )
        fail_branch = VGroup(
            Arrow(nodes[2].get_bottom(), LEFT * 1.25 + DOWN * 1.64, buff=0.12, color="#e11d48", stroke_width=4, max_tip_length_to_length_ratio=0.12),
            self.chip("未达标回滚", "#e11d48", 1.64).move_to(LEFT * 1.25 + DOWN * 1.9),
        )
        pass_mark = VGroup(Circle(radius=0.42, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1), self.label("归档", 18, "#0f766e")).move_to(RIGHT * 3.75 + DOWN * 1.32)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.12) for node in nodes], lag_ratio=0.1), run_time=0.95)
        self.play(LaggedStart(*[GrowArrow(arrow) for arrow in arrows], lag_ratio=0.1), Create(compare_box), run_time=1.1)
        self.play(LaggedStart(*[FadeIn(check, shift=UP * 0.1) for check in checks], lag_ratio=0.1), FadeIn(fail_branch, shift=UP * 0.1), run_time=1.2)
        self.play(FadeIn(pass_mark, scale=1.08), Indicate(checks, color="#0f766e"), run_time=1.0)
        self.wait(3.4)
