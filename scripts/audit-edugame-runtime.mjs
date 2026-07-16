#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';
import { closeStaticSiteServer, startStaticSiteServerIfNeeded } from './utils/static-site-server.mjs';
import { runWithConcurrency } from './utils/run-with-concurrency.mjs';

const root = process.cwd();
const selector = '.dg-edugame-interactive';
const ALL_PROJECTS = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const SAMPLE_PROJECTS = ['P01', 'P03', 'P08', 'P17'];
const projects = readProjects();
const outDir = path.join(root, 'output', 'playwright');
let baseUrl = readArg('--base-url');
const concurrency = Math.max(1, Number(readArg('--concurrency') || (projects.length >= 8 ? 6 : 2)));
const settleMs = Math.max(80, Number(readArg('--settle-ms') || 180));
const serverArgs = { baseUrl };
let server = null;
const failures = [];
const results = [];
const desktopViewport = { width: 1440, height: 1080 };

await mkdir(outDir, { recursive: true });
server = await startStaticSiteServerIfNeeded(serverArgs, root);
baseUrl = serverArgs.baseUrl;

const browser = await launchChromium({ headless: true });
try {
  await runWithConcurrency(projects, concurrency, async (projectId) => {
    const page = await browser.newPage({ viewport: desktopViewport });
    try {
      await auditProject(page, projectId);
    } catch (error) {
      failures.push(`${projectId} audit crashed: ${error.message}`);
    } finally {
      await page.close();
    }
  });
} finally {
  await browser.close();
  await closeStaticSiteServer(server);
}

results.sort((a, b) => a.projectId.localeCompare(b.projectId));
failures.sort();
await writeFile(path.join(outDir, 'edugame-runtime-audit-report.json'), JSON.stringify({ results, failures }, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`EduGame runtime audit passed: ${results.length} project(s): ${projects.join(', ')}.`);
}

