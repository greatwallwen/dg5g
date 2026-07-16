#!/usr/bin/env node
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'textbook', 'pilot', 'current-P04.png');

const exec = 'C:\\Users\\alvin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const browser = await chromium.launch({ executablePath: exec });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:4321/projects/P04', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(2000);
await p.screenshot({ path: OUT, fullPage: true });
console.log('saved', OUT);
await browser.close();
