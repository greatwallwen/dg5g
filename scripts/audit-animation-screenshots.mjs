#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './utils/playwright-browser.mjs';
import { closeStaticSiteServer, startStaticSiteServerIfNeeded } from './utils/static-site-server.mjs';
import { runWithConcurrency } from './utils/run-with-concurrency.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'output', 'playwright');
const DEFAULT_PROJECTS = ['P01', 'P08', 'P12', 'P17', 'P18'];
const EPSILON = 0.5;
function parseArgs(argv) {
  if (argv[0] === '--') argv = argv.slice(1);
  const args = {
    baseUrl: null,
    outDir: DEFAULT_OUT_DIR,
    projects: DEFAULT_PROJECTS,
    waitMs: 2600,
    width: 1365,
    height: 768,
    concurrency: 3,
    failOnConsole: true,
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
    } else if (arg === '--projects') {
      args.projects = requireValue(argv, index, arg).split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--wait-ms') {
      args.waitMs = readPositiveInt(requireValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--viewport') {
      const [width, height] = requireValue(argv, index, arg).split('x').map((item) => readPositiveInt(item, arg));
      args.width = width;
      args.height = height;
      index += 1;
    } else if (arg === '--concurrency') {
      args.concurrency = readPositiveInt(requireValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--allow-console-errors') {
      args.failOnConsole = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.projects.length === 0) throw new Error('--projects must include at least one project id');
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

function usage() { return 'Usage: node scripts/audit-animation-screenshots.mjs [--base-url URL] [--projects P01,P08] [--out output/playwright] [--wait-ms 2600] [--viewport 1365x768] [--concurrency 3] [--allow-console-errors]'; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage()); return;
  }

  await mkdir(args.outDir, { recursive: true });
  const staticServer = await startStaticSiteServerIfNeeded(args, ROOT_DIR);
  const browser = await launchChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: args.width, height: args.height } });
  const consoleErrors = [];
  const results = [];

  try {
    await runWithConcurrency(args.projects, args.concurrency, async (projectId) => {
      console.error(`[audit-animation-screenshots] start ${projectId}`);
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push({ projectId, text: message.text() });
        }
      });
      page.on('pageerror', (error) => {
        consoleErrors.push({ projectId, text: error.message });
      });

      try {
        const result = await auditProject(page, args, projectId);
        results.push(result);
        console.error(`[audit-animation-screenshots] done ${projectId}: blocking=${result.blockingIssues.length}`);
      } catch (error) {
        results.push({ projectId, blockingIssues: [{ code: 'audit-crashed', message: error.message }] });
      } finally { await page.close(); }
    });
  } finally {
    await context.close();
    await browser.close();
    await closeStaticSiteServer(staticServer);
  }

  const summary = {
    tool: 'audit-animation-screenshots',
    baseUrl: args.baseUrl,
    viewport: { width: args.width, height: args.height },
    outDir: relativeToRoot(args.outDir),
    consoleErrors,
    results,
    totals: summarize(results, consoleErrors, args.failOnConsole),
  };
  const reportPath = path.join(args.outDir, 'animation-screenshot-audit-report.json');
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.totals.blockingIssues > 0) {
    process.exitCode = 1;
  }
}

