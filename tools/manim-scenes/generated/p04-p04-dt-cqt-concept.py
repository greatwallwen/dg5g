# dgbook-visual-signature: dt-route-cqt-point-contrast
# dgbook-visual-motif: route-versus-fixed-point
# dgbook-learning-focus: contrast continuous DT sampling with fixed CQT experience checkpoints
# dgbook-visual-primitives: drive-route, sample-dots, fixed-rings, merged-report
# dgbook-knowledge-parameters: P04-ku-dt-cqt-sampling; DT 看连续道路采样，CQT 看关键点体验; 采样点密度/RSRP/SINR/业务成功率
from manim import *
import numpy as np


class P04P04DtCqtConcept(Scene):
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
