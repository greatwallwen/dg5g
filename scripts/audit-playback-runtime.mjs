#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './utils/playwright-browser.mjs';
import { closeStaticSiteServer, startStaticSiteServerIfNeeded } from './utils/static-site-server.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  if (argv[0] === '--') argv = argv.slice(1);
  const args = {
    baseUrl: null,
    projects: ['P01', 'P08', 'P12', 'P17', 'P18'],
    outDir: path.join(ROOT_DIR, 'output', 'playwright'),
    waitMs: 5200,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      args.baseUrl = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--projects') {
      args.projects = readValue(argv, index, arg).split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out') {
      args.outDir = path.resolve(process.cwd(), readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--wait-ms') {
      args.waitMs = Number(readValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });
  const staticServer = await startStaticSiteServerIfNeeded(args, ROOT_DIR);
  const browser = await launchChromium({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const results = [];

  try {
    for (const projectId of args.projects) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        const NativeAudio = window.Audio;
        window.__dgbookAudioProbe = [];
        window.addEventListener('dgbook:audio-playback', (event) => {
          window.__dgbookAudioProbe.push({ source: 'engine-event', ...(event.detail ?? {}) });
        });
        const nativeMediaPlay = window.HTMLMediaElement?.prototype?.play;
        if (nativeMediaPlay) {
          window.HTMLMediaElement.prototype.play = function patchedMediaPlay() {
            if (this instanceof window.HTMLAudioElement) {
              window.__dgbookAudioProbe.push({ type: 'media-play-call', src: this.currentSrc || this.src, at: Date.now() });
            }
            return nativeMediaPlay.apply(this, arguments)
              .then((value) => {
                if (this instanceof window.HTMLAudioElement) {
                  window.__dgbookAudioProbe.push({ type: 'media-play-ok', src: this.currentSrc || this.src, readyState: this.readyState, at: Date.now() });
                }
                return value;
              })
              .catch((error) => {
                if (this instanceof window.HTMLAudioElement) {
                  window.__dgbookAudioProbe.push({ type: 'media-play-error', src: this.currentSrc || this.src, error: String(error?.message ?? error), at: Date.now() });
                }
                throw error;
              });
          };
        }
        const nativeSpeak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
        if (nativeSpeak) {
          window.speechSynthesis.speak = (utterance) => {
            window.__dgbookAudioProbe.push({ type: 'browser-tts-speak', text: String(utterance?.text ?? '').slice(0, 80), at: Date.now() });
            return nativeSpeak(utterance);
          };
        }
        window.Audio = function AudioProbe(src) {
          const audio = new NativeAudio(src);
          window.__dgbookAudioProbe.push({ type: 'construct', src: String(src ?? ''), at: Date.now() });
          const nativePlay = audio.play.bind(audio);
          audio.play = () => {
            window.__dgbookAudioProbe.push({ type: 'play-call', src: audio.currentSrc || audio.src, at: Date.now() });
            return nativePlay()
              .then((value) => {
                window.__dgbookAudioProbe.push({ type: 'play-ok', src: audio.currentSrc || audio.src, readyState: audio.readyState, at: Date.now() });
                return value;
              })
              .catch((error) => {
                window.__dgbookAudioProbe.push({ type: 'play-error', src: audio.currentSrc || audio.src, error: String(error?.message ?? error), at: Date.now() });
                throw error;
              });
          };
          audio.addEventListener('canplay', () => {
            window.__dgbookAudioProbe.push({ type: 'canplay', src: audio.currentSrc || audio.src, duration: audio.duration, at: Date.now() });
          });
          return audio;
        };
        window.Audio.prototype = NativeAudio.prototype;
      });

      const responses = [];
      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('/media/tts/')) responses.push({ url, status: response.status(), type: response.headers()['content-type'] ?? '' });
      });

      const result = await auditProject(page, args, projectId, responses);
      results.push(result);
      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
    await closeStaticSiteServer(staticServer);
  }

  const report = {
    tool: 'audit-playback-runtime',
    baseUrl: args.baseUrl,
    results,
    totals: {
      projects: results.length,
      blockingIssues: results.reduce((sum, item) => sum + item.blockingIssues.length, 0),
    },
  };
  const reportPath = path.join(args.outDir, 'playback-runtime-audit-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.blockingIssues > 0) process.exitCode = 1;
}