async function auditProject(page, args, projectId) {
  const url = new URL(`/projects/${projectId}/`, normalizeBaseUrl(args.baseUrl)).toString();
  const stage = await gotoProjectStage(page, url);
  await page.waitForTimeout(args.waitMs);

  const screenshotPath = path.join(args.outDir, `${projectId}-desktop-animation-audit.png`);
  const screenshotIssue = await captureLocatorClip(page, stage, screenshotPath);

  const audit = await page.evaluate(() => {
    const stageNode = document.querySelector('.lesson-animation');
    const stageRect = stageNode?.getBoundingClientRect();
    const nodes = [...document.querySelectorAll('[data-animation-element-id]')];
    const elements = nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const id = node.getAttribute('data-animation-element-id') || node.id || '';
        const type = node.getAttribute('data-animation-type') || (node.tagName.toLowerCase() === 'g' ? 'line' : '');
        return {
          id,
          type,
          role: node.getAttribute('data-animation-role') || '',
          tagName: node.tagName.toLowerCase(),
          className: typeof node.className === 'string' ? node.className : '',
          text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) > 0.02,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
          },
        };
      })
      .filter((item) => item.visible);
    return {
      stageRect: stageRect
        ? { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height, right: stageRect.right, bottom: stageRect.bottom }
        : null,
      layout: layoutSummary(stageNode, stageRect),
      totalElementCount: nodes.length,
      stagePage: stageNode?.querySelector('.dg-teaching-stage')?.getAttribute('data-stage-page') || '',
      pageChrome: document.querySelector('.dg-stage-page-chrome')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      pageLayers: {
        openmaicDock: visibleCount('.dg-teaching-dock-shell .dg-teaching-dock, [data-openmaic-dock="true"]'),
        avatar: visibleCount('.dg-teaching-avatar'),
        transcript: visibleCount('.dg-teaching-transcript-text'),
        content: document.querySelectorAll('#sec-overview, #sec-core-model, .dg-knowledge-unit').length,
        animation: document.querySelectorAll('[data-widget-shell="lesson-animation"][data-playback-layer="animation"], .lesson-animation').length,
        interactive: document.querySelectorAll('[data-widget-shell="edugame-pixi"][data-playback-layer="interactive"], .dg-edugame-interactive').length,
      },
      elements,
      overflowText: [...document.querySelectorAll('[data-text-overflow="true"]')].map((node) => {
        const host = node.closest('[data-animation-element-id]');
        return host?.getAttribute('data-animation-element-id') || '';
      }).filter(Boolean),
      callouts: [...document.querySelectorAll('.dg-stage-callout')].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          target: node.getAttribute('data-target') || '',
          text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
        };
      }),
      visualEffects: {
        spotlight: document.querySelectorAll('.dg-stage-spotlight').length,
        laser: document.querySelectorAll('.dg-stage-laser, .dg-stage-laser-beam, .dg-stage-laser-pin').length,
        highlight: document.querySelectorAll('.dg-stage-highlight').length,
        packet: document.querySelectorAll('.dg-stage-packet').length,
        transition: document.querySelectorAll('.dg-stage-transition').length,
      },
      mediaTracks: mediaTrackIssues(stageRect),
      tableDecks: tableDeckIssues(),
      layerState: layerStateSummary(),
      textAlignment: textAlignmentIssues(),
      renderedTextClipping: renderedTextClippingIssues(),
    };

    function layoutSummary(stageNode, stageRect) {
      const screen = stageNode?.querySelector('.dg-teaching-stage-screen');
      const dock = stageNode?.querySelector('.dg-teaching-dock');
      const content = [...document.querySelectorAll('main, article, .project-main, .project-content, .dgbook-project')]
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => b.width - a.width)[0];
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const stage = stageRect ? rectOf(stageRect) : null;
      const contentRect = content ? rectOf(content) : null;
      return {
        viewport,
        lessonRect: stage,
        screenRect: screen ? rectOf(screen.getBoundingClientRect()) : null,
        dockRect: dock ? rectOf(dock.getBoundingClientRect()) : null,
        contentRect,
        widthRatio: stage ? stage.width / Math.max(1, viewport.width) : 0,
        heightRatio: stage ? stage.height / Math.max(1, viewport.height) : 0,
        contentWidthRatio: stage && contentRect ? stage.width / Math.max(1, contentRect.width) : 0,
      };
    }

    function visibleCount(selector) {
      return [...document.querySelectorAll(selector)].filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.02;
      }).length;
    }

    function mediaTrackIssues(stageRect) {
      if (!stageRect) return [];
      return [...document.querySelectorAll('.dg-stage-media-track')].map((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const areaRatio = (rect.width * rect.height) / Math.max(1, stageRect.width * stageRect.height);
        const video = node.querySelector('video');
        const parsedZIndex = Number(style.zIndex);
        return {
          id: node.getAttribute('data-media-track') || node.getAttribute('data-animation-element-id') || '',
          controlled: node.getAttribute('data-media-controlled') || '',
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.02,
          zIndex: Number.isFinite(parsedZIndex) ? parsedZIndex : 0,
          areaRatio,
          hasAutoplay: Boolean(video?.hasAttribute('autoplay')),
          hasLoop: Boolean(video?.hasAttribute('loop')),
          rect: rectOf(rect),
        };
      });
    }

    function tableDeckIssues() {
      return [...document.querySelectorAll('.dg-stage-element-table')].map((host) => {
        const table = host.querySelector('.dg-stage-table');
        if (!table) return null;
        const rowCount = Number(table.getAttribute('data-table-rows') || table.querySelectorAll('tbody tr').length);
        const colCount = Number(table.getAttribute('data-table-cols') || table.querySelectorAll('thead th, tbody tr:first-child td').length);
        const mode = table.getAttribute('data-table-mode') || table.closest('[data-table-mode]')?.getAttribute('data-table-mode') || '';
        if ((rowCount <= 4 && colCount <= 3) || mode === 'deck') return null;
        return {
          id: host.getAttribute('data-animation-element-id') || host.id || '',
          rowCount,
          colCount,
          mode,
        };
      }).filter(Boolean);
    }

    function layerStateSummary() {
      const states = ['base', 'current', 'past', 'distant-past', 'next', 'future'];
      const counts = Object.fromEntries(states.map((state) => [state, document.querySelectorAll(`[data-layer-state="${state}"]`).length]));
      return {
        phaseRail: document.querySelectorAll('.dg-stage-phase-rail span').length,
        currentPhaseRail: document.querySelectorAll('.dg-stage-phase-rail span.is-current').length,
        counts,
      };
    }

    function renderedTextClippingIssues() {
      return [...document.querySelectorAll('.dg-stage-element-text .dg-stage-text-content')]
        .map((content) => {
          const host = content.closest('[data-animation-element-id]');
          if (!host) return null;
          const hostStyle = window.getComputedStyle(host);
          const contentStyle = window.getComputedStyle(content);
          if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden' || Number(hostStyle.opacity || 1) <= 0.02) return null;
          const xOverflow = content.scrollWidth > content.clientWidth + 2;
          const yOverflow = content.scrollHeight > content.clientHeight + 2;
          if (!xOverflow && !yOverflow) return null;
          const rect = content.getBoundingClientRect();
          return {
            id: host.getAttribute('data-animation-element-id') || host.id || '',
            role: host.getAttribute('data-animation-role') || '',
            text: (content.textContent || '').replace(/\s+/g, ' ').trim(),
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
            scrollHeight: content.scrollHeight,
            clientHeight: content.clientHeight,
            whiteSpace: contentStyle.whiteSpace,
            rect: rectOf(rect),
          };
        })
        .filter(Boolean);
    }

    function textAlignmentIssues() {
      return [...document.querySelectorAll('.dg-stage-element-text[data-animation-role]')]
        .map((host) => {
          const role = host.getAttribute('data-animation-role') || '';
          if (role === 'title' || role === 'subtitle' || role === 'decor') return null;
          const content = host.querySelector('.dg-stage-text-content');
          if (!content) return null;
          const hostRect = host.getBoundingClientRect();
          const textRect = textBounds(content);
          if (!textRect || hostRect.width <= 0 || hostRect.height <= 0 || textRect.width <= 0 || textRect.height <= 0) return null;
          const dx = Math.abs((textRect.left + textRect.width / 2) - (hostRect.left + hostRect.width / 2));
          const dy = Math.abs((textRect.top + textRect.height / 2) - (hostRect.top + hostRect.height / 2));
          const xLimit = Math.max(10, hostRect.width * 0.24);
          const yLimit = Math.max(7, hostRect.height * 0.26);
          if (dx <= xLimit && dy <= yLimit) return null;
          return {
            id: host.getAttribute('data-animation-element-id') || host.id || '',
            role,
            dx,
            dy,
            hostRect: rectOf(hostRect),
            textRect: rectOf(textRect),
          };
        })
        .filter(Boolean);
    }

    function textBounds(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const rects = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) rects.push(rect);
        }
        range.detach();
      }
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { left, top, width: right - left, height: bottom - top, right, bottom };
    }

    function rectOf(rect) {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    }
  });

  const blockingOverlaps = findBlockingOverlaps(audit.elements);
  const outOfStage = audit.stageRect ? findOutOfStageElements(audit.elements, audit.stageRect) : [];
  const runtimeMotion = await auditRuntimeMotion(page, args, projectId, stage);
  const stageDensity = summarizeStageDensity(audit.elements, audit.stageRect, projectId);
  const layoutIssues = stageLayoutIssues(audit.layout);
  const blockingIssues = [
    ...layoutIssues,
    ...stageDensity.issues,
    ...blockingOverlaps.map((item) => ({ code: 'rendered-overlap', ...item })),
    ...outOfStage.map((item) => ({ code: 'rendered-out-of-stage', ...item })),
    ...audit.overflowText.map((id) => ({ code: 'rendered-text-overflow', id })),
    ...audit.renderedTextClipping.map((item) => ({ code: 'rendered-text-clipped', ...item })),
    ...audit.textAlignment.map((item) => ({ code: 'text-not-centered', ...item })),
    ...audit.mediaTracks.filter((item) => item.visible && (item.controlled !== 'timeline' || item.zIndex >= 40 || item.areaRatio > 0.62 || item.hasAutoplay || item.hasLoop)).map((item) => ({ code: 'uncontrolled-media-track', ...item })),
    ...audit.tableDecks.map((item) => ({ code: 'dense-table-not-decked', ...item })),
    ...audit.callouts.filter((item) => item.text.length <= 16).map((item) => ({ code: 'short-callout', target: item.target, text: item.text })),
    ...(audit.stageRect ? [] : [{ code: 'missing-stage' }]),
    ...(audit.layerState.phaseRail < 6 ? [{ code: 'missing-phase-rail', phaseRail: audit.layerState.phaseRail }] : []),
    ...(audit.layerState.currentPhaseRail !== 1 ? [{ code: 'phase-rail-current-invalid', currentPhaseRail: audit.layerState.currentPhaseRail }] : []),
    ...(audit.layerState.counts.current < 1 ? [{ code: 'missing-current-layer', layerState: audit.layerState }] : []),
    ...(audit.totalElementCount < minElementsFor(projectId) ? [{ code: 'low-total-element-count', count: audit.totalElementCount, expected: minElementsFor(projectId) }] : []),
    ...(!audit.stagePage ? [{ code: 'missing-stage-page' }] : []),
    ...(!audit.pageChrome ? [{ code: 'missing-page-chrome' }] : []),
    ...(audit.pageLayers.openmaicDock < 1 ? [{ code: 'missing-openmaic-dock', pageLayers: audit.pageLayers }] : []),
    ...(audit.pageLayers.avatar < 1 ? [{ code: 'missing-dock-avatar', pageLayers: audit.pageLayers }] : []),
    ...(audit.pageLayers.transcript < 1 ? [{ code: 'missing-scrolling-transcript', pageLayers: audit.pageLayers }] : []),
    ...(audit.pageLayers.content < 1 ? [{ code: 'missing-content-layer', pageLayers: audit.pageLayers }] : []),
    ...(audit.pageLayers.animation < 1 ? [{ code: 'missing-animation-layer', pageLayers: audit.pageLayers }] : []),
    ...(audit.pageLayers.interactive < 1 ? [{ code: 'missing-interactive-layer', pageLayers: audit.pageLayers }] : []),
    ...(runtimeMotion.transition < 1 ? [{ code: 'runtime-transition-missing', runtimeMotion }] : []),
    ...(runtimeMotion.packetTargetFound && runtimeMotion.packet < 1 ? [{ code: 'runtime-packet-missing', runtimeMotion }] : []),
    ...(runtimeMotion.spotlightVisible < 1 && runtimeMotion.laser < 1 ? [{ code: 'runtime-spotlight-or-laser-missing', runtimeMotion }] : []),
    ...(runtimeMotion.spotlightDimOpacity > 0.02 ? [{ code: 'runtime-spotlight-too-dark', dimOpacity: runtimeMotion.spotlightDimOpacity, runtimeMotion }] : []),
  ];

  return {
    projectId,
    url,
    screenshot: screenshotPath,
    screenshotIssue,
    runtimeScreenshot: runtimeMotion.screenshot,
    totalElementCount: audit.totalElementCount,
    stagePage: audit.stagePage,
    pageChrome: audit.pageChrome,
    pageLayers: audit.pageLayers,
    layout: audit.layout,
    stageDensity,
    elementCount: audit.elements.length,
    visualEffects: audit.visualEffects,
    mediaTracks: audit.mediaTracks,
    tableDecks: audit.tableDecks,
    runtimeMotion,
    layerState: audit.layerState,
    calloutCount: audit.callouts.length,
    overflowText: audit.overflowText,
    renderedTextClipping: audit.renderedTextClipping,
    textAlignment: audit.textAlignment,
    blockingOverlaps,
    outOfStage,
    blockingIssues,
  };
}