async function auditProject(page, projectId) {
  const game = await openGame(page, projectId);
  await installLearningRecordProbe(page);
  const before = await readState(page);
  await clickStart(page);
  const afterStart = await readState(page);
  await clickAnswerHelp(page);
  const afterAnswerHelp = await readState(page);
  await clickCorrectPlayable(page, afterStart);
  await page.waitForTimeout(450);
  const afterCorrect = await readState(page);
  const beforeComplete = afterCorrect;
  await completeCorrectPath(page);
  const afterComplete = await readState(page);

  await openGame(page, projectId);
  await installLearningRecordProbe(page);
  await clickStart(page);
  const beforeWrong = await readState(page);
  await clickWrongPlayable(page, beforeWrong);
  await page.waitForTimeout(450);
  const afterWrong = await readState(page);
  await completeWrongPath(page);
  const afterFailed = await readState(page);

  await prepareGameScreenshot(page);
  const screenshot = path.join(outDir, `${projectId}-edugame-runtime.png`);
  await game.screenshot({ path: screenshot });
  const afterDrill = await startDrillPath(page);
  const checks = [
    [before.runtime === 'pixi', `${projectId} runtime is not pixi`],
    [before.hasCanvas, `${projectId} missing Pixi canvas`],
    [before.canvasArea >= 260000, `${projectId} Pixi canvas is too small`],
    [before.hasStart, `${projectId} missing explicit start gate`],
    [before.started === false, `${projectId} should not be started before pressing start`],
    [before.enabledActionCount === 0, `${projectId} exposes enabled game controls before start`],
    [afterStart.started === true, `${projectId} did not enter started state`],
    [afterStart.hasStart === false, `${projectId} start gate did not close after start`],
    [Math.max(before.itemCount + before.targetCount, afterStart.itemCount + afterStart.targetCount) >= 3, `${projectId} has too few game items`],
    [before.hasGuide, `${projectId} missing beginner guide`],
    [before.hasMission, `${projectId} missing mission card`],
    [before.hasFullscreen, `${projectId} missing fullscreen button`],
    [before.hasAudioToggle, `${projectId} missing music toggle`],
    [before.hasAnswerToggle, `${projectId} missing correct answer toggle`],
    [before.hasGameMotion, `${projectId} missing shared animation mode`],
    [before.hasChallengeMode, `${projectId} missing shared challenge mode`],
    [before.hasPressureMeter, `${projectId} missing visible mistake budget meter`],
    [before.hasBadgeTrack, `${projectId} missing visible badge goal track`],
    [before.stageMilestones >= 3, `${projectId} missing stage reward milestones`],
    [before.livesLeft === before.livesMax && before.livesMax >= 2, `${projectId} mistake budget is not initialized`],
    [afterStart.gameType !== 'boss-review' || afterStart.hasBossReview, `${projectId} boss-review missing boss HUD`],
    [afterStart.gameType !== 'boss-review' || afterStart.bossPhaseCount >= 3, `${projectId} boss-review missing phase gates`],
    [afterStart.gameType !== 'boss-review' || afterStart.hasBossWaveTrack, `${projectId} boss-review missing wave track`],
    [afterStart.gameType !== 'boss-review' || afterStart.hasBossWaveCard, `${projectId} boss-review missing wave card`],
    [afterStart.gameType !== 'boss-review' || afterStart.bossActivePhaseCount === 1, `${projectId} boss-review missing active wave marker`],
    [afterStart.gameType !== 'boss-review' || afterStart.bossHp > 0, `${projectId} boss-review missing hp meter`],
    [afterStart.playType !== 'memory-card' || afterStart.memoryAdjacentPairs === 0, `${projectId} memory cards are still arranged as adjacent answers`],
    [afterStart.playType !== 'memory-card' || afterStart.memoryKindCount >= 2, `${projectId} memory cards do not expose term/meaning challenge kinds`],
    [afterStart.playType !== 'memory-card' || afterStart.memoryOverflowingCards === 0, `${projectId} memory cards overflow the playable stage`],
    [afterStart.playType !== 'memory-card' || afterStart.hasMemoryPreview, `${projectId} memory-card missing preview countdown challenge`],
    [afterStart.playType !== 'memory-card' || afterStart.memoryEnabledDuringPreview === 0, `${projectId} memory-card allows clicks during preview countdown`],
    [afterStart.playType !== 'quick-hit' || afterStart.quickHitVisualCorrectClasses === 0, `${projectId} quick-hit still exposes correct targets through visual classes`],
    [afterStart.playType !== 'quick-hit' || afterStart.quickHitToneCount >= Math.min(3, afterStart.itemCount), `${projectId} quick-hit does not use varied neutral target tones`],
    [afterStart.playType !== 'quiz-rush' || afterStart.quizCorrectGateIndex > 0 || afterStart.targetCount < 2, `${projectId} quiz-rush exposes the correct gate first`],
    [afterStart.playType !== 'quiz-rush' || afterStart.hasQuizRushMeter, `${projectId} quiz-rush missing rush meter`],
    [afterStart.playType !== 'match-3' || (afterStart.match3Mission && afterStart.match3ObjectiveTiles >= 3), `${projectId} match-3 missing visible objective mission`],
    [afterStart.playType !== 'match-3' || afterStart.match3VisualObjectiveTiles === 0, `${projectId} match-3 still reveals objective tiles as the answer layout`],
    [afterStart.playType !== 'match-3' || afterStart.match3MoveBudget > 0, `${projectId} match-3 missing move budget challenge`],
    [afterStart.playType !== 'match-3' || afterStart.match3Motion === 'gravity-swap', `${projectId} match-3 missing gravity-swap motion mode`],
    [afterStart.playType !== 'match-3' || afterStart.match3BoardState === 'live', `${projectId} match-3 board did not enter live state`],
    [afterStart.playType !== 'match-3' || afterStart.hasMatch3ChallengeMeter, `${projectId} match-3 missing challenge progress meter`],
    [afterStart.playType !== 'match-3' || afterStart.match3InitialMatches === 0, `${projectId} match-3 starts with auto-matched lines`],
    [afterStart.playType !== 'match-3' || afterStart.match3AvailableSwaps >= 1, `${projectId} match-3 has no available swap challenge`],
    [afterStart.playType !== 'match-3' || afterStart.match3MissionSwaps >= 1, `${projectId} match-3 has no mission-category swap challenge`],
    [afterStart.playType !== 'match-3' || afterStart.match3NeutralTiles === afterStart.itemCount, `${projectId} match-3 still marks tiles as correct answers`],
    [afterStart.playType !== 'match-3' || afterStart.match3LongTileLabels === 0, `${projectId} match-3 still shows long tile text`],
    [!['drag-match', 'pipe-connect', 'classification-run'].includes(afterStart.gameType) || afterStart.dragPairableCount >= Math.min(3, afterStart.targetCount), `${projectId} paired game does not expose auditable target ids`],
    [afterStart.dragPairableCount === 0 || afterStart.dragTargetCount === 0 || afterStart.dragAlignedPairs < Math.min(3, afterStart.dragTargetCount), `${projectId} paired game still exposes index-aligned answers`],
    [afterStart.gameType !== 'classification-run' || afterStart.hasClassRunWave, `${projectId} classification-run missing wave pressure HUD`],
    [afterStart.gameType !== 'classification-run' || afterStart.classRunQueue > 0, `${projectId} classification-run missing visible conveyor queue`],
    [afterCorrect.gameType !== 'drag-match' || afterCorrect.dragCompletedWires >= 1, `${projectId} drag-match missing completed wire feedback`],
    [afterCorrect.gameType !== 'classification-run' || afterCorrect.hasClassRunHit, `${projectId} classification-run missing hit feedback`],
    [before.hasScore, `${projectId} missing score stat`],
    [before.hasFeedback, `${projectId} missing feedback channel`],
    [afterAnswerHelp.answerPanel === 'open', `${projectId} did not open correct answer panel`],
    [afterAnswerHelp.answerItems >= 1, `${projectId} correct answer panel has no answer item`],
    [afterAnswerHelp.answerText.length >= 16, `${projectId} correct answer panel text is too thin`],
    [afterAnswerHelp.eventTypes.includes('hint_used'), `${projectId} correct answer panel did not record hint_used`],
    [afterCorrect.result === 'correct' || afterCorrect.score > afterStart.score || afterCorrect.feedback !== afterStart.feedback, `${projectId} did not react to a correct action`],
    [afterCorrect.scoreMoment === 'correct' || afterCorrect.scoreMoment === 'level' || afterCorrect.scoreMoment === 'finish', `${projectId} missing score moment after correct action`],
    [afterCorrect.actionFeedback === 'correct' || afterCorrect.actionFeedback === 'complete', `${projectId} missing shared correct action feedback animation`],
    [afterCorrect.stageActiveMilestones >= 1 || afterCorrect.stageDoneMilestones >= 1, `${projectId} stage reward milestones did not react to progress`],
    [afterCorrect.gameType !== 'boss-review' || afterCorrect.bossHp < afterStart.bossHp, `${projectId} boss-review hp did not decrease after correct action`],
    [afterCorrect.gameType !== 'boss-review' || afterCorrect.bossWave >= afterStart.bossWave, `${projectId} boss-review wave regressed after correct action`],
    [afterCorrect.playType !== 'quiz-rush' || afterCorrect.quizChainHot >= 1, `${projectId} quiz-rush chain did not react after correct action`],
    [afterCorrect.playType !== 'match-3' || afterCorrect.match3BurstCount > 0 || afterCorrect.match3ClearingTiles > 0 || afterCorrect.hasMatch3MotionPulse, `${projectId} match-3 missing visible clear animation after match`],
    [afterWrong.result === 'wrong' || afterWrong.mistakeCount > beforeWrong.mistakeCount || afterWrong.feedback !== beforeWrong.feedback, `${projectId} did not react to a wrong action`],
    [afterWrong.scoreMoment === 'wrong' || afterWrong.actionFeedback === 'wrong', `${projectId} missing wrong action scoring/feedback animation`],
    [afterWrong.actionFeedback === 'wrong' || afterWrong.actionFeedback === 'complete', `${projectId} missing shared wrong action feedback animation`],
    [afterWrong.livesLeft < beforeWrong.livesLeft, `${projectId} wrong action did not reduce visible mistake budget`],
    [afterWrong.playType !== 'match-3' || afterWrong.match3MoveBudget < beforeWrong.match3MoveBudget, `${projectId} match-3 wrong action did not spend a move`],
    [afterWrong.gameType !== 'boss-review' || afterWrong.hasBossCounter, `${projectId} boss-review missing counter feedback`],
    [afterWrong.playType !== 'quiz-rush' || afterWrong.hasQuizShock, `${projectId} quiz-rush missing wrong gate shock`],
    [afterWrong.gameType !== 'classification-run' || afterWrong.hasClassRunMiss, `${projectId} classification-run missing miss feedback`],
    [afterComplete.hasReview, `${projectId} did not show review card after completing the game`],
    [afterComplete.phase === 'passed', `${projectId} did not finish in passed phase`],
    [afterComplete.recordEvents >= 5, `${projectId} learning record has too few events after completion`],
    [afterComplete.emittedRecords >= 1, `${projectId} did not emit learning record after completion`],
    [afterComplete.pageRecordState === 'passed', `${projectId} page did not persist passed learning record`],
    [afterComplete.pageRecordScore >= afterComplete.score, `${projectId} page learning record score is stale after completion`],
    [afterComplete.score > beforeComplete.score, `${projectId} completion path did not increase score`],
    [afterComplete.reviewCta, `${projectId} completion review missing retry CTA`],
    [afterComplete.reviewMetrics >= 4, `${projectId} completion review missing metrics`],
    [afterComplete.reviewAwards >= 4, `${projectId} completion review missing game awards`],
    [afterComplete.reviewBadges >= 3, `${projectId} completion review missing badge path`],
    [afterComplete.reviewUnlockedBadges >= 1, `${projectId} completion review did not unlock any badge`],
    [afterComplete.drillRouteSteps >= 3, `${projectId} completion review missing replay route`],
    [afterFailed.hasReview, `${projectId} did not show review card after failing the game`],
    [afterFailed.phase === 'failed', `${projectId} did not finish wrong path in failed phase`],
    [afterFailed.reviewState === 'failed', `${projectId} failed review card has wrong review state`],
    [afterFailed.recordEvents >= 5, `${projectId} failed learning record has too few events`],
    [afterFailed.emittedRecords >= 1, `${projectId} did not emit learning record after failure`],
    [afterFailed.pageRecordState === 'failed', `${projectId} page did not persist failed learning record`],
    [afterFailed.reviewMistakes >= 1, `${projectId} failed review does not list weak knowledge points`],
    [afterFailed.reviewText.length >= 20, `${projectId} failed review text is too thin`],
    [afterFailed.reviewCta, `${projectId} failed review missing retry CTA`],
    [afterFailed.reviewDrillCta, `${projectId} failed review missing mistake drill CTA`],
    [afterFailed.reviewMetrics >= 4, `${projectId} failed review missing metrics`],
    [afterFailed.reviewAwards >= 4, `${projectId} failed review missing game awards`],
    [afterFailed.reviewBadges >= 3, `${projectId} failed review missing badge path`],
    [afterFailed.drillRouteSteps >= 3, `${projectId} failed review missing replay route`],
    [afterDrill.practiceMode === 'mistake-drill', `${projectId} mistake drill mode did not start`],
    [afterDrill.practiceKps >= 1, `${projectId} mistake drill has no focused knowledge point`],
    [afterDrill.started === true, `${projectId} mistake drill did not stay in started state`],
    [!afterDrill.hasReview, `${projectId} mistake drill kept the previous review card open`],
    [afterDrill.enabledActionCount > 0, `${projectId} mistake drill exposes no playable controls`],
    [afterDrill.liveEvents >= 3, `${projectId} mistake drill did not preserve live learning events`],
    [afterDrill.eventTypes.includes('mistake_drill_start'), `${projectId} mistake drill did not record learning event`],
  ];
  for (const [ok, message] of checks) if (!ok) failures.push(message);
  results.push({ projectId, before, afterStart, afterAnswerHelp, afterCorrect, beforeWrong, afterWrong, afterFailed, afterDrill, beforeComplete, afterComplete, screenshot });
}