async function auditProject(page, args, projectId, responses) {
  const url = new URL(`/projects/${projectId}/`, normalizeBaseUrl(args.baseUrl)).toString();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.dg-teaching-dock').first().waitFor({ state: 'visible', timeout: 30_000 });
  const before = await readDock(page);
  await page.locator('.dg-teaching-controls button.is-primary').first().click();
  const samples = await samplePlayback(page, args.waitMs);
  const after = samples.at(-1) ?? await readDock(page);
  const audioProbe = await page.evaluate(() => globalThis.__dgbookAudioProbe ?? []);
  const resourceResponses = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => String(entry.name).includes('/media/tts/'))
    .map((entry) => ({
      url: String(entry.name),
      status: 200,
      type: 'performance-resource',
      transferSize: entry.transferSize,
      duration: entry.duration,
    })));
  const allTtsResponses = [...responses, ...resourceResponses];
  const screenshot = path.join(args.outDir, `${projectId}-playback-runtime.png`);
  const screenshotIssue = await capturePlaybackScreenshot(page, screenshot);
  const transcriptChanged = samples.some((sample) => sample.transcript && sample.transcript !== before.transcript);
  const transcriptScrolled = samples.some((sample) => sample.transcriptScrollTop > before.transcriptScrollTop + 1)
    || after.transcriptScrollTop >= Math.max(0, after.transcriptScrollHeight - after.transcriptClientHeight - 2);
  const effectVisible = samples.some((sample) => sample.spotlightVisible > 0 || sample.laser > 0);
  const contentTargetVisible = before.contentTargetVisible > 0 || samples.some((sample) => sample.contentTargetVisible > 0);
  const audioPlaybackConfirmed = audioProbe.some((item) => item.type === 'play-ok')
    || audioProbe.some((item) => item.type === 'media-play-ok' || item.type === 'audio-play-ok')
    || (audioProbe.some((item) => item.type === 'play-call' || item.type === 'media-play-call' || item.type === 'audio-url')
      && allTtsResponses.some((item) => item.status >= 200 && item.status < 400)
      && transcriptChanged);
  const layoutIssues = playbackLayoutIssues(after.layout, after.theaterMode);
  const layerIssues = playbackLayerIssues(before, after, samples);
  const animationLayer = await auditAnimationLayerNavigation(page);
  const animationLaser = await auditAnimationLaserNavigation(page);

  const blockingIssues = [
    ...(after.mode !== 'playing' ? [{ code: 'dock-not-playing', mode: after.mode }] : []),
    ...(after.openmaicDock < 1 ? [{ code: 'openmaic-dock-missing' }] : []),
    ...(after.avatarVisible < 1 ? [{ code: 'avatar-missing' }] : []),
    ...(!after.prevControlEnabled ? [{ code: 'prev-control-disabled' }] : []),
    ...(!after.nextControlEnabled ? [{ code: 'next-control-disabled' }] : []),
    ...(!transcriptChanged ? [{ code: 'transcript-not-updated', transcript: after.transcript }] : []),
    ...(after.transcriptLines < 1 ? [{ code: 'transcript-lines-missing' }] : []),
    ...(after.currentTranscriptLines < 1 ? [{ code: 'transcript-current-line-missing' }] : []),
    ...(after.transcriptScrollable && !transcriptScrolled ? [{ code: 'transcript-not-scrolled', before: before.transcriptScrollTop, after: after.transcriptScrollTop }] : []),
    ...(after.theaterMode && after.playbackLayer !== 'animation' ? [{ code: 'content-playback-entered-theater-mode' }] : []),
    ...(!contentTargetVisible ? [{ code: 'content-target-not-visible', samples: samples.map(contentSample) }] : []),
    ...(allTtsResponses.some((item) => item.status >= 400) ? [{ code: 'tts-response-error', responses: allTtsResponses }] : []),
    ...(allTtsResponses.length === 0 ? [{ code: 'tts-request-missing' }] : []),
    ...(!audioPlaybackConfirmed ? [{ code: 'audio-play-not-confirmed', audioProbe, responses: allTtsResponses }] : []),
    ...(!effectVisible ? [{ code: 'spotlight-or-laser-missing-during-speech', samples: samples.map(effectSample) }] : []),
    ...layerIssues,
    ...layoutIssues,
    ...animationLayer.blockingIssues,
    ...animationLaser.blockingIssues,
  ];

  return {
    projectId,
    url,
    screenshot,
    screenshotIssue,
    before,
    after,
    animationLayer,
    animationLaser,
    samples,
    ttsResponses: allTtsResponses,
    audioProbe,
    blockingIssues,
  };
}