async function gotoProjectStage(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      const stage = page.locator('.lesson-animation').first();
      await stage.waitFor({ state: 'visible', timeout: 30_000 });
      return stage;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750 * attempt);
    }
  }
  throw lastError;
}

async function auditRuntimeMotion(page, args, projectId, stage) {
  await page.evaluate((id) => {
    const widgetId = `${id}-lesson-animation-001`;
    const bridge = globalThis.__dgbookWidgetBridge;
    const handlers = [...(bridge?.handlers?.get(widgetId) ?? [])];
    for (const handler of handlers) {
      handler({ requestId: `${id}-runtime-seek`, widgetId, type: 'SET_TIMELINE_TIME', payload: { state: { activeStep: 1, currentTimeMs: 15000 } } });
    }
  }, projectId);
  await page.waitForTimeout(120);
  await page.evaluate((id) => {
    const widgetId = `${id}-lesson-animation-001`;
    const handlers = [...(globalThis.__dgbookWidgetBridge?.handlers?.get(widgetId) ?? [])];
    for (const handler of handlers) {
      handler({
        requestId: `${id}-runtime-transition`,
        widgetId,
        type: 'RUN_CUE',
        payload: {
          target: `${id}-top-band`,
          effect: 'sceneTransition',
          state: { targets: [`${id}-top-band`], phase: 2, phaseLabel: '转场' },
          durationMs: 1200,
        },
      });
    }
  }, projectId);
  await page.waitForTimeout(560);
  const transitionCount = await page.evaluate(() => document.querySelectorAll('.dg-stage-transition').length);
  await page.evaluate((id) => {
    const widgetId = `${id}-lesson-animation-001`;
    const handlers = [...(globalThis.__dgbookWidgetBridge?.handlers?.get(widgetId) ?? [])];
    const line = [...document.querySelectorAll('[data-animation-type="line"], .dg-stage-lines [data-animation-element-id]')]
      .find((node) => {
        const id = node.getAttribute('data-animation-element-id') || '';
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return !id.includes('-ladder-')
          && rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.02;
      });
    const lineId = line?.getAttribute('data-animation-element-id') || '';
    globalThis.__dgbookRuntimeAuditPacketTargetFound = Boolean(lineId);
    globalThis.__dgbookRuntimeAuditPacketTarget = lineId;
    if (!lineId) return;
    for (const handler of handlers) {
      handler({ requestId: `${id}-runtime-packet`, widgetId, type: 'RUN_CUE', payload: { target: lineId, effect: 'packetMove', state: { targets: [lineId], color: '#0f766e' }, durationMs: 1300 } });
    }
  }, projectId);
  await page.waitForTimeout(560);
  await page.evaluate((id) => {
    const widgetId = `${id}-lesson-animation-001`;
    const handlers = [...(globalThis.__dgbookWidgetBridge?.handlers?.get(widgetId) ?? [])];
    const target = [...document.querySelectorAll('[data-animation-element-id]')]
      .find((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return node.getAttribute('data-animation-type') !== 'line'
          && rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0.02;
      });
    const targetId = target?.getAttribute('data-animation-element-id') || `${id}-title`;
    for (const handler of handlers) {
      handler({
        requestId: `${id}-runtime-spotlight`,
        widgetId,
        type: 'RUN_CUE',
        payload: {
          target: targetId,
          effect: 'spotlight',
          state: { targets: [targetId], color: '#f59e0b', dimOpacity: 0.07 },
          durationMs: 1300,
        },
      });
    }
  }, projectId);
  await page.waitForTimeout(320);
  const screenshot = path.join(args.outDir, `${projectId}-desktop-runtime-motion-audit.png`);
  const screenshotIssue = await captureLocatorClip(page, stage, screenshot);
  const audit = await page.evaluate(() => {
    function visibleCount(selector) {
      return [...document.querySelectorAll(selector)].filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.02;
      }).length;
    }
    return {
      transition: document.querySelectorAll('.dg-stage-transition').length,
      packet: document.querySelectorAll('.dg-stage-packet').length,
      spotlightVisible: visibleCount('.dg-stage-spotlight'),
      spotlightDimOpacity: strongestSpotlightDim(),
      laser: visibleCount('.laser-dot, .dg-stage-laser, .dg-stage-laser-beam, .dg-stage-laser-pin'),
      highlightVisible: visibleCount('.dg-stage-highlight'),
      stagePhase: document.querySelector('.dg-teaching-stage')?.getAttribute('data-stage-phase') || '',
      stagePage: document.querySelector('.dg-teaching-stage')?.getAttribute('data-stage-page') || '',
      pageChrome: document.querySelector('.dg-stage-page-chrome')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      packetTargetFound: Boolean(globalThis.__dgbookRuntimeAuditPacketTargetFound),
      packetTarget: String(globalThis.__dgbookRuntimeAuditPacketTarget || ''),
    };

    function strongestSpotlightDim() {
      return Math.max(
        0,
        ...[...document.querySelectorAll('.dg-stage-spotlight rect[mask], .stage-spotlight rect[mask]')]
          .map((node) => parseFillAlpha(node.getAttribute('fill') || window.getComputedStyle(node).fill || ''))
          .filter((value) => Number.isFinite(value)),
      );
    }

    function parseFillAlpha(value) {
      const rgba = value.match(/rgba?\(([^)]+)\)/i);
      if (!rgba) return 0;
      const parts = rgba[1].split(',').map((part) => Number(part.trim()));
      if (parts.length < 4) return 1;
      return parts[3];
    }
  });
  return { ...audit, transition: Math.max(transitionCount, audit.transition), screenshot, screenshotIssue };
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function minElementsFor(projectId) {
  return projectId === 'P17' ? 75 : 36;
}