async function openGame(page, projectId) {
  const url = new URL(`/projects/${projectId}/`, baseUrl).href;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const game = page.locator(selector).first();
    try {
      await game.waitFor({ state: 'visible', timeout: attempt === 0 ? 15000 : 24000 });
      await game.scrollIntoViewIfNeeded();
      await page.waitForTimeout(settleMs * 2);
      await page.waitForFunction(
        (sel) => {
          const node = document.querySelector(sel);
          return Boolean(node?.querySelector('[data-edugame-start]'))
            && Boolean(node?.querySelector('.eg-pixi-canvas canvas'));
        },
        selector,
        { timeout: 6000 },
      ).catch(() => {});
      return game;
    } catch (error) {
      if (attempt === 1) {
        throw new Error(`${projectId} EduGame widget did not render: ${error.message}`);
      }
      await page.waitForTimeout(1000);
    }
  }
  throw new Error(`${projectId} EduGame widget did not render.`);
}

async function prepareGameScreenshot(page) {
  await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return;
    node.scrollIntoView({ block: 'start', inline: 'nearest' });
    window.scrollBy(0, -12);
  }, selector).catch(() => {});
  await page.waitForTimeout(Math.max(120, settleMs));
}

async function installLearningRecordProbe(page) {
  await page.evaluate(() => {
    window.__dgbookEduGameRecords = [];
    window.addEventListener('dgbook:edugame-complete', (event) => {
      window.__dgbookEduGameRecords.push(event.detail?.record ?? event.detail ?? {});
    });
  });
}

