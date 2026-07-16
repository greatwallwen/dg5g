# dgbook-visual-signature: signaling-fault-root-cause-ladder
# dgbook-visual-motif: fault-ladder
# dgbook-learning-focus: trace reject, timeout, cause value, and rollback evidence on one signaling timeline
# dgbook-visual-primitives: reject-arrow, timer-gap, cause-card, rollback-path
# dgbook-knowledge-parameters: P18-ku-signaling-fault; 信令故障要把拒绝、超时、原因值和回退证据放在同一时间线; Reject/Timer/Cause/回退路径
from manim import *


class P18P18SignalingFaultLadder(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.86, height=0.42, corner_radius=0.12, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1)
        word = self.label(text, 18, "#0f766e").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.5 + UP * 2.18)

    def chip(self, text, color, width=1.38):
        box = RoundedRectangle(width=width, height=0.46, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 15, color).move_to(box)
        return VGroup(box, word)

    def trans(self, page, stage, next_text):
        next_stage = self.stage(next_text)
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.75)
        return next_stage

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("P18 信令故障诊断：从失败点追到根因", 30, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("按时间线锁失败消息，再串起日志、计时器、配置和复测证据", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 失败点定位")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.25)

        names = ["UE", "gNB", "AMF", "SMF", "UPF"]
        xs = [-4.8, -2.4, 0.0, 2.4, 4.8]
        lanes = VGroup()
        for name, x in zip(names, xs):
            top = self.chip(name, "#0f172a", 1.0).move_to(RIGHT * x + UP * 1.54)
            line = DashedLine(RIGHT * x + UP * 1.2, RIGHT * x + DOWN * 1.72, color="#94a3b8", dash_length=0.13)
            lanes.add(VGroup(top, line))
        messages = [
            (0, 1, 0.92, "RRC建立", "#2563eb"),
            (1, 2, 0.38, "初始注册", "#0f766e"),
            (2, 3, -0.18, "会话请求", "#7c3aed"),
            (3, 2, -0.74, "DNN失败", "#e11d48"),
            (2, 0, -1.28, "Reject #27", "#e11d48"),
        ]
        packet = Dot(color="#f59e0b", radius=0.09).move_to(RIGHT * xs[0] + UP * messages[0][2])
        arrows = VGroup()
        tags = VGroup()
        self.play(LaggedStart(*[FadeIn(lane, shift=DOWN * 0.1) for lane in lanes], lag_ratio=0.08), FadeIn(packet, scale=1.35), run_time=1.2)
        for src, dst, y, label, color in messages:
            arrow = Arrow(RIGHT * xs[src] + UP * y, RIGHT * xs[dst] + UP * (y - 0.12), buff=0.14, color=color, stroke_width=5, max_tip_length_to_length_ratio=0.08)
            tag = self.chip(label, color, 1.26 if len(label) < 7 else 1.55).scale(0.84).next_to(arrow, UP, buff=0.04)
            arrows.add(arrow)
            tags.add(tag)
            self.play(GrowArrow(arrow), FadeIn(tag, shift=UP * 0.06), MoveAlongPath(packet, arrow), run_time=1.22, rate_func=smooth)
        focus = SurroundingRectangle(VGroup(arrows[-2], tags[-2], arrows[-1], tags[-1]), color="#e11d48", buff=0.16)
        fail = VGroup(Line(LEFT * 0.16 + DOWN * 0.16, RIGHT * 0.16 + UP * 0.16, color="#e11d48", stroke_width=7), Line(LEFT * 0.16 + UP * 0.16, RIGHT * 0.16 + DOWN * 0.16, color="#e11d48", stroke_width=7)).move_to(arrows[-1].get_center())
        page = VGroup(lanes, packet, arrows, tags, focus, fail)
        self.play(Create(focus), FadeIn(fail, scale=1.2), run_time=0.9)
        stage = self.trans(page, stage, "02 证据链归因")

        chain = VGroup(
            self.chip("时间窗", "#2563eb", 1.22).move_to(LEFT * 4.2 + UP * 0.72),
            self.chip("失败码", "#e11d48", 1.22).move_to(LEFT * 2.18 + UP * 0.72),
            self.chip("AMF日志", "#7c3aed", 1.32).move_to(LEFT * 0.08 + UP * 0.72),
            self.chip("SMF日志", "#7c3aed", 1.32).move_to(RIGHT * 2.08 + UP * 0.72),
            self.chip("配置核查", "#f59e0b", 1.42).move_to(RIGHT * 4.2 + UP * 0.72),
        )
        links = VGroup(*[
            Arrow(chain[i].get_right(), chain[i + 1].get_left(), buff=0.1, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12)
            for i in range(len(chain) - 1)
        ])
        evidence_box = RoundedRectangle(width=6.8, height=1.44, corner_radius=0.16, color="#fed7aa", fill_color="#fff7ed", fill_opacity=0.95).move_to(DOWN * 0.9)
        evidence = VGroup(
            self.label("DNN slice mismatch", 20, "#9a3412").move_to(evidence_box.get_center() + UP * 0.28),
            self.label("同一时间窗内 SMF 返回 reject，UPF 未建承载", 16, "#334155").move_to(evidence_box.get_center() + DOWN * 0.18),
        )
        root = VGroup(Circle(radius=0.42, color="#e11d48", fill_color="#fff1f2", fill_opacity=1), self.label("根因", 18, "#e11d48")).move_to(RIGHT * 4.2 + DOWN * 1.85)
        root_arrow = Arrow(evidence_box.get_right(), root.get_left(), buff=0.12, color="#e11d48", stroke_width=4, max_tip_length_to_length_ratio=0.12)
        page = VGroup(chain, links, evidence_box, evidence, root, root_arrow)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.12) for node in chain], lag_ratio=0.08), run_time=0.9)
        self.play(LaggedStart(*[GrowArrow(link) for link in links], lag_ratio=0.08), run_time=0.9)
        self.play(FadeIn(evidence_box, shift=UP * 0.12), Write(evidence), GrowArrow(root_arrow), FadeIn(root, scale=1.08), run_time=1.45)
        self.play(Indicate(root, color="#e11d48"), run_time=0.9)
        stage = self.trans(page, stage, "03 修复复测")

        fix_nodes = VGroup(
            self.chip("修正DNN", "#f59e0b", 1.42).move_to(LEFT * 3.85 + UP * 0.8),
            self.chip("刷新策略", "#2563eb", 1.42).move_to(LEFT * 1.3 + UP * 0.8),
            self.chip("重跑信令", "#7c3aed", 1.42).move_to(RIGHT * 1.3 + UP * 0.8),
            self.chip("业务成功", "#0f766e", 1.42).move_to(RIGHT * 3.85 + UP * 0.8),
        )
        fix_arrows = VGroup(*[
            Arrow(fix_nodes[i].get_right(), fix_nodes[i + 1].get_left(), buff=0.12, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12)
            for i in range(3)
        ])
        mini_lanes = VGroup()
        mini_xs = [-3.4, -1.7, 0, 1.7, 3.4]
        for name, x in zip(names, mini_xs):
            mini_lanes.add(VGroup(self.label(name, 15, "#334155").move_to(RIGHT * x + DOWN * 0.25), DashedLine(RIGHT * x + DOWN * 0.42, RIGHT * x + DOWN * 1.95, color="#cbd5e1", dash_length=0.1)))
        ok_messages = VGroup()
        ok_pairs = [(0, 1, -0.72, "#2563eb"), (1, 2, -0.98, "#0f766e"), (2, 3, -1.24, "#7c3aed"), (3, 4, -1.5, "#0f766e")]
        for src, dst, y, color in ok_pairs:
            ok_messages.add(Arrow(RIGHT * mini_xs[src] + UP * y, RIGHT * mini_xs[dst] + UP * (y - 0.08), buff=0.1, color=color, stroke_width=4, max_tip_length_to_length_ratio=0.1))
        pass_mark = VGroup(Circle(radius=0.38, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1), self.label("OK", 18, "#0f766e")).move_to(RIGHT * 4.55 + DOWN * 1.18)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.12) for node in fix_nodes], lag_ratio=0.1), run_time=0.95)
        self.play(LaggedStart(*[GrowArrow(arrow) for arrow in fix_arrows], lag_ratio=0.1), FadeIn(mini_lanes), run_time=1.05)
        self.play(LaggedStart(*[GrowArrow(msg) for msg in ok_messages], lag_ratio=0.14), FadeIn(pass_mark, scale=1.1), run_time=1.45)
        self.play(Indicate(fix_nodes[-1], color="#0f766e"), run_time=0.9)
        self.wait(3.6)
