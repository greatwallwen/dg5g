#!/usr/bin/env node
// scripts/playwright-snapshot.mjs — 给 site 抓 3 主题 × 2 页面 = 6 张截图

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'textbook', 'pilot');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';

const THEMES = ['paper-green', 'dark-circuit', 'apple-minimal', 'engineering-blueprint'];
const PAGES = [
  { path: '/',             name: 'home' },
  { path: '/projects/P04', name: 'P04'  },
  { path: '/projects/P05', name: 'P05'  }
];

async function main() {
  await mkdir(OUT, { recursive: true });

  // 沿用已安装的 chromium-1208(避免重新下载 1223)
  const exec = process.env.PLAYWRIGHT_CHROMIUM
    ?? 'C:\\Users\\alvin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
  const browser = await chromium.launch({ executablePath: exec });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });

  for (const theme of THEMES) {
    for (const page of PAGES) {
      const p = await ctx.newPage();
      // 提前注入 localStorage(在导航前)
      await p.addInitScript((t) => {
        localStorage.setItem('dgbook-theme', t);
      }, theme);

      const url = `${BASE}${page.path}`;
      console.log(`→ ${theme} :: ${url}`);
      await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // 等 widget island 完成 hydration
      await p.waitForTimeout(1500);

      const filename = `pilot-${page.name}-${theme}.png`;
      const outFile = resolve(OUT, filename);
      await p.screenshot({ path: outFile, fullPage: true });
      console.log(`  ✓ ${filename}`);
      await p.close();
    }
  }

  await ctx.close();
  await browser.close();
  console.log(`\nDone. Screenshots saved to ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
