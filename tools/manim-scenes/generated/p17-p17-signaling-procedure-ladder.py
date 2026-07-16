# dgbook-visual-signature: signaling-procedure-role-ladder
# dgbook-visual-motif: role-ladder
# dgbook-learning-focus: read signaling by role lanes, message direction, stop point, and procedure result
# dgbook-visual-primitives: ue-lane, gnb-lane, core-lanes, message-arrows
# dgbook-knowledge-parameters: P17-ku-signaling-procedure; 信令流程要按角色泳道、消息方向和停顿点读时序; RRC/NAS/PDU/用户面顺序
from manim import *


class P17P17SignalingProcedureLadder(Scene):
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
