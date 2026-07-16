#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutput, textbookOutputRelative } from './textbook-paths.mjs';

const root = process.cwd();
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);

if (command === 'init') await initBook(args[0] ?? 'content/new-book');
else if (command === 'import-markdown') await importMarkdown(args[0] ?? 'content/book.md');
else if (command === 'validate-markdown') await validateMarkdown(args[0] ?? 'content/book.md');
else if (command === 'validate-dsl') await validateDsl(args);
else if (command === 'tts-build') await runTtsLocal(['build', ...args]);
else if (command === 'tts:setup') await runTtsLocal(['setup', ...args]);
else if (command === 'tts:start') await runTtsLocal(['start', ...args]);
else if (command === 'tts:health') await runTtsLocal(['health', ...args]);
else if (command === 'tts:sample') await runTtsLocal(['sample', ...args]);
else if (command === 'tts:clone') await runTtsLocal(['clone', ...args]);
else if (command === 'tts:build') await runTtsLocal(['build', ...args]);
else if (command === 'build-animation') await importMarkdown(args[0] ?? 'content/book.md');
else if (command === 'validate') await validateMarkdown(args[0] ?? 'content/book.md');
else if (command === 'publish-site') await runPnpm(['--filter', '@dgbook/web', 'build']);
else printHelp();

async function runTtsLocal(ttsArgs) {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'tts-local.mjs'), ...ttsArgs], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Failed to run tts-local.mjs: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

async function runPnpm(pnpmArgs) {
  const { spawnSync } = await import('node:child_process');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', ['pnpm', ...pnpmArgs].map(cmdArg).join(' ')]
    : pnpmArgs;
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

function cmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function initBook(target) {
  const dir = path.resolve(root, target);
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  const file = path.join(dir, 'book.md');
  if (!existsSync(file)) await writeFile(file, templateBook(), 'utf-8');
  console.log(`DGBook Markdown 教材已初始化: ${file}`);
}

async function importMarkdown(source) {
  const sourcePath = path.resolve(root, source);
  const ast = parseMarkdownBook(await readFile(sourcePath, 'utf-8'), sourcePath);
  const outDir = textbookOutput('generatedAst');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'markdown-ast.json'), `${JSON.stringify(ast, null, 2)}\n`, 'utf-8');
  console.log(`已生成 normalized AST: ${textbookOutputRelative('generatedAst')}/markdown-ast.json`);
}

async function validateMarkdown(source) {
  const sourcePath = path.resolve(root, source);
  const ast = parseMarkdownBook(await readFile(sourcePath, 'utf-8'), sourcePath);
  const diagnostics = validateAst(ast);
  for (const item of diagnostics) console.log(`${item.level.toUpperCase()} ${item.code}: ${item.message}`);
  if (diagnostics.some((item) => item.level === 'error')) process.exitCode = 1;
}

async function validateDsl(targets) {
  const files = targets.length ? targets : [
    'templates/lesson/minimal-lesson.yaml',
    'docs/architecture/examples/minimal-lesson.yaml',
  ];
  const diagnostics = [];
  for (const file of files) {
    const sourcePath = path.resolve(root, file);
    let lesson;
    try {
      lesson = parseSimpleYaml(await readFile(sourcePath, 'utf-8'));
    } catch (error) {
      diagnostics.push(diag('error', 'dsl-parse-failed', `${file}: YAML 解析失败：${error.message}`));
      continue;
    }
    diagnostics.push(...validateLessonDsl(lesson, file));
  }

  for (const item of diagnostics) {
    const prefix = item.level === 'error' ? '错误' : item.level === 'warning' ? '警告' : '信息';
    console.log(`${prefix} ${item.code}: ${item.message}`);
  }
  if (!diagnostics.some((item) => item.level === 'error')) console.log(`通过：已校验 ${files.length} 个教材 DSL 文件。`);
  if (diagnostics.some((item) => item.level === 'error')) process.exitCode = 1;
}