async function auditAnimationLayerNavigation(page) {
  let clicks = 0;
  for (; clicks < 90; clicks += 1) {
    const layer = await page.evaluate(() => document.querySelector('.dgbook-playback-layer-sentinel')?.getAttribute('data-playback-layer'));
    if (layer === 'animation') break;
    await clickDockButton(page, 2);
    await page.waitForTimeout(80);
  }
  const samples = [];
  let elapsed = 0;
  for (const checkpoint of [300, 1000, 1800, 3000]) {
    await page.waitForTimeout(checkpoint - elapsed);
    elapsed = checkpoint;
    samples.push(await readDock(page));
  }
  const sample = samples.find(animationFocusVisible) ?? samples.at(-1);
  const visibleFocus = samples.some(animationFocusVisible);
  return {
    clicks,
    sample,
    samples,
    blockingIssues: [
      ...(sample.playbackLayer !== 'animation' ? [{ code: 'animation-layer-not-reachable', clicks, sample: layerSample(sample) }] : []),
      ...(!sample.theaterMode ? [{ code: 'animation-theater-mode-missing', clicks, sample: layerSample(sample) }] : []),
      ...(!visibleFocus ? [{ code: 'animation-layer-focus-missing', clicks, samples: samples.map(effectSample) }] : []),
      ...(samples.some((item) => item.playbackLayer === 'animation' && !animationFocusVisible(item))
        ? [{ code: 'animation-layer-focus-gap', clicks, samples: samples.map(effectSample) }]
        : []),
      ...(!samples.some(animationFocusCaptionAligned) ? [{ code: 'animation-focus-caption-mismatch', clicks, samples: samples.map(effectSample) }] : []),
      ...(samples.some(hasFallbackStageFocus)
        ? [{ code: 'animation-stage-focus-fallback-used', clicks, samples: samples.map(effectSample) }]
        : []),
      ...(samples.some((item) => item.stageSpotlightDimMax > 0.02)
        ? [{ code: 'animation-spotlight-too-dark', clicks, samples: samples.map(effectSample) }]
        : []),
      ...(!samples.some((item) => item.whiteboardLineVisible > 0 || item.whiteboardTextVisible > 0 || item.whiteboardShapeVisible > 0 || item.whiteboardChartVisible > 0 || item.whiteboardTableVisible > 0 || item.whiteboardCodeVisible > 0 || item.whiteboardFormulaVisible > 0)
        ? [{ code: 'animation-layer-whiteboard-missing', clicks, samples: samples.map(effectSample) }]
        : []),
    ],
  };
}

async function auditAnimationLaserNavigation(page) {
  const samples = [];
  for (let clicks = 0; clicks < 24; clicks += 1) {
    await clickDockButton(page, 2);
    for (const waitMs of [120, 360, 720]) {
      await page.waitForTimeout(waitMs);
      const sample = await readDock(page);
      samples.push({ clicks: clicks + 1, waitMs, ...sample });
      if (sample.playbackLayer === 'animation' && animationLaserVisible(sample)) {
        return { clicks: clicks + 1, sample, samples, blockingIssues: [] };
      }
    }
  }
  const sample = samples.find((item) => item.playbackLayer === 'animation') ?? samples.at(-1);
  return {
    clicks: samples.length,
    sample,
    samples,
    blockingIssues: [
      { code: 'animation-layer-laser-missing', clicks: samples.length, samples: samples.map(effectSample) },
    ],
  };
}

async function capturePlaybackScreenshot(page, screenshot) {
  try {
    await page.screenshot({
      path: screenshot,
      fullPage: false,
      animations: 'disabled',
      timeout: 60_000,
    });
    return null;
  } catch (error) {
    return {
      code: 'playback-screenshot-warning',
      message: String(error?.message ?? error),
    };
  }
}

