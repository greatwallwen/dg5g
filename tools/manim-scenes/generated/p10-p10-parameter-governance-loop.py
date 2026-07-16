# dgbook-visual-signature: parameter-governance-gate-matrix
# dgbook-visual-motif: gate-matrix
# dgbook-learning-focus: gate a parameter change through trigger, boundary, window, and trace rules
# dgbook-visual-primitives: trigger-cell, boundary-frame, change-window, trace-ledger
# dgbook-knowledge-parameters: P10-ku-parameter-governance; 参数调整需要触发、边界、窗口和留痕闸门; 触发阈值/变更窗口/留痕完整率
from manim import *
import numpy as np


class P10P10ParameterGovernanceLoop(Scene):
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

    def parameterGateIntro(self):
        title_chip = RoundedRectangle(width=2.2, height=0.52, corner_radius=0.14, color="#2563eb", fill_color="#2563eb", fill_opacity=0.12).move_to(LEFT * 3.55 + DOWN * 0.2)
        title_text = self.label("参数闸门", 18, "#2563eb").move_to(title_chip)
        nodes = VGroup()
        for index, name in enumerate(["触发", "边界", "窗口", "留痕"]):
            x = -1.35 + index * 1.18
            badge = RoundedRectangle(width=0.94, height=0.58, corner_radius=0.13, color=["#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index], fill_color=["#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index], fill_opacity=0.13).move_to(RIGHT * x + DOWN * 0.2)
            marker = Circle(radius=0.12, color=["#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index], fill_color=["#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index], fill_opacity=0.82).move_to(badge.get_top() + DOWN * 0.14)
            label = self.label(name, 13, ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index]).move_to(badge.get_center() + DOWN * 0.07)
            nodes.add(VGroup(badge, marker, label))
        links = VGroup(*[Arrow(nodes[i].get_right(), nodes[i + 1].get_left(), buff=0.06, color="#94a3b8", stroke_width=3, max_tip_length_to_length_ratio=0.15) for i in range(len(nodes) - 1)])
        focus = SurroundingRectangle(nodes, color="#2563eb", buff=0.16, corner_radius=0.16)
        page = VGroup(title_chip, title_text, nodes, links, focus)
        self.play(FadeIn(VGroup(title_chip, title_text), shift=RIGHT * 0.12), run_time=0.45)
        self.play(LaggedStart(*[FadeIn(node, shift=UP * 0.1) for node in nodes], lag_ratio=0.08), run_time=0.9)
        self.play(LaggedStart(*[GrowArrow(link) for link in links], lag_ratio=0.1), Create(focus), run_time=0.85)
        self.play(Indicate(nodes[1], color="#16a34a"), run_time=0.55)
        self.play(FadeOut(page, shift=DOWN * 0.18), run_time=0.45)


    def construct(self):
        self.camera.background_color = "#f8fafc"
        title = self.label("参数调整：从目标到回退条件", 32, "#0f172a").to_edge(UP, buff=0.32)
        subtitle = self.label("对象、影响半径、执行门和回退条件", 18, "#0f766e").next_to(title, DOWN, buff=0.1)
        scenes = ["01 目标门", "02 影响门", "03 回退门"]
        items = [("目标", "问题"), ("参数", "对象"), ("影响", "邻区"), ("回退", "条件")]
        colors = ["#7c3aed", "#2563eb", "#0f766e", "#f59e0b"]
        stage = self.stage(scenes[0])
        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.12), FadeIn(stage), run_time=1.4)
        self.parameterGateIntro()

        visual_signature = "parameter-governance-gate-matrix"
        visual_primitives = ["trigger-cell", "boundary-frame", "change-window", "trace-ledger"]
        self.visual_identity(visual_signature, visual_primitives, colors)
        mode = "tree"
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
