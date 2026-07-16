#!/usr/bin/env node
// Legacy STM32 splitter. The current 5G textbook pipeline uses import-5g-docx.py.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textbookOutputRelative } from './textbook-paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    in: '数字化教材.md',
    out: textbookOutputRelative('projects'),
    outline: textbookOutputRelative('outline'),
  };
  for (let i = 0; i < args.length; i++) {
    const v = args[i];
    if (v === '--in')      out.in = args[++i];
    else if (v === '--out') out.out = args[++i];
    else if (v === '--outline') out.outline = args[++i];
  }
  return out;
}

function slugify(title) {
  return title
    .replace(/\s+/g, '-')
    .replace(/[^一-龥A-Za-z0-9-]/g, '')
    .toLowerCase()
    .slice(0, 40) || 'project';
}

function yamlFrontmatter(obj) {
  const order = ['project_id', 'title', 'chapter', 'unit', 'icon', 'chip', 'threads', 'estimatedPages', 'masterLines', 'widgets', 'status'];
  const lines = ['---'];
  for (const k of order) {
    if (obj[k] === undefined) continue;
    const v = obj[k];
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else if (v.every(x => typeof x === 'number' || typeof x === 'string' && !/[:#\n]/.test(x))) {
        lines.push(`${k}: [${v.map(x => typeof x === 'string' ? `"${x}"` : x).join(', ')}]`);
      } else {
        lines.push(`${k}:`);
        for (const x of v) lines.push(`  - ${typeof x === 'string' ? `"${x}"` : x}`);
      }
    } else if (typeof v === 'string') {
      lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function extractLines(text, start, end) {
  // start/end 是 1-based 行号(包含)
  const lines = text.split('\n');
  return lines.slice(start - 1, end).join('\n');
}

async function main() {
  const args = parseArgs();
  console.warn('[legacy] split-master.mjs is for the old STM32 markdown pipeline. Current 5G imports should use scripts/import-5g-docx.py.');
  const masterPath  = resolve(ROOT, args.in);
  const outDir      = resolve(ROOT, args.out);
  const outlinePath = resolve(ROOT, args.outline);

  const [masterRaw, outlineRaw] = await Promise.all([
    readFile(masterPath, 'utf8'),
    readFile(outlinePath, 'utf8')
  ]);
  const outline = JSON.parse(outlineRaw);

  await mkdir(outDir, { recursive: true });

  let okCount = 0;
  const failures = [];

  for (const p of outline.projects) {
    const [oStart, oEnd, eStart, eEnd] = p.masterLines || [];
    if (!oStart || !oEnd) {
      failures.push({ id: p.id, reason: 'missing masterLines' });
      continue;
    }
    const outlineBlock = extractLines(masterRaw, oStart, oEnd).trim();
    const enhancedBlock = (eStart && eEnd) ? extractLines(masterRaw, eStart, eEnd).trim() : '';

    const fm = {
      project_id: p.id,
      title: p.title,
      chapter: p.chapter,
      unit: p.unit,
      icon: p.icon,
      chip: '5G网优',
      threads: p.threads || [],
      estimatedPages: p.estimatedPages || 3,
      masterLines: p.masterLines,
      widgets: [],
      status: 'outline'
    };

    const slug = slugify(p.title);
    const filename = `${p.id}-${slug}.md`;
    const filepath = resolve(outDir, filename);

    const body = [
      yamlFrontmatter(fm),
      `# ${p.id} ${p.title}`,
      '',
      `> 章节: ${outline.chapters.find(c => c.id === p.chapter)?.title} · 单元: ${outline.units.find(u => u.id === p.unit)?.title} · 学时: 见单元总览`,
      '',
      '<!-- ============= 大纲段 (源: ' + args.in + ' 行 ' + oStart + '–' + oEnd + ') ============= -->',
      '',
      outlineBlock,
      ''
    ];

    if (enhancedBlock) {
      body.push(
        '<!-- ============= 增强段 (源: ' + args.in + ' 行 ' + eStart + '–' + eEnd + ') ============= -->',
        '',
        enhancedBlock,
        ''
      );
    }

    body.push(
      '<!-- ============= 互动 Widget (由 studio 发布后注入) ============= -->',
      '',
      '## 互动实验',
      '',
      '<!-- 旧 STM32 示例: ::widget[pwm-waveform]{id="P04-buzzer-pwm-001"} -->',
      ''
    );

    await writeFile(filepath, body.join('\n'), 'utf8');
    okCount++;
  }

  console.log(`✓ Wrote ${okCount} project markdown files to ${outDir}`);
  if (failures.length) {
    console.error('✗ Failures:');
    for (const f of failures) console.error(`  ${f.id}: ${f.reason}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
