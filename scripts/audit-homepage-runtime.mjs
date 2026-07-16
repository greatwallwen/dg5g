#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './utils/playwright-browser.mjs';
import { closeStaticSiteServer, startStaticSiteServerIfNeeded } from './utils/static-site-server.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'output', 'playwright');

function parseArgs(argv) {
  if (argv[0] === '--') argv = argv.slice(1);
  const args = {
    baseUrl: null,
    outDir: DEFAULT_OUT_DIR,
    width: 1440,
    height: 900,
    waitMs: 900,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      args.baseUrl = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === '--out') {
      args.outDir = path.resolve(process.cwd(), requireValue(argv, index, arg));
      index += 1;
    } else if (arg === '--viewport') {
      const [width, height] = requireValue(argv, index, arg).split('x').map((item) => readPositiveInt(item, arg));
      args.width = width;
      args.height = height;
      index += 1;
    } else if (arg === '--wait-ms') {
      args.waitMs = readPositiveInt(requireValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function readPositiveInt(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${flag} expects a positive integer`);
  return number;
}

function usage() {
  return [
    'Usage: node scripts/audit-homepage-runtime.mjs [options]',
    '',
    'Options:',
    '  --base-url http://127.0.0.1:4321',
    '  --out output/playwright',
    '  --viewport 1440x900',
    '  --wait-ms 900',
    '',
    'Audits the DGBook homepage hero, navigation, media, and visible copy.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  await mkdir(args.outDir, { recursive: true });
  const staticServer = await startStaticSiteServerIfNeeded(args, ROOT_DIR);
  const browser = await launchChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: args.width, height: args.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  try {
    const url = normalizeRootUrl(args.baseUrl);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(args.waitMs);
    const screenshot = path.join(args.outDir, 'homepage-runtime-audit.png');
    await page.screenshot({ path: screenshot, fullPage: false });

    const audit = await page.evaluate(async () => {
      const bodyText = document.body.innerText || '';
      const hero = document.querySelector('.home-hero');
      const heroRect = hero?.getBoundingClientRect();
      const capabilityImage = document.querySelector('.home-capability-frame img');
      const capabilityImageSrc = capabilityImage?.getAttribute('src') || '';
      const capabilityImageOk = capabilityImageSrc ? await probeAsset(capabilityImageSrc) : false;
      const cta = document.querySelector('.home-cta');
      const ghost = document.querySelector('.home-ghost');
      const bottomNode = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 12);

      return {
        title: document.querySelector('.home-title span')?.textContent?.trim() || document.querySelector('h1')?.textContent?.trim() || '',
        kicker: document.querySelector('.home-kicker')?.textContent?.trim() || '',
        subtitle: document.querySelector('.home-subtitle')?.textContent?.trim() || '',
        ctaText: cta?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ctaHref: cta?.getAttribute('href') || '',
        ghostText: ghost?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ghostHref: ghost?.getAttribute('href') || '',
        heroHeight: heroRect?.height ?? 0,
        heroBottom: heroRect?.bottom ?? 0,
        nextSectionVisible: Boolean(bottomNode?.closest('.home-path, .home-band, .home-feature-card')) || (heroRect?.bottom ?? 0) < window.innerHeight - 32,
        capabilityImageSrc,
        capabilityImageOk,
        capabilityPillCount: document.querySelectorAll('.home-capability-pill').length,
        capabilityTriggerCount: document.querySelectorAll('[data-map-open]').length,
        capabilityPulseCount: document.querySelectorAll('.home-map-pulse').length,
        capabilityOverlayText: document.querySelector('.home-capability-overlay')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        proofCount: document.querySelectorAll('.home-proof-list span').length,
        fusionLayers: document.querySelectorAll('.home-fusion-bg span').length,
        oldHeroNoise: document.querySelectorAll('.home-console, .home-hero-video, .home-hero-map, .home-training-arena, .home-game-lane').length,
        statCount: document.querySelectorAll('.home-stat').length,
        featuredCount: document.querySelectorAll('.home-feature-card').length,
        chapterCount: document.querySelectorAll('.home-chapter-card').length,
        projectCount: document.querySelectorAll('.home-project-card').length,
        quickActionCount: document.querySelectorAll('.home-index-actions a').length,
        reducedMotionRule: hasReducedMotionRule(),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        mojibakeHits: countMojibake(bodyText),
      };

      async function probeAsset(src) {
        try {
          const response = await fetch(src, { method: 'HEAD' });
          if (response.ok) return true;
          const fallback = await fetch(src, { headers: { Range: 'bytes=0-32' } });
          return fallback.ok || fallback.status === 206;
        } catch {
          return false;
        }
      }

      function hasReducedMotionRule() {
        for (const sheet of [...document.styleSheets]) {
          try {
            if ([...sheet.cssRules].some((rule) => String(rule.cssText).includes('prefers-reduced-motion'))) return true;
          } catch {
            continue;
          }
        }
        return false;
      }

      function countMojibake(text) {
        const fragments = [
          [0xfffd],
          [0x951b],
          [0x7ed7],
          [0x5a11],
          [0x4fd9],
          [0x93c1],
          [0x9366],
          [0x7f03, 0x6220],
          [0x6d7c, 0x6a3a],
          [0x7039, 0x3085],
          [0x941c],
          [0x93c5],
          [0x9350],
          [0xc3],
          [0xc2],
          [0xe2, 0x20ac],
        ].map((codes) => String.fromCharCode(...codes));
        return fragments.reduce((sum, fragment) => sum + text.split(fragment).length - 1, 0);
      }
    });

    await page.locator('.home-capability-trigger').click();
    await page.waitForTimeout(260);
    const modalScreenshot = path.join(args.outDir, 'homepage-map-modal-audit.png');
    await page.screenshot({ path: modalScreenshot, fullPage: false });
    const modalAudit = await page.evaluate(() => {
      const modal = document.querySelector('[data-map-modal]');
      const panel = document.querySelector('.home-map-modal-panel');
      const image = document.querySelector('.home-map-modal-canvas img');
      const rect = panel?.getBoundingClientRect();
      return {
        visible: Boolean(modal && !modal.hidden && modal.classList.contains('is-open')),
        ariaHidden: modal?.getAttribute('aria-hidden') ?? '',
        bodyLocked: document.body.classList.contains('home-map-modal-open'),
        panelWidth: rect?.width ?? 0,
        panelHeight: rect?.height ?? 0,
        imageSrc: image?.getAttribute('src') || '',
        pathAfterOpen: window.location.pathname,
      };
    });

    const blockingIssues = homepageIssues(audit, modalAudit, consoleErrors, args);
    const report = {
      tool: 'audit-homepage-runtime',
      baseUrl: args.baseUrl,
      viewport: { width: args.width, height: args.height },
      screenshot: relativeToRoot(screenshot),
      modalScreenshot: relativeToRoot(modalScreenshot),
      audit,
      modalAudit,
      consoleErrors,
      blockingIssues,
      totals: { blockingIssues: blockingIssues.length },
    };
    const reportPath = path.join(args.outDir, 'homepage-runtime-audit-report.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (blockingIssues.length) process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
    await closeStaticSiteServer(staticServer);
  }
}

function homepageIssues(audit, modalAudit, consoleErrors, args) {
  const issues = [];
  if (consoleErrors.length) issues.push({ code: 'homepage-console-error', consoleErrors });
  if (audit.title !== '5G网络优化（高级）') issues.push({ code: 'homepage-title-invalid', title: audit.title });
  if (!/DGBook/.test(audit.kicker) || !/5G/.test(audit.kicker)) issues.push({ code: 'homepage-kicker-missing', kicker: audit.kicker });
  if (audit.subtitle.length < 36) issues.push({ code: 'homepage-subtitle-too-thin', subtitle: audit.subtitle });
  if (!audit.ctaText.includes('开始学习') || !audit.ctaHref.includes('/projects/P01')) issues.push({ code: 'homepage-primary-cta-invalid', ctaText: audit.ctaText, ctaHref: audit.ctaHref });
  if (!audit.ghostText.includes('信令') || !audit.ghostHref.includes('/projects/P17')) issues.push({ code: 'homepage-secondary-cta-invalid', ghostText: audit.ghostText, ghostHref: audit.ghostHref });
  if (audit.heroHeight < args.height * 0.62) issues.push({ code: 'homepage-hero-too-short', heroHeight: audit.heroHeight, viewportHeight: args.height });
  if (audit.heroHeight > args.height * 0.98) issues.push({ code: 'homepage-hero-too-tall', heroHeight: audit.heroHeight, viewportHeight: args.height });
  if (!audit.nextSectionVisible) issues.push({ code: 'homepage-next-section-hidden', heroBottom: audit.heroBottom, viewportHeight: args.height });
  if (!audit.capabilityImageSrc || !audit.capabilityImageOk) issues.push({ code: 'homepage-capability-map-missing', capabilityImageSrc: audit.capabilityImageSrc, capabilityImageOk: audit.capabilityImageOk });
  if (audit.capabilityPillCount !== 4) issues.push({ code: 'homepage-capability-pill-count-invalid', capabilityPillCount: audit.capabilityPillCount });
  if (audit.capabilityTriggerCount < 2) issues.push({ code: 'homepage-capability-trigger-missing', capabilityTriggerCount: audit.capabilityTriggerCount });
  if (audit.capabilityPulseCount < 3) issues.push({ code: 'homepage-capability-motion-missing', capabilityPulseCount: audit.capabilityPulseCount });
  if (!audit.capabilityOverlayText.includes('岗位任务') || !audit.capabilityOverlayText.includes('成果评价')) issues.push({ code: 'homepage-capability-overlay-thin', capabilityOverlayText: audit.capabilityOverlayText });
  if (!modalAudit.visible || modalAudit.ariaHidden !== 'false' || !modalAudit.bodyLocked) issues.push({ code: 'homepage-capability-modal-not-open', modalAudit });
  if (modalAudit.panelWidth < args.width * 0.72 || modalAudit.panelHeight < args.height * 0.68) issues.push({ code: 'homepage-capability-modal-too-small', modalAudit });
  if (!modalAudit.imageSrc.includes('capability-map')) issues.push({ code: 'homepage-capability-modal-image-missing', modalAudit });
  if (modalAudit.pathAfterOpen !== '/') issues.push({ code: 'homepage-capability-modal-navigated-away', pathAfterOpen: modalAudit.pathAfterOpen });
  if (audit.proofCount !== 3) issues.push({ code: 'homepage-proof-list-invalid', proofCount: audit.proofCount });
  if (audit.fusionLayers < 3) issues.push({ code: 'homepage-fusion-layer-missing', fusionLayers: audit.fusionLayers });
  if (audit.oldHeroNoise > 0) issues.push({ code: 'homepage-old-hero-noise-present', oldHeroNoise: audit.oldHeroNoise });
  if (audit.statCount !== 4) issues.push({ code: 'homepage-stats-invalid', statCount: audit.statCount });
  if (audit.featuredCount < 4) issues.push({ code: 'homepage-featured-path-missing', featuredCount: audit.featuredCount });
  if (audit.chapterCount !== 6) issues.push({ code: 'homepage-chapters-invalid', chapterCount: audit.chapterCount });
  if (audit.projectCount > 0) issues.push({ code: 'homepage-project-wall-present', projectCount: audit.projectCount });
  if (audit.quickActionCount < 3) issues.push({ code: 'homepage-quick-actions-missing', quickActionCount: audit.quickActionCount });
  if (!audit.reducedMotionRule) issues.push({ code: 'homepage-reduced-motion-missing' });
  if (audit.horizontalOverflow) issues.push({ code: 'homepage-horizontal-overflow', scrollWidth: audit.scrollWidth, viewportWidth: audit.viewportWidth });
  if (audit.mojibakeHits > 0) issues.push({ code: 'homepage-mojibake', mojibakeHits: audit.mojibakeHits });
  return issues;
}

function normalizeRootUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function relativeToRoot(file) {
  return path.relative(ROOT_DIR, file).replaceAll(path.sep, '/');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
