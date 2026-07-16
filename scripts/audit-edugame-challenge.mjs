#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutput, textbookOutputRelative } from './textbook-paths.mjs';

const widgetsDir = textbookOutput('widgets');
const widgetsLabel = textbookOutputRelative('widgets');

const failures = [];
const templateIds = new Set();

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRewardModel(gameConfig) {
  return gameConfig.rewardModel ?? gameConfig.gameExperience?.rewardModel;
}

function getOnboardingPath(gameConfig) {
  return gameConfig.onboardingPath ?? gameConfig.gameExperience?.onboardingPath;
}

function getMechanicRules(gameConfig) {
  return gameConfig.mechanicRules ?? gameConfig.inputModel?.mechanicRules ?? gameConfig.gameExperience?.mechanicRules;
}

function getChallengeMode(gameConfig) {
  return gameConfig.challengeMode ?? gameConfig.inputModel?.challengeMode ?? gameConfig.gameExperience?.challengeMode;
}

function getWinCondition(gameConfig) {
  return gameConfig.winCondition ?? gameConfig.answerModel?.winCondition ?? gameConfig.gameExperience?.winCondition;
}

function getTargets(gameConfig) {
  return gameConfig.targets ?? gameConfig.inputModel?.targets ?? gameConfig.answerModel?.targets ?? gameConfig.answerModel?.targetIds;
}

function getPairEntries(gameConfig) {
  if (Array.isArray(gameConfig.pairs)) {
    return gameConfig.pairs;
  }

  if (Array.isArray(gameConfig.answerModel?.pairs)) {
    return gameConfig.answerModel.pairs;
  }

  if (isObject(gameConfig.pairs)) {
    return Object.entries(gameConfig.pairs).map(([sourceId, targetId]) => ({ sourceId, targetId }));
  }

  if (isObject(gameConfig.answerModel?.pairs)) {
    return Object.entries(gameConfig.answerModel.pairs).map(([sourceId, targetId]) => ({ sourceId, targetId }));
  }

  const options = gameConfig.inputModel?.options;
  if (Array.isArray(options)) {
    return options.filter((option) => hasText(option?.expectedTargetId));
  }

  return [];
}

function getChallengeItems(gameConfig, pairEntries) {
  if (Array.isArray(gameConfig.inputModel?.options)) {
    return gameConfig.inputModel.options;
  }

  if (Array.isArray(gameConfig.challengeItems)) {
    return gameConfig.challengeItems;
  }

  if (Array.isArray(gameConfig.challenges)) {
    return gameConfig.challenges;
  }

  return pairEntries;
}

function getLevelItems(gameConfig) {
  return toArray(gameConfig.levels?.flatMap((level) => toArray(level?.items)));
}

function getDistractors(gameConfig) {
  return toArray(gameConfig.distractors ?? gameConfig.inputModel?.distractors ?? gameConfig.answerModel?.distractors);
}

function getScoreMoments(gameConfig) {
  return toArray(gameConfig.scoreMoments ?? gameConfig.gameExperience?.scoreMoments);
}

function getScoringDimensions(gameConfig) {
  return toArray(gameConfig.scoringRubric?.dimensions);
}

function getReplayPrompts(gameConfig) {
  return toArray(gameConfig.replayPrompts ?? gameConfig.interaction?.replayPrompts);
}

function getErrorFeedback(gameConfig) {
  return toArray(gameConfig.errorFeedback ?? gameConfig.interaction?.errorFeedback);
}

function requireCondition(fileName, condition, message) {
  if (!condition) {
    failures.push(`${fileName}: ${message}`);
  }
}