async function buildTtsCache() {
  const server = valueAfter('--server') ?? 'http://127.0.0.1:4321';
  const actions = await collectSpeechActions(textbookOutput('widgets'));
  let ok = 0;
  for (const action of actions) {
    if (!action.text || !action.audioId) continue;
    const response = await fetch(`${server.replace(/\/+$/, '')}/api/tts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        text: action.text,
        audioId: action.audioId,
        providerId: valueAfter('--provider') ?? 'qwen-tts',
        baseUrl: valueAfter('--base-url'),
        voice: action.voiceProfileId ?? valueAfter('--voice') ?? 'Cherry',
        responseFormat: valueAfter('--format') ?? 'wav',
        cache: true,
      }),
    });
    if (!response.ok) throw new Error(`TTS cache failed for ${action.audioId}: ${await response.text()}`);
    ok++;
  }
  console.log(`已缓存 ${ok}/${actions.length} 条 speech 音频。`);
}

function parseMarkdownBook(markdown, sourcePath) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const book = {
    id: stringValue(frontmatter.id, 'dgbook-course'),
    title: stringValue(frontmatter.title, 'DGBook Course'),
    language: stringValue(frontmatter.language, 'zh-CN'),
    defaultPresenterId: stringValue(frontmatter.presenter, 'teacher'),
    defaultVoiceProfileId: stringValue(frontmatter.voice, 'qwen:Cherry'),
  };
  const lessons = [];
  const lessonBlocks = splitDirective(body, 'lesson');
  for (const block of lessonBlocks.length ? lessonBlocks : [{ attrs: {}, content: body }]) {
    const title = stringValue(block.attrs.title, firstHeading(block.content) ?? book.title);
    const id = stringValue(block.attrs.id, slug(title));
    lessons.push({ id, title, markdown: stripDirectives(block.content), scenes: parseScenes(id, block.content, book) });
  }
  return { version: 1, sourcePath, book, lessons };
}

function parseScenes(lessonId, content, book) {
  return splitDirective(content, 'scene').map((block, index) => {
    const title = stringValue(block.attrs.title, `场景 ${index + 1}`);
    const id = stringValue(block.attrs.id, `${lessonId}-scene-${String(index + 1).padStart(2, '0')}`);
    const speech = firstDirective(block.content, 'speech')?.content.trim();
    const visualBlock = firstDirective(block.content, 'visual');
    return {
      id,
      title,
      speech,
      visual: visualBlock ? parseVisualScript(id, title, visualBlock, book) : undefined,
      assets: splitDirective(block.content, 'asset').map((asset) => ({
        id: stringValue(asset.attrs.id, slug(stringValue(asset.attrs.src, 'asset'))),
        src: stringValue(asset.attrs.src, ''),
        kind: normalizeAssetKind(asset.attrs.kind),
      })),
    };
  });
}

function parseVisualScript(id, title, block, book) {
  const data = parseKeyValueBlock(block.content);
  return {
    id: stringValue(block.attrs.id, `${id}-visual`),
    title,
    template: stringValue(block.attrs.template ?? data.template, 'topology'),
    presenterId: stringValue(block.attrs.presenter, book.defaultPresenterId),
    voiceProfileId: stringValue(block.attrs.voice, book.defaultVoiceProfileId),
    actions: [],
  };
}

function validateAst(ast) {
  const diagnostics = [];
  if (!ast.lessons.length) diagnostics.push(diag('error', 'lessons-empty', '至少需要一个 :::lesson 或正文章节。'));
  for (const lesson of ast.lessons) {
    if (!lesson.scenes.length) diagnostics.push(diag('warning', 'scenes-empty', `${lesson.id} 没有 :::scene，后续只能生成静态页。`));
    for (const scene of lesson.scenes) {
      if (!scene.speech) diagnostics.push(diag('error', 'speech-empty', `${scene.id} 缺少 :::speech 解说。`));
      if (!scene.visual) diagnostics.push(diag('warning', 'visual-empty', `${scene.id} 缺少 :::visual，动画草稿会使用模板推断。`));
      if (scene.speech && scene.speech.length > 420) diagnostics.push(diag('warning', 'speech-long', `${scene.id} 单段 speech 偏长，建议拆分。`));
    }
  }
  if (!diagnostics.length) diagnostics.push(diag('info', 'markdown-valid', 'Markdown 教材结构可生成。'));
  return diagnostics;
}

async function collectSpeechActions(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const actions = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) actions.push(...await collectSpeechActions(full));
    else if (entry.name.endsWith('.json')) {
      const json = JSON.parse(await readFile(full, 'utf-8'));
      for (const scene of json.playbackScenes ?? []) {
        for (const action of scene.actions ?? []) if (action.type === 'speech') actions.push(action);
      }
    }
  }
  return actions;
}

function splitFrontmatter(markdown) {
  if (!markdown.startsWith('---')) return { frontmatter: {}, body: markdown };
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return { frontmatter: {}, body: markdown };
  return { frontmatter: parseKeyValueBlock(markdown.slice(3, end)), body: markdown.slice(end + 4) };
}

function splitDirective(markdown, name) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const start = new RegExp(`^:::+${name}(\\s.*)?$`).exec(lines[index]?.trim() ?? '');
    if (!start) continue;
    const content = [];
    let depth = 1;
    for (index = index + 1; index < lines.length; index++) {
      const line = lines[index] ?? '';
      const trimmed = line.trim();
      if (/^:::+end\s*$/.test(trimmed)) {
        depth--;
        if (depth === 0) break;
        content.push(line);
        continue;
      }
      if (/^:::+[A-Za-z0-9_-]+(\s.*)?$/.test(trimmed)) depth++;
      content.push(line);
    }
    blocks.push({ attrs: parseAttrs(start[1] ?? ''), content: content.join('\n') });
  }
  return blocks;
}

function firstDirective(markdown, name) {
  return splitDirective(markdown, name)[0] ?? null;
}

function stripDirectives(markdown) {
  return markdown.replace(/(^|\n):::[\s\S]*?(?=\n:::end|$)/g, '').replace(/\n:::end/g, '').trim();
}

function parseAttrs(raw) {
  const attrs = {};
  for (const item of raw.trim().matchAll(/([a-zA-Z0-9_-]+)=("[^"]*"|'[^']*'|[^\s]+)/g)) {
    attrs[item[1]] = String(item[2] ?? '').replace(/^['"]|['"]$/g, '');
  }
  return attrs;
}

function parseKeyValueBlock(raw) {
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (match) data[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return data;
}

function parseSimpleYaml(raw) {
  const lines = raw.split(/\r?\n/).map((text, index) => ({
    index: index + 1,
    indent: text.match(/^ */)?.[0].length ?? 0,
    trimmed: text.trim(),
  })).filter((line) => line.trimmed && !line.trimmed.startsWith('#'));
  const rootObject = {};
  const stack = [{ indent: -1, value: rootObject }];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (line.trimmed.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`第 ${line.index} 行：列表项没有对应的数组父级`);
      const item = line.trimmed.slice(2).trim();
      if (!item) {
        const value = nextContainer(lines, index, line.indent);
        parent.push(value);
        stack.push({ indent: line.indent, value });
        continue;
      }
      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(item);
      if (pair) {
        const value = {};
        value[pair[1]] = parseYamlScalar(pair[2]);
        parent.push(value);
        stack.push({ indent: line.indent, value });
      } else {
        parent.push(parseYamlScalar(item));
      }
      continue;
    }

    if (Array.isArray(parent)) throw new Error(`第 ${line.index} 行：数组中只能使用 "- " 列表项`);
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trimmed);
    if (!pair) throw new Error(`第 ${line.index} 行：只支持 key: value 形式`);
    const [, key, rawValue] = pair;
    const value = rawValue ? parseYamlScalar(rawValue) : nextContainer(lines, index, line.indent);
    parent[key] = value;
    if (!rawValue) stack.push({ indent: line.indent, value });
  }

  return rootObject;
}

function nextContainer(lines, index, indent) {
  const next = lines.slice(index + 1).find((line) => line.indent > indent);
  return next?.trimmed.startsWith('- ') ? [] : {};
}

function parseYamlScalar(rawValue) {
  const value = rawValue.trim();
  if (value === '[]') return [];
  if (value === '{}') return {};
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function validateLessonDsl(lesson, file) {
  const diagnostics = [];
  const at = (pathName) => `${file} 的 ${pathName}`;
  for (const key of ['schema', 'id', 'title', 'version', 'chapters']) {
    if (!hasValue(lesson?.[key])) diagnostics.push(diag('error', 'dsl-required-missing', `${at(key)} 缺少必填字段。`));
  }
  if (lesson?.schema && lesson.schema !== 'dgbook.lesson/v1') {
    diagnostics.push(diag('error', 'dsl-schema-mismatch', `${at('schema')} 应为 dgbook.lesson/v1，实际为 ${lesson.schema}。`));
  }
  if (lesson?.id && !/^[a-z0-9][a-z0-9-]*$/.test(lesson.id)) {
    diagnostics.push(diag('error', 'dsl-id-invalid', `${at('id')} 只能使用小写字母、数字和连字符，并且需以字母或数字开头。`));
  }
  if (!Array.isArray(lesson?.chapters) || lesson.chapters.length === 0) {
    diagnostics.push(diag('error', 'dsl-chapters-empty', `${at('chapters')} 必须是非空数组。`));
  } else {
    validateChapters(lesson.chapters, file, diagnostics);
  }
  if (lesson?.assets !== undefined && !Array.isArray(lesson.assets)) {
    diagnostics.push(diag('error', 'dsl-assets-invalid', `${at('assets')} 必须是数组。`));
  } else {
    validateAssets(lesson.assets ?? [], file, diagnostics);
  }
  if (!diagnostics.length) diagnostics.push(diag('info', 'dsl-valid', `${file} 字段结构有效。`));
  return diagnostics;
}

function validateChapters(chapters, file, diagnostics) {
  for (const [chapterIndex, chapter] of chapters.entries()) {
    const chapterPath = `chapters[${chapterIndex}]`;
    requireFields(chapter, ['id', 'title', 'sections'], file, chapterPath, diagnostics);
    if (!Array.isArray(chapter.sections) || chapter.sections.length === 0) {
      diagnostics.push(diag('error', 'dsl-sections-empty', `${file} 的 ${chapterPath}.sections 必须是非空数组。`));
      continue;
    }
    for (const [sectionIndex, section] of chapter.sections.entries()) {
      const sectionPath = `${chapterPath}.sections[${sectionIndex}]`;
      requireFields(section, ['id', 'title', 'blocks'], file, sectionPath, diagnostics);
      if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
        diagnostics.push(diag('error', 'dsl-blocks-empty', `${file} 的 ${sectionPath}.blocks 必须是非空数组。`));
        continue;
      }
      validateBlocks(section.blocks, file, sectionPath, diagnostics);
    }
  }
}

function validateBlocks(blocks, file, sectionPath, diagnostics) {
  const allowedTypes = new Set(['explain', 'example', 'exercise', 'animation-demo', 'quiz']);
  for (const [blockIndex, block] of blocks.entries()) {
    const blockPath = `${sectionPath}.blocks[${blockIndex}]`;
    requireFields(block, ['id', 'type'], file, blockPath, diagnostics);
    if (block.type && !allowedTypes.has(block.type)) {
      diagnostics.push(diag('error', 'dsl-block-type-invalid', `${file} 的 ${blockPath}.type 不在允许范围内：${block.type}。`));
    }
    if (['explain', 'example', 'exercise'].includes(block.type) && !hasValue(block.body)) {
      diagnostics.push(diag('warning', 'dsl-block-body-missing', `${file} 的 ${blockPath} 建议填写 body。`));
    }
    if (block.type === 'animation-demo') requireFields(block, ['animation', 'narration'], file, blockPath, diagnostics);
  }
}

function validateAssets(assets, file, diagnostics) {
  const allowedKinds = new Set(['image', 'video', 'audio', 'table', 'code', 'dataset']);
  for (const [assetIndex, asset] of assets.entries()) {
    const assetPath = `assets[${assetIndex}]`;
    requireFields(asset, ['id', 'kind', 'src'], file, assetPath, diagnostics);
    if (asset.kind && !allowedKinds.has(asset.kind)) {
      diagnostics.push(diag('error', 'dsl-asset-kind-invalid', `${file} 的 ${assetPath}.kind 不在允许范围内：${asset.kind}。`));
    }
  }
}

function requireFields(value, keys, file, pathName, diagnostics) {
  for (const key of keys) {
    if (!hasValue(value?.[key])) diagnostics.push(diag('error', 'dsl-required-missing', `${file} 的 ${pathName}.${key} 缺少必填字段。`));
  }
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function stringValue(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function firstHeading(markdown) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'lesson';
}

function normalizeAssetKind(value) {
  return ['image', 'video', 'audio', 'table', 'code', 'formula'].includes(value) ? value : 'image';
}

function diag(level, code, message) {
  return { level, code, message };
}

function printHelp() {
  console.log(`DGBook CLI

Commands:
  init [dir]                 初始化 Markdown 教材目录
  import-markdown [file]     解析 Markdown 指令为 normalized AST
  validate-markdown [file]   校验 Markdown 教材结构
  validate-dsl [files...]    校验教材 DSL YAML 基础字段
  build-animation [file]     解析 Markdown 并生成动画草稿 AST
  tts:setup                  准备本地 TTS 运行环境
  tts:start                  启动 Kokoro / VoxCPM 本地 TTS
  tts:health                 检查本地 TTS 健康状态
  tts:sample                 生成一段本地 TTS 样例
  tts:build [options]        批量生成并缓存 speech 音频
  publish-site               构建 Next.js 主平台
`);
}

function templateBook() {
  return `---
id: sample-5g
title: 5G 网络优化数字教材
language: zh-CN
presenter: teacher
voice: qwen:Cherry
---

:::lesson id="P01" title="室内环境信息采集"
# 室内环境信息采集

普通 Markdown 写教材正文。动画、解说和资源用指令块描述，工具链会生成审核草稿。

:::scene id="P01-scene-01" title="采集对象到证据链"
:::speech
这一段讲清室内环境信息采集的对象、证据和输出。画面只放关键词，解释进入解说。
:::end

:::visual template="topology" presenter="teacher" voice="qwen:Cherry"
template: topology
:::end
:::end
:::end
`;
}