function stageLayoutIssues(layout) {
  const viewport = layout?.viewport;
  const lesson = layout?.lessonRect;
  const screen = layout?.screenRect;
  const issues = [];
  if (!viewport || !lesson) return [{ code: 'stage-layout-missing' }];
  if (lesson.width < viewport.width * 0.66) issues.push({ code: 'stage-not-wide-enough', width: round(lesson.width), viewportWidth: viewport.width });
  if (lesson.height < Math.min(460, viewport.height * 0.58)) issues.push({ code: 'stage-too-short', height: round(lesson.height), viewportHeight: viewport.height });
  if (lesson.top > viewport.height * 0.36) issues.push({ code: 'stage-starts-below-fold', top: round(lesson.top), viewportHeight: viewport.height });
  if (layout.contentWidthRatio && layout.contentWidthRatio < 0.9) {
    issues.push({ code: 'stage-does-not-fill-content-width', ratio: round(layout.contentWidthRatio) });
  }
  if (screen && screen.height < Math.min(400, viewport.height * 0.5)) issues.push({ code: 'stage-screen-too-short', height: round(screen.height), viewportHeight: viewport.height });
  return issues;
}

function summarizeStageDensity(elements, stageRect, projectId) {
  const visible = elements.filter((item) => !isIgnoredForGeometry(item));
  const lines = elements.filter((item) => item.type === 'line' || item.tagName === 'g');
  const arrows = lines.filter((item) => /arrow|marker|triangle/i.test(`${item.id} ${item.className} ${item.text}`));
  const area = stageRect ? Math.max(1, stageRect.width * stageRect.height) : 1;
  const maxElements = projectId === 'P17' ? 68 : 52;
  const maxLines = projectId === 'P17' ? 28 : 18;
  const issues = [
    ...(visible.length > maxElements ? [{ code: 'stage-visible-elements-too-dense', count: visible.length, expectedMax: maxElements }] : []),
    ...(lines.length > maxLines ? [{ code: 'stage-lines-too-dense', count: lines.length, expectedMax: maxLines }] : []),
    ...(arrows.length > 10 ? [{ code: 'stage-arrows-too-dense', count: arrows.length }] : []),
  ];
  return {
    visibleElements: visible.length,
    lines: lines.length,
    arrows: arrows.length,
    elementsPerMegapixel: round((visible.length * 1_000_000) / area),
    issues,
  };
}

