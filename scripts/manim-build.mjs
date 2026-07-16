#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MANIM_REQUIRED_TARGETS,
  buildDtCqtSceneSource,
  buildGenericKnowledgeSceneSource,
  buildSignalingLadderSceneSource,
  manimManifestCopyFor,
  manimSceneSpecFor,
} from './manim-scene-sources.mjs';

const root = process.cwd();
if (process.argv.includes('--all-required')) {
  let failed = 0;
  for (const target of MANIM_REQUIRED_TARGETS) {
    const args = [
      path.join(root, 'scripts', 'manim-build.mjs'),
      '--project',
      target.project,
      '--template',
      target.template,
      '--duration-ms',
      String(target.durationMs),
    ];
    if (process.argv.includes('--emit-placeholder')) args.push('--emit-placeholder');
    if (process.argv.includes('--dry-run')) args.push('--dry-run');
    if (process.argv.includes('--refresh-manifest')) args.push('--refresh-manifest');
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf-8', shell: false, stdio: 'inherit' });
    if (run.status !== 0) failed += 1;
  }
  process.exit(failed ? 1 : 0);
}
const projectId = valueAfter('--project') ?? 'P01';
const templateId = valueAfter('--template') ?? 'dt-cqt-concept';
const durationMs = Number(valueAfter('--duration-ms') ?? (templateId === 'signaling-ladder' ? '36000' : '30000'));
const sceneName = toPascal(`${projectId}-${templateId}`);
const dryRun = process.argv.includes('--dry-run');
const emitPlaceholder = process.argv.includes('--emit-placeholder');
const refreshManifest = process.argv.includes('--refresh-manifest');
const outDir = dryRun
  ? path.join(root, 'runtime', 'dry-run', 'manim', projectId.toLowerCase(), templateId)
  : path.join(root, 'site', 'public', 'media', 'manim', projectId.toLowerCase(), templateId);
const srcDir = path.join(root, 'tools', 'manim-scenes', 'generated');
const scenePath = path.join(srcDir, `${projectId.toLowerCase()}-${templateId}.py`);
const manifestPath = path.join(outDir, 'manifest.json');
const mediaPythonExe = path.join(root, 'runtime', 'media-python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

await mkdir(srcDir, { recursive: true });
await mkdir(outDir, { recursive: true });
await writeFile(scenePath, buildSceneSource(sceneName, projectId, templateId), 'utf-8');

if (refreshManifest) {
  const existing = readExistingManifest();
  await writeManifest(existing.status ?? 'rendered', {
    scenePath,
    format: existing.outputs?.format ?? 'webm',
    videoUrl: existing.outputs?.videoUrl,
    posterUrl: existing.outputs?.posterUrl,
  });
  console.log(`Manim manifest refreshed: ${rel(manifestPath)}.`);
  process.exit(0);
}

if (dryRun) {
  await writeManifest('dry-run', { scenePath });
  console.log(`Manim dry run wrote ${rel(scenePath)} and ${rel(manifestPath)}.`);
  process.exit(0);
}

const manim = findManim();
if (!manim && !emitPlaceholder) {
  await writeManifest('missing-renderer', { scenePath });
  console.error('Manim is not available on PATH or as python -m manim.');
  console.error('Run with --emit-placeholder for local pipeline smoke tests, or install Manim before rendering.');
  process.exitCode = 1;
  process.exit();
}

if (!manim && emitPlaceholder) {
  const posterPath = path.join(outDir, 'poster.svg');
  await writeFile(posterPath, buildPosterSvg(projectId, templateId), 'utf-8');
  await writeManifest('placeholder', {
    scenePath,
    posterUrl: publicUrl(posterPath),
    format: 'placeholder',
  });
  console.log(`Manim placeholder wrote ${rel(posterPath)} and ${rel(manifestPath)}.`);
  process.exit(0);
}

const mediaRoot = path.join(root, 'runtime', 'manim-media', projectId.toLowerCase(), templateId);
await mkdir(mediaRoot, { recursive: true });
const render = spawnSync(manim.command, [
  ...manim.prefix,
  scenePath,
  sceneName,
  '--format',
  'webm',
  '-qm',
  '--media_dir',
  mediaRoot,
], { cwd: root, encoding: 'utf-8', shell: false });

if (render.status !== 0) {
  await writeManifest('render-failed', { scenePath, log: render.stderr || render.stdout });
  console.error(render.stderr || render.stdout);
  process.exitCode = 1;
  process.exit();
}

const renderedVideo = await findNewestMedia(mediaRoot, '.webm');
if (!renderedVideo) {
  await writeManifest('render-failed', { scenePath, log: 'Manim completed but no .webm file was found.' });
  console.error('Manim completed but no .webm file was found.');
  process.exitCode = 1;
  process.exit();
}
const publicVideo = path.join(outDir, `${projectId.toLowerCase()}-${templateId}.webm`);
await copyFile(renderedVideo, publicVideo);
const publicPoster = path.join(outDir, 'poster.png');
const posterUrl = writeVideoPoster(renderedVideo, publicPoster) ? publicUrl(publicPoster) : undefined;
await writeManifest('rendered', { scenePath, format: 'webm', videoUrl: publicUrl(publicVideo), posterUrl });
console.log(`Manim render finished. Manifest: ${rel(manifestPath)}`);

function findManim() {
  const envPython = process.env.DGBOOK_MANIM_PYTHON;
  if (envPython) {
    const env = spawnSync(envPython, ['-m', 'manim', '--version'], { encoding: 'utf-8', shell: false, timeout: 10000 });
    if (env.status === 0) return { command: envPython, prefix: ['-m', 'manim'] };
  }
  if (existsSync(mediaPythonExe)) {
    const local = spawnSync(mediaPythonExe, ['-m', 'manim', '--version'], { encoding: 'utf-8', shell: false, timeout: 10000 });
    if (local.status === 0) return { command: mediaPythonExe, prefix: ['-m', 'manim'] };
  }
  const direct = spawnSync('manim', ['--version'], { encoding: 'utf-8', shell: false, timeout: 10000 });
  if (direct.status === 0) return { command: 'manim', prefix: [] };
  const py = spawnSync('python', ['-m', 'manim', '--version'], { encoding: 'utf-8', shell: false, timeout: 10000 });
  if (py.status === 0) return { command: 'python', prefix: ['-m', 'manim'] };
  return null;
}

async function findNewestMedia(dir, extension) {
  const files = await listFiles(dir);
  const matches = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith(extension)) continue;
    const info = await stat(file);
    matches.push({ file, mtimeMs: info.mtimeMs });
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.file;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else files.push(full);
  }
  return files;
}