function auditGameConfig(fileName, gameConfig) {
  if (!isObject(gameConfig)) {
    failures.push(`${fileName}: missing props.gameConfig object`);
    return;
  }

  const pairEntries = getPairEntries(gameConfig);
  const targets = getTargets(gameConfig);
  const challengeItems = getChallengeItems(gameConfig, pairEntries);
  const rewardModel = getRewardModel(gameConfig);
  const badges = rewardModel?.badges;
  const scoringRubric = gameConfig.scoringRubric;
  const onboardingPath = getOnboardingPath(gameConfig);
  const mechanicRules = getMechanicRules(gameConfig);
  const challengeMode = getChallengeMode(gameConfig);
  const winCondition = getWinCondition(gameConfig);
  const pressureModel = gameConfig.pressureModel;
  const levelItems = getLevelItems(gameConfig);
  const distractors = getDistractors(gameConfig);
  const scoreMoments = getScoreMoments(gameConfig);
  const scoringDimensions = getScoringDimensions(gameConfig);
  const replayPrompts = getReplayPrompts(gameConfig);
  const errorFeedback = getErrorFeedback(gameConfig);
  const falseLevelItems = levelItems.filter((item) => item?.correct === false);

  requireCondition(fileName, hasText(gameConfig.gameType), 'gameConfig.gameType must be a non-empty string');
  requireCondition(fileName, hasText(gameConfig.templateId), 'gameConfig.templateId must be a non-empty string');
  requireCondition(fileName, hasPositiveNumber(gameConfig.timeLimitSec), 'gameConfig.timeLimitSec must be a positive number');
  requireCondition(fileName, hasPositiveNumber(gameConfig.mistakeLimit), 'gameConfig.mistakeLimit must be a positive number');
  requireCondition(fileName, pairEntries.length >= 5, `gameConfig must define at least 5 pairs; found ${pairEntries.length}`);
  requireCondition(fileName, Array.isArray(targets) && targets.length >= 5, `gameConfig must define at least 5 targets; found ${Array.isArray(targets) ? targets.length : 0}`);
  requireCondition(fileName, challengeItems.length >= 5, `gameConfig must define at least 5 challenge items; found ${challengeItems.length}`);
  requireCondition(fileName, Array.isArray(gameConfig.challengeLevels) && gameConfig.challengeLevels.length >= 3, 'gameConfig.challengeLevels must contain at least 3 levels');
  requireCondition(fileName, isObject(rewardModel), 'gameConfig must define rewardModel, either at top level or gameExperience.rewardModel');
  requireCondition(fileName, Array.isArray(badges) && badges.length > 0 && badges.every(hasText), 'rewardModel.badges must contain at least one non-empty badge');
  requireCondition(fileName, isObject(scoringRubric), 'gameConfig.scoringRubric must be an object');
  requireCondition(fileName, Array.isArray(onboardingPath) && onboardingPath.length > 0, 'gameConfig must define onboardingPath, either at top level or gameExperience.onboardingPath');
  requireCondition(fileName, hasText(challengeMode), 'gameConfig must define challengeMode for template-specific play');
  requireCondition(fileName, hasText(winCondition), 'gameConfig must define winCondition for challenge completion');
  requireCondition(fileName, isObject(pressureModel), 'gameConfig must define pressureModel for challenge pressure');
  requireCondition(fileName, hasText(pressureModel?.label), 'pressureModel.label must explain the challenge risk');
  requireCondition(fileName, hasPositiveNumber(pressureModel?.failureBudget), 'pressureModel.failureBudget must be a positive number');
  requireCondition(fileName, hasPositiveNumber(pressureModel?.timeBudgetSec), 'pressureModel.timeBudgetSec must be a positive number');
  requireCondition(fileName, !hasPositiveNumber(pressureModel?.failureBudget) || pressureModel.failureBudget <= gameConfig.mistakeLimit, 'pressureModel.failureBudget must not exceed mistakeLimit');
  requireCondition(fileName, !hasPositiveNumber(pressureModel?.timeBudgetSec) || pressureModel.timeBudgetSec <= gameConfig.timeLimitSec, 'pressureModel.timeBudgetSec must not exceed timeLimitSec');
  requireCondition(fileName, Array.isArray(mechanicRules) && mechanicRules.length >= 3 && mechanicRules.every(hasText), 'gameConfig must define at least 3 mechanicRules');
  requireCondition(fileName, distractors.length >= 3, `gameConfig must define at least 3 distractors; found ${distractors.length}`);
  requireCondition(fileName, falseLevelItems.length >= 3, `gameConfig levels must include at least 3 playable false distractor items; found ${falseLevelItems.length}`);
  requireCondition(fileName, scoreMoments.length >= 4, `gameConfig must define at least 4 score moments; found ${scoreMoments.length}`);
  requireCondition(fileName, scoringDimensions.length >= 4, `scoringRubric.dimensions must contain at least 4 dimensions; found ${scoringDimensions.length}`);
  requireCondition(fileName, replayPrompts.length >= 2 && replayPrompts.every(hasText), 'gameConfig must define at least 2 replay prompts');
  requireCondition(fileName, errorFeedback.length >= 2 && errorFeedback.every(hasText), 'gameConfig must define at least 2 error feedback messages');
  requireCondition(fileName, hasText(gameConfig.reviewSummary?.pass) && hasText(gameConfig.reviewSummary?.fail), 'reviewSummary.pass and reviewSummary.fail must be non-empty');
  if (hasText(gameConfig.templateId)) {
    templateIds.add(gameConfig.templateId);
  }

  challengeItems.forEach((item, index) => {
    const label = hasText(item?.id) ? item.id : `#${index + 1}`;
    requireCondition(fileName, hasText(item?.challenge), `challenge item ${label} must define challenge text`);
    requireCondition(fileName, hasText(item?.hint), `challenge item ${label} must define hint text`);
    requireCondition(fileName, hasText(item?.feedback), `challenge item ${label} must define feedback text`);
  });

  distractors.forEach((item, index) => {
    const label = hasText(item?.id) ? item.id : `#${index + 1}`;
    requireCondition(fileName, hasText(item?.label), `distractor ${label} must define label text`);
    requireCondition(fileName, hasText(item?.whyWrong), `distractor ${label} must explain why it is wrong`);
  });

  scoreMoments.forEach((moment, index) => {
    const label = hasText(moment?.id) ? moment.id : `#${index + 1}`;
    requireCondition(fileName, hasText(moment?.label), `score moment ${label} must define label text`);
    requireCondition(fileName, hasPositiveNumber(moment?.points), `score moment ${label} must define positive points`);
  });

  scoringDimensions.forEach((dimension, index) => {
    const label = hasText(dimension?.id) ? dimension.id : `#${index + 1}`;
    requireCondition(fileName, hasText(dimension?.label), `scoring dimension ${label} must define label text`);
    requireCondition(fileName, hasPositiveNumber(dimension?.points), `scoring dimension ${label} must define positive points`);
  });
}

async function main() {
  const fileNames = (await readdir(widgetsDir))
    .filter((fileName) => fileName.includes('edugame') && fileName.endsWith('.json'))
    .sort();

  if (fileNames.length === 0) {
    failures.push(`${widgetsLabel}: no *edugame*.json files found`);
  }

  for (const fileName of fileNames) {
    const filePath = path.join(widgetsDir, fileName);
    let widget;

    try {
      widget = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      failures.push(`${fileName}: invalid JSON (${error.message})`);
      continue;
    }

    auditGameConfig(fileName, widget.props?.gameConfig);
  }

  if (templateIds.size < 6) {
    failures.push(`${widgetsLabel}: expected at least 6 EduGame templateId values, found ${templateIds.size}: ${[...templateIds].join(', ')}`);
  }

  if (failures.length > 0) {
    console.error(`Edugame challenge audit failed: ${failures.length} issue(s) across ${fileNames.length} file(s).`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Edugame challenge audit passed: ${fileNames.length} file(s) checked.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