function findOutOfStageElements(elements, stageRect) {
  return elements
    .filter((item) => !isIgnoredForGeometry(item))
    .filter((item) => {
      const rect = item.rect;
      return (
        rect.left < stageRect.left - EPSILON ||
        rect.top < stageRect.top - EPSILON ||
        rect.right > stageRect.right + EPSILON ||
        rect.bottom > stageRect.bottom + EPSILON
      );
    })
    .map((item) => ({ id: item.id, rect: roundRect(item.rect), stageRect: roundRect(stageRect) }));
}

function findBlockingOverlaps(elements) {
  const result = [];
  for (let firstIndex = 0; firstIndex < elements.length; firstIndex += 1) {
    const first = elements[firstIndex];
    if (isIgnoredForGeometry(first)) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < elements.length; secondIndex += 1) {
      const second = elements[secondIndex];
      if (isIgnoredForGeometry(second)) continue;
      const overlap = intersection(first.rect, second.rect);
      if (!overlap) continue;
      const ratio = overlap.area / Math.min(rectArea(first.rect), rectArea(second.rect));
      if (ratio < 0.14) continue;
      if (isIntentionalPair(first, second)) continue;
      result.push({
        first: first.id,
        second: second.id,
        ratio: round(ratio),
        overlap: roundRect(overlap),
      });
    }
  }
  return result;
}