async function clickDockButton(page, index) {
  const clicked = await page.waitForFunction((buttonIndex) => {
    const button = document.querySelectorAll('.dg-teaching-controls button')[buttonIndex];
    if (!button || button.disabled) return false;
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return true;
  }, index, { timeout: 5_000 }).catch(() => null);
  if (clicked) return;
  const eventName = index === 0 ? 'dgbook:playback-previous'
    : index === 1 ? 'dgbook:playback-toggle'
      : index === 2 ? 'dgbook:playback-next'
        : 'dgbook:playback-stop';
  const dispatched = await page.evaluate((name) => {
    window.dispatchEvent(new CustomEvent(name));
    return Boolean(document.querySelector('.dgbook-playback-layer-sentinel'));
  }, eventName);
  if (!dispatched) throw new Error(`dock-control-${index}-not-clickable`);
}

function animationFocusVisible(sample) {
  return sample.spotlightVisible > 0 || sample.laser > 0
    || sample.stageSpotlightVisible > 0 || animationLaserVisible(sample);
}

function animationLaserVisible(sample) {
  return sample.laser > 0 || sample.stageLaser > 0 || sample.stageLaserBeamVisible > 0 || sample.stageLaserPinVisible > 0;
}

function hasFallbackStageFocus(sample) {
  return (sample.stageFocusTargets ?? []).some((target) => String(target.id ?? '').includes('-stage-fallback'));
}

function animationFocusCaptionAligned(sample) {
  if (!animationFocusVisible(sample)) return false;
  const current = normalizeAuditText(sample.currentTranscript || sample.transcript || '');
  if (!current) return false;
  const targets = sample.stageFocusTargets ?? [];
  if (targets.length === 0) return true;
  return targets.some((target) => {
    const overlayCaption = normalizeAuditText(target.caption || '');
    if (overlayCaption && (current.includes(overlayCaption) || overlayCaption.includes(current))) return true;
    const targetText = normalizeAuditText(`${target.id} ${target.text || ''}`);
    const visibleText = normalizeAuditText(target.text || '');
    if (visibleText && (current.includes(visibleText) || visibleText.includes(current))) return true;
    const tokens = targetText.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) ?? [];
    return tokens.slice(0, 10).some((token) => current.includes(token));
  });
}

function normalizeAuditText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

async function samplePlayback(page, waitMs) {
  const samples = [];
  const checkpoints = uniqueSorted([160, 520, 1100, 1800, 2800, waitMs]);
  let elapsed = 0;
  for (const checkpoint of checkpoints) {
    const delay = Math.max(0, Math.min(waitMs, checkpoint) - elapsed);
    if (delay > 0) await page.waitForTimeout(delay);
    elapsed += delay;
    samples.push(await readDock(page));
  }
  return samples;
}