async function writeManifest(status, extra) {
  const copy = manimManifestCopyFor(projectId, templateId);
  const spec = manimSceneSpecFor(projectId, templateId);
  const manifest = {
    schema: 'dgbook.asset.manim-animation/v1',
    id: `${projectId.toLowerCase()}-${templateId}`,
    title: copy.title,
    body: copy.body,
    sceneName,
    status,
    source: {
      path: rel(scenePath),
      templateId,
      projectId,
      beatIds: [`${projectId}-beat-01`, `${projectId}-beat-02`, `${projectId}-beat-03`],
    },
    sceneGrammar: {
      sceneTemplateId: spec.sceneTemplateId,
      grammar: spec.mode,
      visualMode: spec.visualMotif,
      generator: spec.generator,
      stages: spec.scenes,
      items: spec.items,
      knowledgeParameters: spec.knowledgeParameters,
    },
    knowledgeParameters: spec.knowledgeParameters,
    visual: {
      signature: spec.visualSignature,
      motif: spec.visualMotif,
      learningFocus: spec.learningFocus,
      primitives: spec.visualPrimitives,
      palette: spec.colors,
    },
    outputs: {
      manifest: dryRun ? rel(manifestPath) : publicUrl(manifestPath),
      videoUrl: extra.videoUrl,
      posterUrl: extra.posterUrl,
      durationMs,
      format: extra.format ?? 'webm',
    },
    constraints: {
      maxVisibleTextChars: 90,
      safeArea: { left: 48, top: 40, right: 48, bottom: 56 },
    },
    diagnostics: extra.log ? [{ level: 'error', code: status, message: String(extra.log).slice(0, 1200) }] : [],
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

function readExistingManifest() {
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return {};
  }
}

function buildSceneSource(className, project, template) {
  if (template === 'dt-cqt-concept') return buildDtCqtSceneSource(className, project);
  if (template === 'signaling-ladder') return buildSignalingLadderSceneSource(className, project);
  return buildGenericKnowledgeSceneSource(className, project, template);
}

function buildDtCqtScene(className, project) {
  return `from manim import *\n\n\nclass ${className}(Scene):\n    def label(self, text, size=24, color=WHITE):\n        return Text(text, font=\"Microsoft YaHei\", font_size=size, color=color)\n\n    def construct(self):\n        self.camera.background_color = \"#f8fafc\"\n        title = self.label(\"DT / CQT：路线测试与定点拨测\", 32, \"#0f172a\").to_edge(UP, buff=0.35)\n        subtitle = self.label(\"少看任务清单，先看数据怎样被采到\", 20, \"#0f766e\").next_to(title, DOWN, buff=0.12)\n        divider = Line(UP * 2.75, DOWN * 2.35, color=\"#cbd5e1\", stroke_width=2)\n        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.15), Create(divider), run_time=1.8)\n\n        left_title = self.label(\"DT：移动路线\", 24, \"#1d4ed8\").move_to(LEFT * 3.6 + UP * 2.05)\n        right_title = self.label(\"CQT：固定场景\", 24, \"#be123c\").move_to(RIGHT * 3.4 + UP * 2.05)\n        map_area = RoundedRectangle(width=5.0, height=3.25, corner_radius=0.18, color=\"#bfdbfe\", fill_color=\"#eff6ff\", fill_opacity=0.9).move_to(LEFT * 3.1 + DOWN * 0.05)\n        site_area = RoundedRectangle(width=4.25, height=3.25, corner_radius=0.18, color=\"#fecdd3\", fill_color=\"#fff1f2\", fill_opacity=0.9).move_to(RIGHT * 3.25 + DOWN * 0.05)\n        self.play(FadeIn(left_title), FadeIn(right_title), Create(map_area), Create(site_area), run_time=1.5)\n\n        roads = VGroup(\n            Line(LEFT * 5.25 + UP * 0.9, LEFT * 1.15 + UP * 0.15, color=\"#93c5fd\", stroke_width=10),\n            Line(LEFT * 5.0 + DOWN * 0.95, LEFT * 1.25 + DOWN * 1.25, color=\"#93c5fd\", stroke_width=10),\n            Line(LEFT * 4.4 + UP * 1.35, LEFT * 4.15 + DOWN * 1.45, color=\"#93c5fd\", stroke_width=7),\n            Line(LEFT * 2.7 + UP * 1.15, LEFT * 2.3 + DOWN * 1.5, color=\"#93c5fd\", stroke_width=7),\n        )\n        route = VMobject(color=\"#0f766e\", stroke_width=7).set_points_smoothly([\n            LEFT * 5.0 + DOWN * 0.85,\n            LEFT * 4.1 + UP * 0.55,\n            LEFT * 3.0 + UP * 0.25,\n            LEFT * 2.2 + DOWN * 0.55,\n            LEFT * 1.35 + DOWN * 1.05,\n        ])\n        car = VGroup(RoundedRectangle(width=0.55, height=0.32, corner_radius=0.08, fill_color=\"#0f766e\", fill_opacity=1, color=\"#0f766e\"), Dot(color=\"#fbbf24\").scale(0.55).shift(RIGHT * 0.12)).move_to(route.get_start())\n        samples = VGroup(*[Dot(point, radius=0.055, color=\"#f59e0b\") for point in route.get_points()[::max(1, len(route.get_points()) // 8)]])\n        self.play(Create(roads), Create(route), FadeIn(car), run_time=2.0)\n        self.play(MoveAlongPath(car, route), LaggedStart(*[FadeIn(dot, scale=1.6) for dot in samples], lag_ratio=0.15), run_time=4.2, rate_func=smooth)\n\n        building = VGroup(\n            RoundedRectangle(width=1.55, height=1.1, corner_radius=0.12, color=\"#fda4af\", fill_color=\"#ffe4e6\", fill_opacity=1).move_to(RIGHT * 2.4 + UP * 0.45),\n            RoundedRectangle(width=1.55, height=1.1, corner_radius=0.12, color=\"#fda4af\", fill_color=\"#ffe4e6\", fill_opacity=1).move_to(RIGHT * 4.1 + DOWN * 0.45),\n            self.label(\"室内点\", 17, \"#be123c\").move_to(RIGHT * 2.4 + UP * 0.45),\n            self.label(\"路口点\", 17, \"#be123c\").move_to(RIGHT * 4.1 + DOWN * 0.45),\n        )\n        cqt_points = VGroup(*[Dot(RIGHT * x + UP * y, radius=0.075, color=\"#e11d48\") for x, y in [(2.05, 1.05), (2.8, 0.05), (3.55, 0.85), (4.55, -0.1), (3.55, -1.15), (2.45, -0.8)]])\n        rings = VGroup(*[Circle(radius=0.24, color=\"#fb7185\", stroke_width=2).move_to(dot) for dot in cqt_points])\n        self.play(FadeIn(building, shift=UP * 0.15), LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.12), FadeIn(cqt_points), run_time=2.5)\n\n        evidence = VGroup()\n        names = [\"GPS\", \"LOG\", \"业务\", \"报告\"]\n        colors = [\"#2563eb\", \"#0f766e\", \"#f59e0b\", \"#7c3aed\"]\n        for i, name in enumerate(names):\n            card = RoundedRectangle(width=1.3, height=0.55, corner_radius=0.12, color=colors[i], fill_color=colors[i], fill_opacity=0.12)\n            txt = self.label(name, 18, colors[i]).move_to(card)\n            evidence.add(VGroup(card, txt).move_to(LEFT * 2.0 + RIGHT * i * 1.35 + DOWN * 2.15))\n        arrows = VGroup(*[Arrow(LEFT * (4.25 - i * 1.15) + DOWN * 1.45, evidence[i].get_top(), buff=0.08, color=\"#64748b\", stroke_width=3) for i in range(4)])\n        self.play(LaggedStart(*[FadeIn(item, shift=UP * 0.18) for item in evidence], lag_ratio=0.16), Create(arrows), run_time=2.6)\n\n        compare = self.label(\"DT 看连续覆盖，CQT 看关键点体验\", 25, \"#0f172a\").to_edge(DOWN, buff=0.35)\n        focus_left = SurroundingRectangle(route, color=\"#22c55e\", buff=0.15, corner_radius=0.12)\n        focus_right = SurroundingRectangle(cqt_points, color=\"#e11d48\", buff=0.22, corner_radius=0.12)\n        self.play(Create(focus_left), Write(compare), run_time=1.5)\n        self.play(Transform(focus_left, focus_right), Indicate(cqt_points, color=\"#e11d48\"), run_time=2.0)\n        self.play(FadeOut(focus_left), run_time=0.6)\n        self.wait(5.0)\n`;
}

function buildSignalingLadderScene(className, project) {
  return `from manim import *\n\n\nclass ${className}(Scene):\n    def label(self, text, size=22, color=WHITE):\n        return Text(text, font=\"Microsoft YaHei\", font_size=size, color=color)\n\n    def construct(self):\n        self.camera.background_color = \"#f8fafc\"\n        title = self.label(\"接入失败：信令消息如何定位问题\", 31, \"#0f172a\").to_edge(UP, buff=0.34)\n        subtitle = self.label(\"按时间顺序看：谁发起、谁响应、卡在哪一跳\", 19, \"#0f766e\").next_to(title, DOWN, buff=0.1)\n        self.play(Write(title), FadeIn(subtitle, shift=DOWN * 0.16), run_time=1.6)\n\n        names = [\"UE\", \"gNB\", \"AMF\", \"SMF\", \"UPF\"]\n        xs = [-5.0, -2.5, 0.0, 2.5, 5.0]\n        lanes = VGroup()\n        for name, x in zip(names, xs):\n            top = self.label(name, 22, \"#0f172a\").move_to(RIGHT * x + UP * 2.0)\n            line = DashedLine(RIGHT * x + UP * 1.72, RIGHT * x + DOWN * 2.25, color=\"#94a3b8\", dash_length=0.12)\n            lanes.add(VGroup(top, line))\n        self.play(LaggedStart(*[FadeIn(lane, shift=DOWN * 0.1) for lane in lanes], lag_ratio=0.08), run_time=1.8)\n\n        messages = [\n            (0, 1, 1.35, \"RRC Setup\", \"#2563eb\"),\n            (0, 2, 0.7, \"Registration\", \"#0f766e\"),\n            (2, 3, 0.05, \"PDU Session\", \"#7c3aed\"),\n            (3, 4, -0.6, \"N4 / N3\", \"#0ea5e9\"),\n            (2, 0, -1.25, \"Reject / Timer\", \"#e11d48\"),\n        ]\n        arrows = VGroup()\n        labels = VGroup()\n        for src, dst, y, label, color in messages:\n            start = RIGHT * xs[src] + UP * y\n            end = RIGHT * xs[dst] + UP * (y - 0.18)\n            arrow = Arrow(start, end, buff=0.12, color=color, stroke_width=5, max_tip_length_to_length_ratio=0.08)\n            txt = self.label(label, 15, color).next_to(arrow, UP, buff=0.05)\n            arrows.add(arrow)\n            labels.add(txt)\n        packet = Dot(color=\"#f59e0b\", radius=0.085).move_to(arrows[0].get_start())\n        self.play(FadeIn(packet, scale=1.4), run_time=0.4)\n        for i, arrow in enumerate(arrows):\n            self.play(GrowArrow(arrow), FadeIn(labels[i], shift=UP * 0.08), MoveAlongPath(packet, arrow), run_time=2.2, rate_func=smooth)\n            self.play(Indicate(labels[i], color=messages[i][4]), run_time=0.6)\n\n        model = RoundedRectangle(width=3.4, height=1.25, corner_radius=0.16, color=\"#f59e0b\", fill_color=\"#fffbeb\", fill_opacity=0.92).move_to(DOWN * 2.45)\n        model_title = self.label(\"定位模型\", 20, \"#92400e\").move_to(model.get_center() + UP * 0.25)\n        model_rule = self.label(\"时间线 + 失败点 + 回退证据\", 18, \"#0f172a\").move_to(model.get_center() + DOWN * 0.22)\n        fail_box = SurroundingRectangle(VGroup(arrows[-1], labels[-1]), color=\"#e11d48\", buff=0.16, corner_radius=0.12)\n        self.play(Create(fail_box), FadeIn(model, shift=UP * 0.2), Write(model_title), Write(model_rule), run_time=2.0)\n        self.play(Indicate(fail_box, color=\"#e11d48\"), run_time=1.2)\n        self.wait(6.0)\n`;
}

function buildPosterSvg(project, template) {
  const copy = manimManifestCopyFor(project, template);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 562" role="img" aria-label="${escapeSvg(copy.title)}"><rect width="1000" height="562" fill="#f8fafc"/><path d="M120 290 C260 210 420 370 560 285 S810 240 900 320" fill="none" stroke="#0f766e" stroke-width="8" stroke-linecap="round"/><circle cx="120" cy="290" r="28" fill="#14b8a6"/><circle cx="560" cy="285" r="28" fill="#2563eb"/><circle cx="900" cy="320" r="28" fill="#f59e0b"/><text x="72" y="82" fill="#0f172a" font-family="Arial" font-size="34" font-weight="700">${escapeSvg(copy.title)}</text><text x="72" y="128" fill="#0f766e" font-family="Arial" font-size="22">${escapeSvg(copy.body)}</text></svg>`;
}

function escapeSvg(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeVideoPoster(videoPath, posterPath) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return false;
  const result = spawnSync(ffmpeg, [
    '-y',
    '-ss',
    '6',
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-update',
    '1',
    posterPath,
  ], { cwd: root, encoding: 'utf-8', shell: false, timeout: 30000 });
  return result.status === 0 && existsSync(posterPath);
}

function findFfmpeg() {
  const envFfmpeg = process.env.DGBOOK_FFMPEG_EXE;
  if (envFfmpeg && spawnSync(envFfmpeg, ['-version'], { encoding: 'utf-8', shell: false, timeout: 5000 }).status === 0) {
    return envFfmpeg;
  }
  const bundledFfmpeg = path.join(
    root,
    'runtime',
    'media-python',
    'Lib',
    'site-packages',
    'imageio_ffmpeg',
    'binaries',
    'ffmpeg-win-x86_64-v7.1.exe',
  );
  if (existsSync(bundledFfmpeg)) return bundledFfmpeg;
  return spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8', shell: false, timeout: 5000 }).status === 0 ? 'ffmpeg' : '';
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toPascal(value) {
  return value.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^[^a-zA-Z]+/, '').replace(/^./, (c) => c.toUpperCase());
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function publicUrl(file) {
  const publicRoot = path.join(root, 'site', 'public');
  return `/${path.relative(publicRoot, file).replaceAll(path.sep, '/')}`;
}