async function clickStart(page) {
  const start = page.locator(`${selector} [data-edugame-start]`).first();
  if (await start.count()) {
    await start.click({ timeout: 5000, noWaitAfter: true });
    await page.waitForTimeout(settleMs);
  }
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.getAttribute('data-edugame-started') === 'true',
    selector,
    { timeout: 5000 },
  ).catch(() => {});
}

async function clickAnswerHelp(page) {
  await clickSelectorWhenReady(page, `${selector} [data-edugame-answer-toggle]`);
  await page.waitForTimeout(settleMs);
}

async function clickCorrectPlayable(page, state) {
  const { playType, gameType } = normalizePlayableState(state);
  if (playType === 'match-3') {
    await clickMatch3Path(page, true);
    return;
  }
  if (isPairedRouteGame(playType, gameType)) {
    await clickDragPath(page, true);
    return;
  }
  if (playType === 'memory-card') {
    await clickMemoryPair(page, true);
    return;
  }
  await clickSelectorWhenReady(page, `${selector} button[data-edugame-item][data-edugame-correct="true"]:not([disabled])`)
    || await clickSelectorWhenReady(page, `${selector} button[data-edugame-target][data-edugame-correct="true"]:not([disabled])`);
}

async function clickWrongPlayable(page, state) {
  const { playType, gameType } = normalizePlayableState(state);
  if (playType === 'match-3') {
    await clickMatch3Path(page, false);
    return;
  }
  if (isPairedRouteGame(playType, gameType)) {
    await clickDragPath(page, false);
    return;
  }
  if (playType === 'memory-card') {
    await clickMemoryPair(page, false);
    return;
  }
  await clickSelectorWhenReady(page, `${selector} button[data-edugame-item][data-edugame-correct="false"]:not([disabled])`)
    || await clickSelectorWhenReady(page, `${selector} button[data-edugame-target][data-edugame-correct="false"]:not([disabled])`);
}

async function completeCorrectPath(page) {
  for (let step = 0; step < 30; step += 1) {
    const state = await readState(page);
    if (state.hasReview || state.phase === 'passed') return state;
    await clickCorrectPlayable(page, state);
    await waitForActionSettle(page, state.playType);
  }
  return readState(page);
}

async function completeWrongPath(page) {
  for (let step = 0; step < 8; step += 1) {
    const state = await readState(page);
    if (state.hasReview || state.phase === 'failed') return state;
    await clickWrongPlayable(page, state);
    await waitForActionSettle(page, state.playType);
  }
  return readState(page);
}

async function startDrillPath(page) {
  await clickSelectorWhenReady(page, `${selector} [data-edugame-review-cta="drill"]`);
  await page.waitForTimeout(settleMs);
  await page.waitForFunction(
    (sel) => !document.querySelector(`${sel} [data-edugame-memory-preview]`),
    selector,
    { timeout: 5000 },
  ).catch(() => {});
  return readState(page);
}

async function waitForActionSettle(page, playType) {
  const timeout = playType === 'memory-card' ? 700 : playType === 'match-3' ? 520 : settleMs;
  await page.waitForTimeout(timeout);
}

function normalizePlayableState(state) {
  if (typeof state === 'string') return { playType: state, gameType: '' };
  return {
    playType: state?.playType ?? '',
    gameType: state?.gameType ?? '',
  };
}

function isPairedRouteGame(playType, gameType) {
  return playType === 'drag-match'
    || ['drag-match', 'pipe-connect', 'maze-troubleshoot', 'classification-run'].includes(gameType);
}