async function readDock(page) {
  return page.evaluate(() => {
    const visibleCount = (selector) => [...document.querySelectorAll(selector)].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.02;
    }).length;
    const visibleSvgLineCount = (selector) => [...document.querySelectorAll(selector)].filter((node) => {
      const style = window.getComputedStyle(node);
      const x1 = Number(node.getAttribute('x1'));
      const y1 = Number(node.getAttribute('y1'));
      const x2 = Number(node.getAttribute('x2'));
      const y2 = Number(node.getAttribute('y2'));
      const width = Number(node.getAttribute('stroke-width') ?? style.strokeWidth ?? 1);
      return Number.isFinite(x1)
        && Number.isFinite(y1)
        && Number.isFinite(x2)
        && Number.isFinite(y2)
        && Math.hypot(x2 - x1, y2 - y1) > 2
        && Number.isFinite(width)
        && width > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || 1) > 0.02;
    }).length;
    const sentinel = document.querySelector('.dgbook-playback-layer-sentinel');
    return ({
    mode: sentinel?.getAttribute('data-playback-mode')
      || (document.querySelector('.dg-teaching-controls button.is-primary')?.getAttribute('title') === '暂停' ? 'playing' : 'idle'),
    playbackLayer: sentinel?.getAttribute('data-playback-layer') || '',
    openmaicDock: document.querySelectorAll('[data-openmaic-dock="true"], .dg-teaching-dock-shell .dg-teaching-dock').length,
    avatarVisible: visibleCount('.dg-teaching-avatar'),
    prevControlEnabled: (() => {
      const button = document.querySelectorAll('.dg-teaching-controls button')[0];
      return Boolean(button && !button.disabled);
    })(),
    nextControlEnabled: (() => {
      const button = document.querySelectorAll('.dg-teaching-controls button')[2];
      return Boolean(button && !button.disabled);
    })(),
    transcript: document.querySelector('.dg-teaching-transcript-text')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    currentTranscript: document.querySelector('.dg-teaching-transcript-text p.is-current')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    transcriptLines: document.querySelectorAll('.dg-teaching-transcript-text p').length,
    currentTranscriptLines: document.querySelectorAll('.dg-teaching-transcript-text p.is-current').length,
    transcriptScrollTop: document.querySelector('.dg-teaching-transcript-text')?.scrollTop ?? 0,
    transcriptScrollHeight: document.querySelector('.dg-teaching-transcript-text')?.scrollHeight ?? 0,
    transcriptClientHeight: document.querySelector('.dg-teaching-transcript-text')?.clientHeight ?? 0,
    transcriptScrollable: (document.querySelector('.dg-teaching-transcript-text')?.scrollHeight ?? 0) > (document.querySelector('.dg-teaching-transcript-text')?.clientHeight ?? 0) + 2,
    theaterMode: document.body.classList.contains('dgbook-theater-mode'),
    focusBoxes: document.querySelectorAll('.focus-box').length,
    spotlight: document.querySelectorAll('.stage-spotlight, .dg-stage-spotlight').length,
    spotlightVisible: [...document.querySelectorAll('.stage-spotlight, .dg-stage-spotlight')].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.02;
    }).length,
    stageSpotlightVisible: visibleCount('.dg-teaching-stage .dg-stage-spotlight'),
    stageSpotlightDimMax: Math.max(0, ...[...document.querySelectorAll('.dg-teaching-stage .dg-stage-spotlight')]
      .map((node) => Number(node.getAttribute('data-dim-opacity') || 0))
      .filter(Number.isFinite)),
    stageFocusTargets: [...document.querySelectorAll('.dg-teaching-stage .dg-stage-spotlight[data-target-id], .dg-teaching-stage .dg-stage-laser[data-target-id], .dg-teaching-stage .dg-stage-laser-pin[data-target-id]')]
      .map((node) => ({
        id: node.getAttribute('data-target-id'),
        caption: node.getAttribute('data-caption') || '',
      }))
      .filter((item) => item.id)
      .map((item) => {
        const id = item.id;
        const escaped = globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&');
        const target = document.querySelector(`[data-animation-element-id="${escaped}"], #${escaped}`);
        return {
          id,
          caption: item.caption,
          text: target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || '',
        };
      }),
    viewportSpotlightVisible: visibleCount('.stage-effects .stage-spotlight'),
    highlightVisible: [...document.querySelectorAll('.dg-stage-highlight')].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.02;
    }).length,
    stageLaser: visibleCount('.dg-teaching-stage .dg-stage-laser'),
    stageLaserBeamVisible: visibleCount('.dg-teaching-stage .dg-stage-laser-beam'),
    stageLaserPinVisible: visibleCount('.dg-teaching-stage .dg-stage-laser-pin'),
    stageLaserFrameVisible: visibleCount('.dg-teaching-stage .dg-stage-laser-frame'),
    whiteboardVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard'),
    whiteboardLineVisible: visibleSvgLineCount('.dg-teaching-stage .dg-stage-whiteboard-line'),
    whiteboardTextVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-text'),
    whiteboardShapeVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-shape'),
    whiteboardChartVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-chart'),
    whiteboardTableVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-table'),
    whiteboardCodeVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-code'),
    whiteboardFormulaVisible: visibleCount('.dg-teaching-stage .dg-stage-whiteboard-formula'),
    laser: [...document.querySelectorAll('.laser-dot, .dg-stage-laser, .dg-stage-laser-beam, .dg-stage-laser-pin')].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.02;
    }).length,
    contentTargetVisible: [...document.querySelectorAll('#sec-overview, #sec-core-model, [id$="-ku-01"], [id*="-ku-"]')].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.top < window.innerHeight
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || 1) > 0.02;
    }).length,
    layerContracts: {
      content: visibleCount('#sec-overview, #sec-core-model, .dg-knowledge-unit'),
      animation: visibleCount('[data-widget-shell="lesson-animation"][data-playback-layer="animation"], .lesson-animation'),
      interactive: visibleCount('[data-widget-shell="edugame-pixi"][data-playback-layer="interactive"], .dg-edugame-interactive'),
    },
    layout: (() => {
      const lesson = document.querySelector('.lesson-animation');
      const screen = document.querySelector('.dg-teaching-stage-screen');
      const dock = document.querySelector('.dg-teaching-dock');
      const rectOf = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom } : null;
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        lessonRect: rectOf(lesson),
        screenRect: rectOf(screen),
        dockRect: rectOf(dock),
      };
    })(),
  });
  });
}

