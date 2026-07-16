#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const command = process.argv[2] ?? 'health';
const mediaPython = path.join(root, 'runtime', 'media-python');
const mediaPythonExe = path.join(mediaPython, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (command === 'health') {
  reportHealth();
} else if (command === 'setup-manim') {
  await setupManim();
} else {
  console.error('Usage: node scripts/media-runtime.mjs health|setup-manim');
  process.exitCode = 1;
}

function reportHealth() {
  const checks = {
    python: run('python', ['--version']),
    mediaPython: existsSync(mediaPythonExe) ? run(mediaPythonExe, ['--version']) : missing(mediaPythonExe),
    manim: findManim(),
    ffmpeg: run('ffmpeg', ['-version']),
    imageioFfmpeg: existsSync(mediaPythonExe)
      ? run(mediaPythonExe, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'])
      : missing('runtime/media-python'),
  };
  for (const [name, check] of Object.entries(checks)) {
    const status = check.ok ? 'OK' : 'MISSING';
    console.log(`${status} ${name}: ${firstLine(check.output || check.reason)}`);
  }
  if (!checks.manim.ok) process.exitCode = 1;
}

async function setupManim() {
  await mkdir(path.dirname(mediaPython), { recursive: true });
  if (!existsSync(mediaPythonExe)) {
    step('Creating media Python venv');
    mustRun('python', ['-m', 'venv', mediaPython]);
  }
  step('Upgrading pip');
  mustRun(mediaPythonExe, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  step('Installing Manim and bundled FFmpeg helper');
  mustRun(mediaPythonExe, ['-m', 'pip', 'install', 'manim==0.19.0', 'imageio-ffmpeg']);
  step('Checking Manim');
  mustRun(mediaPythonExe, ['-m', 'manim', '--version']);
}

function findManim() {
  const envPython = process.env.DGBOOK_MANIM_PYTHON;
  if (envPython) {
    const check = run(envPython, ['-m', 'manim', '--version']);
    if (check.ok) return check;
  }
  if (existsSync(mediaPythonExe)) {
    const check = run(mediaPythonExe, ['-m', 'manim', '--version']);
    if (check.ok) return check;
  }
  const direct = run('manim', ['--version']);
  if (direct.ok) return direct;
  return run('python', ['-m', 'manim', '--version']);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf-8', shell: false, timeout: 15000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error) return { ok: false, reason: result.error.message, output };
  return { ok: result.status === 0, reason: output || `exit ${result.status}`, output };
}

function mustRun(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf-8', shell: false, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? `${cmd} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}

function missing(reason) {
  return { ok: false, reason, output: '' };
}

function step(message) {
  console.log(`\n[media-runtime] ${message}`);
}

function firstLine(value) {
  return String(value || '').split(/\r?\n/)[0] || '(no output)';
}