async function clickDragPath(page, correct) {
  const itemClicked = await clickSelectorWhenReady(page, `${selector} button[data-edugame-item][data-edugame-correct="true"]:not([disabled])`)
    || await clickSelectorWhenReady(page, `${selector} button[data-edugame-item]:not([disabled])`);
  if (!itemClicked) return;
  await page.waitForTimeout(150);
  await clickSelectorWhenReady(page, `${selector} button[data-edugame-target][data-edugame-correct="${correct ? 'true' : 'false'}"]:not([disabled])`);
}

async function clickMemoryPair(page, correct) {
  await page.waitForFunction(
    (sel) => !document.querySelector(`${sel} [data-edugame-memory-preview]`),
    selector,
    { timeout: 5000 },
  ).catch(() => {});
  const ids = await page.evaluate(({ sel, correct: wantCorrect }) => {
    const cards = [...document.querySelectorAll(`${sel} button[data-edugame-item][data-edugame-target-id]:not([disabled])`)];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const same = cards[i].getAttribute('data-edugame-target-id') === cards[j].getAttribute('data-edugame-target-id');
        if (same === wantCorrect) {
          return [cards[i].getAttribute('data-edugame-item'), cards[j].getAttribute('data-edugame-item')].filter(Boolean);
        }
      }
    }
    return [];
  }, { sel: selector, correct });
  for (const id of ids) {
    await page.evaluate(({ sel, itemId }) => {
      const button = document.querySelector(`${sel} button[data-edugame-item="${itemId}"]`);
      if (button instanceof HTMLElement) button.click();
    }, { sel: selector, itemId: id });
    await page.waitForTimeout(160);
  }
}

async function clickMatch3Path(page, correct) {
  const state = await page.evaluate((sel) => {
    const mission = document.querySelector(`${sel} [data-edugame-match3-mission]`)?.getAttribute('data-edugame-match3-mission') || '';
    const tiles = [...document.querySelectorAll(`${sel} .eg-match3-tile[data-edugame-item]:not([disabled])`)];
    return {
      mission,
      board: tiles
      .map((tile) => ({
        id: tile.getAttribute('data-edugame-item') || '',
        group: tile.getAttribute('data-group') || '',
        index: Number(tile.getAttribute('data-index') || 0),
        row: Number(tile.getAttribute('data-row') || 0),
        col: Number(tile.getAttribute('data-col') || 0),
      }))
      .filter((tile) => tile.id)
      .sort((a, b) => a.index - b.index),
    };
  }, selector);
  const pair = findMatch3Swap(state.board, correct, state.mission);
  const ids = pair ? pair.map((tile) => tile.id) : [];
  for (const id of ids) {
    await page.evaluate(({ sel, itemId }) => {
      const button = document.querySelector(`${sel} button[data-edugame-item="${itemId}"]`);
      if (button instanceof HTMLElement) button.click();
    }, { sel: selector, itemId: id });
    await page.waitForTimeout(260);
  }
}

function findMatch3Swap(board, wantCorrect, missionKey = '') {
  const byIndex = new Map(board.map((tile) => [tile.index, tile]));
  let fallback = null;
  for (const tile of board) {
    for (const delta of [1, 6]) {
      const other = byIndex.get(tile.index + delta);
      if (!other) continue;
      if (delta === 1 && tile.row !== other.row) continue;
      const swapped = board.map((entry) => {
        if (entry.index === tile.index) return { ...other, index: tile.index, row: tile.row, col: tile.col };
        if (entry.index === other.index) return { ...tile, index: other.index, row: other.row, col: other.col };
        return entry;
      }).sort((a, b) => a.index - b.index);
      const makesMatch = hasMatch3Line(swapped);
      const makesMissionMatch = missionKey ? hasMatch3Line(swapped, missionKey) : makesMatch;
      if (wantCorrect && makesMissionMatch) return [tile, other];
      if (!wantCorrect && !makesMatch) return [tile, other];
      if (!wantCorrect && makesMatch && !makesMissionMatch) return [tile, other];
      if (makesMatch === wantCorrect && !fallback) fallback = [tile, other];
    }
  }
  return fallback;
}

function hasMatch3Line(board, groupKey = '') {
  for (let row = 0; row < 6; row += 1) {
    let run = 1;
    for (let col = 1; col < 6; col += 1) {
      const current = board[row * 6 + col];
      const previous = board[row * 6 + col - 1];
      const matched = current?.group && current.group === previous?.group && (!groupKey || current.group === groupKey);
      run = matched ? run + 1 : 1;
      if (run >= 3) return true;
    }
  }
  for (let col = 0; col < 6; col += 1) {
    let run = 1;
    for (let row = 1; row < 6; row += 1) {
      const current = board[row * 6 + col];
      const previous = board[(row - 1) * 6 + col];
      const matched = current?.group && current.group === previous?.group && (!groupKey || current.group === groupKey);
      run = matched ? run + 1 : 1;
      if (run >= 3) return true;
    }
  }
  return false;
}