function playbackLayoutIssues(layout, theaterMode) {
  const viewport = layout?.viewport;
  const lesson = layout?.lessonRect;
  const screen = layout?.screenRect;
  const dock = layout?.dockRect;
  if (!theaterMode) return [];
  if (!viewport || !lesson) return [{ code: 'playback-stage-missing' }];
  const issues = [];
  if (lesson.width < viewport.width * 0.66) issues.push({ code: 'playback-stage-not-wide', width: round(lesson.width), viewportWidth: viewport.width });
  if (lesson.height < Math.min(460, viewport.height * 0.58)) issues.push({ code: 'playback-stage-too-short', height: round(lesson.height), viewportHeight: viewport.height });
  if (lesson.top > viewport.height * 0.36) issues.push({ code: 'playback-stage-below-fold', top: round(lesson.top), viewportHeight: viewport.height });
  if (screen && screen.height < Math.min(400, viewport.height * 0.5)) issues.push({ code: 'teaching-screen-too-short', height: round(screen.height), viewportHeight: viewport.height });
  if (screen && dock && screen.bottom > dock.top - 8) {
    issues.push({ code: 'teaching-screen-dock-overlap', screenBottom: round(screen.bottom), dockTop: round(dock.top) });
  }
  return issues;
}

function playbackLayerIssues(before, after, samples) {
  const issues = [];
  if (!['content', 'animation', 'interactive'].includes(after.playbackLayer)) {
    issues.push({ code: 'playback-layer-sentinel-missing', playbackLayer: after.playbackLayer });
  }
  for (const layer of ['content', 'animation', 'interactive']) {
    const visibleInAnySample = [before, after, ...samples].some((sample) => (sample.layerContracts?.[layer] ?? 0) > 0);
    if (!visibleInAnySample) issues.push({ code: `playback-${layer}-layer-missing`, layerContracts: after.layerContracts ?? {} });
  }
  if (samples.some((sample) => sample.theaterMode && sample.playbackLayer !== 'animation')) {
    issues.push({ code: 'theater-mode-layer-mismatch', samples: samples.map(layerSample) });
  }
  return issues;
}

function effectSample(sample) {
  return {
    mode: sample.mode,
    focusBoxes: sample.focusBoxes,
    spotlightVisible: sample.spotlightVisible,
    viewportSpotlightVisible: sample.viewportSpotlightVisible,
    stageSpotlightVisible: sample.stageSpotlightVisible,
    laser: sample.laser,
    stageLaser: sample.stageLaser,
    stageLaserBeamVisible: sample.stageLaserBeamVisible,
    stageLaserPinVisible: sample.stageLaserPinVisible,
    stageLaserFrameVisible: sample.stageLaserFrameVisible,
    stageSpotlightDimMax: sample.stageSpotlightDimMax,
    stageFocusTargets: sample.stageFocusTargets,
    whiteboardVisible: sample.whiteboardVisible,
    whiteboardLineVisible: sample.whiteboardLineVisible,
    whiteboardTextVisible: sample.whiteboardTextVisible,
    whiteboardShapeVisible: sample.whiteboardShapeVisible,
    whiteboardChartVisible: sample.whiteboardChartVisible,
    whiteboardTableVisible: sample.whiteboardTableVisible,
    whiteboardCodeVisible: sample.whiteboardCodeVisible,
    whiteboardFormulaVisible: sample.whiteboardFormulaVisible,
    highlightVisible: sample.highlightVisible,
    transcript: sample.transcript.slice(0, 80),
    currentTranscript: sample.currentTranscript?.slice(0, 80) ?? '',
  };
}

function contentSample(sample) {
  return {
    mode: sample.mode,
    theaterMode: sample.theaterMode,
    contentTargetVisible: sample.contentTargetVisible,
    focusBoxes: sample.focusBoxes,
    spotlightVisible: sample.spotlightVisible,
    transcript: sample.transcript.slice(0, 80),
  };
}

function layerSample(sample) {
  return {
    mode: sample.mode,
    playbackLayer: sample.playbackLayer,
    theaterMode: sample.theaterMode,
    layerContracts: sample.layerContracts,
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

main().catch((error) => {
  console.error(JSON.stringify({
    tool: 'audit-playback-runtime',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