function isIgnoredForGeometry(item) {
  const id = item.id.toLowerCase();
  const role = item.role.toLowerCase();
  const type = item.type.toLowerCase();
  if (role === 'decor' || role === 'background') return true;
  if (type === 'line' || item.tagName === 'g') return true;
  if (/(\b|-)line-\d+/.test(id)) return true;
  if (/(packet|spark|pulse|dot|marker|signal|flow|road-|room-\d|background|grid)/.test(id)) return true;
  return false;
}

function isIntentionalPair(first, second) {
  if (baseElementId(first.id) === baseElementId(second.id)) return true;
  if (isContainerTextPair(first, second)) return true;
  if (isLayeredDiagramPair(first, second)) return true;
  return false;
}

function baseElementId(id) {
  return String(id ?? '')
    .replace(/-(text|label|caption)$/i, '')
    .replace(/-text-\d+$/i, '');
}

function isContainerTextPair(first, second) {
  const text = first.type === 'text' ? first : second.type === 'text' ? second : null;
  const other = text === first ? second : first;
  if (!text) return false;
  return containsRect(other.rect, text.rect);
}

function isLayeredDiagramPair(first, second) {
  const ids = `${first.id} ${second.id}`.toLowerCase();
  if (/(field|lane|dashboard|core|building|hub|panel|floor-plan|room-|site-|rack|device-|form-sheet|form-check)/.test(ids)) {
    return containsRect(first.rect, second.rect) || containsRect(second.rect, first.rect);
  }
  return false;
}