async function clickSelectorWhenReady(page, targetSelector) {
  await page.waitForSelector(targetSelector, { timeout: 6500 }).catch(() => {});
  const target = page.locator(targetSelector).first();
  if (!(await target.count())) return false;
  try {
    await target.click({ timeout: 5000, noWaitAfter: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function readState(page) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    const readMatch3Board = (root) => [...(root?.querySelectorAll('.eg-match3-tile[data-group][data-index]') ?? [])]
      .map((tile) => ({
        group: tile.getAttribute('data-group') || '',
        index: Number(tile.getAttribute('data-index') || 0),
        row: Number(tile.getAttribute('data-row') || 0),
        col: Number(tile.getAttribute('data-col') || 0),
      }))
      .filter((tile) => tile.group)
      .sort((a, b) => a.index - b.index);
    const countMatch3Lines = (board) => {
      let count = 0;
      for (let row = 0; row < 6; row += 1) {
        let run = 1;
        for (let col = 1; col < 6; col += 1) {
          const current = board[row * 6 + col];
          const previous = board[row * 6 + col - 1];
          run = current?.group && current.group === previous?.group ? run + 1 : 1;
          if (run === 3) count += 1;
        }
      }
      for (let col = 0; col < 6; col += 1) {
        let run = 1;
        for (let row = 1; row < 6; row += 1) {
          const current = board[row * 6 + col];
          const previous = board[(row - 1) * 6 + col];
          run = current?.group && current.group === previous?.group ? run + 1 : 1;
          if (run === 3) count += 1;
        }
      }
      return count;
    };
    const countMatch3Swaps = (board) => {
      let count = 0;
      for (const tile of board) {
        for (const delta of [1, 6]) {
          const other = board.find((entry) => entry.index === tile.index + delta);
          if (!other) continue;
          if (delta === 1 && tile.row !== other.row) continue;
          const swapped = board.map((entry) => {
            if (entry.index === tile.index) return { ...other, index: tile.index, row: tile.row, col: tile.col };
            if (entry.index === other.index) return { ...tile, index: other.index, row: other.row, col: other.col };
            return entry;
          }).sort((a, b) => a.index - b.index);
          if (countMatch3Lines(swapped) > 0) count += 1;
        }
      }
      return count;
    };
    const countMatch3MissionSwaps = (board, missionKey) => {
      if (!missionKey) return 0;
      let count = 0;
      for (const tile of board) {
        for (const delta of [1, 6]) {
          const other = board.find((entry) => entry.index === tile.index + delta);
          if (!other) continue;
          if (delta === 1 && tile.row !== other.row) continue;
          const swapped = board.map((entry) => {
            if (entry.index === tile.index) return { ...other, index: tile.index, row: tile.row, col: tile.col };
            if (entry.index === other.index) return { ...tile, index: other.index, row: other.row, col: other.col };
            return entry;
          }).sort((a, b) => a.index - b.index);
          if (hasMatch3LineForGroup(swapped, missionKey)) count += 1;
        }
      }
      return count;
    };
    const hasMatch3LineForGroup = (board, missionKey) => {
      for (let row = 0; row < 6; row += 1) {
        let run = 1;
        for (let col = 1; col < 6; col += 1) {
          const current = board[row * 6 + col];
          const previous = board[row * 6 + col - 1];
          run = current?.group === missionKey && current.group === previous?.group ? run + 1 : 1;
          if (run >= 3) return true;
        }
      }
      for (let col = 0; col < 6; col += 1) {
        let run = 1;
        for (let row = 1; row < 6; row += 1) {
          const current = board[row * 6 + col];
          const previous = board[(row - 1) * 6 + col];
          run = current?.group === missionKey && current.group === previous?.group ? run + 1 : 1;
          if (run >= 3) return true;
        }
      }
      return false;
    };
    return {
      runtime: node?.getAttribute('data-edugame-runtime') ?? '',
      gameType: node?.getAttribute('data-edugame-game-type') ?? '',
      playType: node?.getAttribute('data-edugame-play-type') ?? '',
      result: node?.getAttribute('data-edugame-result') ?? '',
      phase: node?.getAttribute('data-edugame-phase') ?? '',
      practiceMode: node?.getAttribute('data-edugame-practice-mode') ?? '',
      practiceKps: Number(node?.getAttribute('data-edugame-practice-kps') ?? 0),
      liveEvents: Number(node?.getAttribute('data-edugame-live-events') ?? 0),
      eventTypes: node?.getAttribute('data-edugame-event-types') ?? '',
      emittedRecords: Number(window.__dgbookEduGameRecords?.length ?? 0),
      pageRecordState: document.querySelector('[data-edugame-record-summary]')?.getAttribute('data-state') ?? '',
      pageRecordScore: Number(document.querySelector('[data-edugame-record-summary]')?.getAttribute('data-score') ?? 0),
      pageRecordText: document.querySelector('[data-edugame-record-summary]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      started: node?.getAttribute('data-edugame-started') === 'true',
      mistakeCount: Number(node?.getAttribute('data-edugame-mistakes') ?? 0),
      recordEvents: Number(node?.getAttribute('data-edugame-record-events') ?? 0),
      score: Number(node?.querySelector('[data-edugame-score]')?.getAttribute('data-edugame-score') ?? 0),
      feedback: node?.querySelector('[data-edugame-feedback]')?.textContent?.trim() ?? '',
      itemCount: node?.querySelectorAll('[data-edugame-item]').length ?? 0,
      targetCount: node?.querySelectorAll('[data-edugame-target]').length ?? 0,
      quizCorrectGateIndex: [...node?.querySelectorAll('button[data-edugame-target]') ?? []].findIndex((target) => target.getAttribute('data-edugame-correct') === 'true'),
      dragTargetCount: node?.querySelectorAll('[data-edugame-target]').length ?? 0,
      dragPairableCount: node?.querySelectorAll('button[data-edugame-item][data-edugame-target-id]').length ?? 0,
      dragAlignedPairs: (() => {
        const tokens = [...node?.querySelectorAll('button[data-edugame-item][data-edugame-target-id]') ?? []];
        const targets = [...node?.querySelectorAll('button[data-edugame-target]') ?? []];
        let aligned = 0;
        for (let index = 0; index < Math.min(tokens.length, targets.length); index += 1) {
          if (tokens[index]?.getAttribute('data-edugame-target-id') === targets[index]?.getAttribute('data-edugame-target')) aligned += 1;
        }
        return aligned;
      })(),
      dragCompletedWires: node?.querySelectorAll('[data-edugame-drag-wire]').length ?? 0,
      dragGuideWires: node?.querySelectorAll('[data-edugame-drag-guide]').length ?? 0,
      hasClassRunWave: Boolean(node?.querySelector('[data-edugame-classrun-wave]')),
      classRunQueue: Number(node?.querySelector('[data-edugame-classrun-queue]')?.textContent?.match(/\d+/)?.[0] ?? 0),
      hasClassRunHit: Boolean(node?.querySelector('[data-edugame-classrun-hit]')),
      hasClassRunMiss: Boolean(node?.querySelector('[data-edugame-classrun-miss]')),
      enabledActionCount: node?.querySelectorAll('button[data-edugame-item]:not([disabled]),button[data-edugame-target]:not([disabled])').length ?? 0,
      hasStart: Boolean(node?.querySelector('[data-edugame-start]')),
      hasCanvas: Boolean(node?.querySelector('.eg-pixi-canvas canvas')),
      canvasArea: (() => {
        const canvas = node?.querySelector('.eg-pixi-canvas canvas');
        const rect = canvas?.getBoundingClientRect();
        return rect ? Math.round(rect.width * rect.height) : 0;
      })(),
      hasGuide: Boolean(node?.querySelector('[data-edugame-guide]')),
      hasMission: Boolean(node?.querySelector('.eg-mission')),
      hasFullscreen: Boolean(node?.querySelector('[data-edugame-fullscreen]')),
      hasAudioToggle: Boolean(node?.querySelector('[data-edugame-audio-toggle]')),
      hasAnswerToggle: Boolean(node?.querySelector('[data-edugame-answer-toggle]')),
      hasGameMotion: node?.getAttribute('data-edugame-game-motion') === 'animated',
      hasChallengeMode: Boolean(node?.getAttribute('data-edugame-challenge-mode')),
      hasPressureMeter: Boolean(node?.querySelector('[data-edugame-pressure-meter]')),
      hasBadgeTrack: Boolean(node?.querySelector('[data-edugame-badge-track]')),
      stageMilestones: node?.querySelectorAll('[data-edugame-stage-milestone]').length ?? 0,
      stageActiveMilestones: node?.querySelectorAll('[data-edugame-stage-milestone][data-edugame-stage-state="active"]').length ?? 0,
      stageDoneMilestones: node?.querySelectorAll('[data-edugame-stage-milestone][data-edugame-stage-state="done"]').length ?? 0,
      hasBossReview: Boolean(node?.querySelector('[data-edugame-boss-review]')),
      bossHp: Number(node?.querySelector('[data-edugame-boss-hp]')?.getAttribute('data-edugame-boss-hp') ?? 0),
      bossPhaseCount: node?.querySelectorAll('[data-edugame-boss-phase]').length ?? 0,
      hasBossWaveTrack: Boolean(node?.querySelector('[data-edugame-boss-wave-track]')),
      hasBossWaveCard: Boolean(node?.querySelector('[data-edugame-boss-wave-card]')),
      bossWave: Number(node?.querySelector('[data-edugame-boss-review]')?.getAttribute('data-edugame-boss-wave') ?? 0),
      bossActivePhaseCount: node?.querySelectorAll('[data-edugame-boss-phase="active"]').length ?? 0,
      hasBossCounter: Boolean(node?.querySelector('[data-edugame-boss-counter]')),
      livesLeft: Number(node?.getAttribute('data-edugame-lives-left') ?? 0),
      livesMax: Number(node?.getAttribute('data-edugame-lives-max') ?? 0),
      answerPanel: node?.querySelector('[data-edugame-answer-panel]')?.getAttribute('data-edugame-answer-panel') ?? '',
      answerItems: node?.querySelectorAll('[data-edugame-answer-item]').length ?? 0,
      answerText: node?.querySelector('[data-edugame-answer-panel]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      memoryAdjacentPairs: (() => {
        const cards = [...node?.querySelectorAll('button[data-edugame-item][data-edugame-target-id]') ?? []];
        let adjacent = 0;
        for (let index = 1; index < cards.length; index += 1) {
          if (cards[index - 1]?.getAttribute('data-edugame-target-id') === cards[index]?.getAttribute('data-edugame-target-id')) adjacent += 1;
        }
        return adjacent;
      })(),
      memoryKindCount: new Set([...node?.querySelectorAll('button[data-edugame-card-kind]') ?? []].map((card) => card.getAttribute('data-edugame-card-kind'))).size,
      hasMemoryPreview: Boolean(node?.querySelector('[data-edugame-memory-preview]')),
      memoryEnabledDuringPreview: node?.querySelector('[data-edugame-memory-preview]')
        ? node?.querySelectorAll('button[data-edugame-card-kind]:not([disabled])').length ?? 0
        : 0,
      quickHitVisualCorrectClasses: node?.querySelectorAll('.eg-chip.is-target,.eg-chip.is-distractor').length ?? 0,
      quickHitToneCount: new Set([...node?.querySelectorAll('.eg-chip[data-edugame-chip-tone]') ?? []].map((chip) => chip.getAttribute('data-edugame-chip-tone'))).size,
      hasQuizRushMeter: Boolean(node?.querySelector('[data-edugame-quiz-rush-meter]')),
      quizChainHot: node?.querySelectorAll('[data-edugame-quiz-chain-step="hot"]').length ?? 0,
      hasQuizShock: Boolean(node?.querySelector('[data-edugame-quiz-shock]')),
      memoryOverflowingCards: (() => {
        const stage = node?.querySelector('.eg-stage-wrap')?.getBoundingClientRect();
        const cards = [...node?.querySelectorAll('button[data-edugame-card-kind]') ?? []];
        if (!stage || !cards.length) return 0;
        return cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.left < stage.left || rect.right > stage.right || rect.top < stage.top || rect.bottom > stage.bottom;
        }).length;
      })(),
      match3Mission: Boolean(node?.querySelector('[data-edugame-match3-mission][data-edugame-match3-mission-progress]')),
      match3Motion: node?.querySelector('[data-edugame-match3-motion]')?.getAttribute('data-edugame-match3-motion') ?? '',
      match3BoardState: node?.querySelector('[data-edugame-match3-board-state]')?.getAttribute('data-edugame-match3-board-state') ?? '',
      match3ObjectiveTiles: node?.querySelectorAll('[data-edugame-match3-objective-tile="true"]').length ?? 0,
      match3VisualObjectiveTiles: node?.querySelectorAll('.eg-match3-tile.is-objective').length ?? 0,
      match3MoveBudget: Number(node?.querySelector('[data-edugame-match3-move-budget]')?.textContent?.match(/\d+/)?.[0] ?? 0),
      hasMatch3ChallengeMeter: Boolean(node?.querySelector('[data-edugame-match3-challenge-meter]')),
      hasMatch3MotionPulse: Boolean(node?.querySelector('[data-edugame-match3-motion-pulse]')),
      match3BurstCount: node?.querySelectorAll('[data-edugame-match3-burst]').length ?? 0,
      match3ClearingTiles: node?.querySelectorAll('.eg-match3-tile.is-clear').length ?? 0,
      match3InitialMatches: countMatch3Lines(readMatch3Board(node)),
      match3AvailableSwaps: countMatch3Swaps(readMatch3Board(node)),
      match3MissionSwaps: countMatch3MissionSwaps(readMatch3Board(node), node?.querySelector('[data-edugame-match3-mission]')?.getAttribute('data-edugame-match3-mission') ?? ''),
      match3NeutralTiles: node?.querySelectorAll('.eg-match3-tile[data-edugame-correct="neutral"]').length ?? 0,
      match3LongTileLabels: [...(node?.querySelectorAll('[data-edugame-match3-label]') ?? [])].filter((tile) => (tile.getAttribute('data-edugame-match3-label') || '').trim().length > 4).length,
      scoreMoment: node?.querySelector('[data-edugame-score-moment]')?.getAttribute('data-edugame-score-moment') ?? '',
      actionFeedback: node?.querySelector('[data-edugame-action-feedback]')?.getAttribute('data-edugame-action-feedback') ?? '',
      hasScore: Boolean(node?.querySelector('[data-edugame-score]')),
      hasFeedback: Boolean(node?.querySelector('[data-edugame-feedback]')),
      hasReview: Boolean(node?.querySelector('[data-edugame-review]')),
      reviewState: node?.querySelector('[data-edugame-review]')?.getAttribute('data-edugame-review') ?? '',
      reviewMistakes: node?.querySelectorAll('.eg-review-list li').length ?? 0,
      reviewMetrics: node?.querySelectorAll('[data-edugame-review-metric]').length ?? 0,
      reviewAwards: node?.querySelectorAll('[data-edugame-award]').length ?? 0,
      reviewBadges: node?.querySelectorAll('[data-edugame-review-badge]').length ?? 0,
      reviewUnlockedBadges: node?.querySelectorAll('[data-edugame-review-badge][data-edugame-badge-state="unlocked"]').length ?? 0,
      drillRouteSteps: node?.querySelectorAll('[data-edugame-drill-step]').length ?? 0,
      reviewCta: Boolean(node?.querySelector('[data-edugame-review-cta="retry"]')),
      reviewDrillCta: Boolean(node?.querySelector('[data-edugame-review-cta="drill"]')),
      reviewText: node?.querySelector('[data-edugame-review]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  }, selector);
}

function readProjects() {
  if (process.argv.includes('--projects')) {
    const value = process.argv[process.argv.indexOf('--projects') + 1] ?? '';
    return value.split(',').filter(Boolean);
  }
  if (process.argv.includes('--sample')) return SAMPLE_PROJECTS;
  return ALL_PROJECTS;
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}
