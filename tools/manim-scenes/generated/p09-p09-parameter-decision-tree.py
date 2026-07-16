# dgbook-visual-signature: parameter-risk-decision-tree
# dgbook-visual-motif: risk-tree
# dgbook-learning-focus: check parameter target, difference, impact radius, and rollback condition before change
# dgbook-visual-primitives: decision-root, risk-branches, impact-radius, rollback-gate
# dgbook-knowledge-parameters: P09-ku-parameter-risk; 参数变更前必须评估对象、差异、影响半径和回退条件; 参数差异/邻区影响/回退可用性
from manim import *
import numpy as np


class P09P09ParameterDecisionTree(Scene):
    def label(self, text, size=22, color=WHITE):
        return Text(text, font="Microsoft YaHei", font_size=size, color=color)

    def stage(self, text):
        tag = RoundedRectangle(width=2.88, height=0.42, corner_radius=0.12, color="#7c3aed", fill_color="#f5f3ff", fill_opacity=1)
        word = self.label(text, 18, "#7c3aed").move_to(tag)
        return VGroup(tag, word).move_to(LEFT * 4.52 + UP * 2.18)

    def chip(self, text, color, width=1.42):
        box = RoundedRectangle(width=width, height=0.48, corner_radius=0.12, color=color, fill_color=color, fill_opacity=0.12)
        word = self.label(text, 15, color).move_to(box)
        return VGroup(box, word)

    def trans(self, page, stage, next_text):
        next_stage = self.stage(next_text)
        self.play(FadeOut(page, shift=LEFT * 0.45), ReplacementTransform(stage, next_stage), run_time=0.75)
        return next_stage

    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("P09 参数差异：从清单走到风险树", 30, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("不是看到差异就改，而是先判断影响面、风险级别和回退条件", 18, "#7c3aed").next_to(title, DOWN, buff=0.1)
        stage = self.stage("01 差异识别")
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.25)

        left_panel = RoundedRectangle(width=3.85, height=3.24, corner_radius=0.16, color="#bfdbfe", fill_color="#eff6ff", fill_opacity=0.94).move_to(LEFT * 2.45 + DOWN * 0.05)
        right_panel = RoundedRectangle(width=3.85, height=3.24, corner_radius=0.16, color="#fecdd3", fill_color="#fff1f2", fill_opacity=0.94).move_to(RIGHT * 2.45 + DOWN * 0.05)
        left_title = self.label("基线参数", 20, "#2563eb").move_to(left_panel.get_top() + DOWN * 0.35)
        right_title = self.label("现网参数", 20, "#e11d48").move_to(right_panel.get_top() + DOWN * 0.35)
        rows = VGroup()
        params = [("PCI", "112", "112", "#0f766e"), ("SSB功率", "18", "21", "#f59e0b"), ("邻区A3", "3dB", "1dB", "#e11d48"), ("切换迟滞", "2dB", "0dB", "#e11d48")]
        for i, (name, base, now, color) in enumerate(params):
            y = 0.82 - i * 0.55
            rows.add(VGroup(
                self.label(name, 16, "#334155").move_to(LEFT * 3.45 + UP * y),
                self.label(base, 17, "#2563eb").move_to(LEFT * 1.7 + UP * y),
                self.label(name, 16, "#334155").move_to(RIGHT * 1.45 + UP * y),
                self.label(now, 17, color).move_to(RIGHT * 3.25 + UP * y),
                DashedLine(LEFT * 0.25 + UP * y, RIGHT * 0.25 + UP * y, color=color, dash_length=0.09),
            ))
        diff_badges = VGroup(
            self.chip("可接受", "#0f766e", 1.22).move_to(RIGHT * 4.55 + UP * 0.82),
            self.chip("需评估", "#f59e0b", 1.22).move_to(RIGHT * 4.55 + UP * 0.27),
            self.chip("高风险", "#e11d48", 1.22).move_to(RIGHT * 4.55 + DOWN * 0.28),
            self.chip("高风险", "#e11d48", 1.22).move_to(RIGHT * 4.55 + DOWN * 0.83),
        )
        page = VGroup(left_panel, right_panel, left_title, right_title, rows, diff_badges)
        self.play(Create(left_panel), Create(right_panel), FadeIn(left_title), FadeIn(right_title), run_time=0.95)
        self.play(LaggedStart(*[FadeIn(row, shift=UP * 0.08) for row in rows], lag_ratio=0.1), run_time=1.25)
        self.play(LaggedStart(*[FadeIn(badge, shift=LEFT * 0.1) for badge in diff_badges], lag_ratio=0.1), Indicate(rows[2], color="#e11d48"), run_time=1.15)
        stage = self.trans(page, stage, "02 风险树展开")

        root = self.chip("参数差异", "#7c3aed", 1.58).move_to(UP * 1.35)
        branches = VGroup(
            self.chip("覆盖风险", "#2563eb", 1.42).move_to(LEFT * 3.6 + UP * 0.28),
            self.chip("干扰风险", "#f59e0b", 1.42).move_to(LEFT * 1.18 + DOWN * 0.05),
            self.chip("切换风险", "#e11d48", 1.42).move_to(RIGHT * 1.18 + DOWN * 0.05),
            self.chip("容量风险", "#0f766e", 1.42).move_to(RIGHT * 3.6 + UP * 0.28),
        )
        leaves = VGroup(
            self.chip("弱覆盖", "#2563eb", 1.16).move_to(LEFT * 4.1 + DOWN * 1.05),
            self.chip("越区", "#2563eb", 1.0).move_to(LEFT * 3.05 + DOWN * 1.55),
            self.chip("SINR跌落", "#f59e0b", 1.28).move_to(LEFT * 1.3 + DOWN * 1.42),
            self.chip("乒乓切换", "#e11d48", 1.28).move_to(RIGHT * 1.05 + DOWN * 1.42),
            self.chip("掉线", "#e11d48", 1.0).move_to(RIGHT * 2.05 + DOWN * 1.55),
            self.chip("拥塞", "#0f766e", 1.0).move_to(RIGHT * 3.7 + DOWN * 1.34),
        )
        lines = VGroup()
        for node in branches:
            lines.add(Line(root.get_bottom(), node.get_top(), color="#94a3b8", stroke_width=4))
        for index, node in enumerate(leaves):
            parent = branches[0] if index < 2 else branches[1] if index == 2 else branches[2] if index < 5 else branches[3]
            lines.add(Line(parent.get_bottom(), node.get_top(), color="#cbd5e1", stroke_width=3))
        heat = VGroup(Circle(radius=0.42, color="#e11d48", stroke_width=5).move_to(branches[2]), self.label("P1", 18, "#e11d48").move_to(branches[2].get_center() + UP * 0.58))
        page = VGroup(lines, root, branches, leaves, heat)
        self.play(FadeIn(root, scale=1.08), run_time=0.5)
        self.play(LaggedStart(*[Create(line) for line in lines[:4]], lag_ratio=0.08), LaggedStart(*[FadeIn(node, shift=DOWN * 0.1) for node in branches], lag_ratio=0.08), run_time=1.2)
        self.play(LaggedStart(*[Create(line) for line in lines[4:]], lag_ratio=0.06), LaggedStart(*[FadeIn(node, shift=UP * 0.08) for node in leaves], lag_ratio=0.07), run_time=1.35)
        self.play(GrowFromCenter(heat[0]), FadeIn(heat[1]), Indicate(branches[2], color="#e11d48"), run_time=1.0)
        stage = self.trans(page, stage, "03 决策门控")

        gates = VGroup(
            self.chip("白名单", "#2563eb", 1.3).move_to(LEFT * 4.0 + UP * 0.52),
            self.chip("影响面", "#7c3aed", 1.3).move_to(LEFT * 2.0 + UP * 0.52),
            self.chip("仿真", "#f59e0b", 1.06).move_to(ORIGIN + UP * 0.52),
            self.chip("小区试改", "#e11d48", 1.42).move_to(RIGHT * 2.0 + UP * 0.52),
            self.chip("回退条件", "#0f766e", 1.42).move_to(RIGHT * 4.0 + UP * 0.52),
        )
        rails = VGroup(*[
            Arrow(gates[i].get_right(), gates[i + 1].get_left(), buff=0.1, color="#64748b", stroke_width=4, max_tip_length_to_length_ratio=0.12)
            for i in range(len(gates) - 1)
        ])
        decision = RoundedRectangle(width=2.5, height=0.76, corner_radius=0.16, color="#0f766e", fill_color="#ecfdf5", fill_opacity=1).move_to(DOWN * 1.05)
        decision_text = self.label("满足门控才执行", 20, "#0f766e").move_to(decision)
        rollback = Arrow(gates[-1].get_bottom(), decision.get_right(), buff=0.16, color="#0f766e", stroke_width=4, max_tip_length_to_length_ratio=0.12)
        block = VGroup(
            self.chip("缺证据", "#e11d48", 1.18).move_to(LEFT * 2.0 + DOWN * 1.72),
            self.label("暂停修改", 17, "#e11d48").move_to(LEFT * 0.65 + DOWN * 1.72),
            Arrow(LEFT * 1.42 + DOWN * 1.72, LEFT * 0.98 + DOWN * 1.72, buff=0.05, color="#e11d48", stroke_width=4, max_tip_length_to_length_ratio=0.16),
        )
        self.play(LaggedStart(*[FadeIn(gate, shift=UP * 0.12) for gate in gates], lag_ratio=0.1), run_time=1.0)
        self.play(LaggedStart(*[GrowArrow(rail) for rail in rails], lag_ratio=0.1), GrowArrow(rollback), FadeIn(decision, shift=UP * 0.14), Write(decision_text), run_time=1.25)
        self.play(FadeIn(block, shift=RIGHT * 0.12), Indicate(gates[-1], color="#0f766e"), run_time=1.0)
        self.wait(3.2)