function containsRect(container, child) {
  return (
    child.left >= container.left - EPSILON &&
    child.top >= container.top - EPSILON &&
    child.right <= container.right + EPSILON &&
    child.bottom <= container.bottom + EPSILON
  );
}

function intersection(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left + EPSILON || bottom <= top + EPSILON) return null;
  const width = right - left;
  const height = bottom - top;
  return { left, top, width, height, right, bottom, area: width * height };
}

function rectArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function roundRect(rect) {
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
    right: round(rect.right),
    bottom: round(rect.bottom),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function summarize(results, consoleErrors, failOnConsole) {
  const blockingIssues = results.reduce((sum, result) => sum + result.blockingIssues.length, 0) + (failOnConsole ? consoleErrors.length : 0);
  return {
    projects: results.length,
    renderedElements: results.reduce((sum, result) => sum + result.elementCount, 0),
    consoleErrors: consoleErrors.length,
    blockingIssues,
    screenshots: results.length,
  };
}

async function captureLocatorClip(page, locator, screenshotPath) {
  let box = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 60_000 });
      await locator.scrollIntoViewIfNeeded();
      box = await locator.boundingBox({ timeout: 60_000 });
      if (box && box.width > 0 && box.height > 0) break;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(300 * attempt);
  }
  if (!box || box.width <= 0 || box.height <= 0) {
    const reason = lastError instanceof Error ? `: ${lastError.message}` : '';
    return { code: 'screenshot-box-warning', message: `Cannot capture screenshot for ${screenshotPath}: empty locator box${reason}` };
  }
  try {
    await page.screenshot({
      path: screenshotPath,
      timeout: 60000,
      animations: 'disabled',
      clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, box.width), height: Math.max(1, box.height) },
    });
    return null;
  } catch (error) {
    return { code: 'screenshot-timeout-warning', message: String(error?.message ?? error) };
  }
}

function relativeToRoot(filePath) {
  return path.relative(ROOT_DIR, filePath).replaceAll(path.sep, '/');
}

main().catch((error) => {
  console.error(JSON.stringify({ tool: 'audit-animation-screenshots', error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
