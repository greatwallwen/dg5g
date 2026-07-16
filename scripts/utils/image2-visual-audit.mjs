import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONTRACT = 'docs/design/image2/image2-route-contract.json';

export async function readImage2Contract(file = DEFAULT_CONTRACT) {
  return JSON.parse(await readFile(path.resolve(process.cwd(), file), 'utf8'));
}

export function flattenImage2States(contract) {
  return (contract?.surfaces ?? []).flatMap((surface) => (
    (surface.states ?? []).map((state) => ({
      key: `${surface.id}/${state.id}`,
      surfaceId: surface.id,
      stateId: state.id,
      state,
    }))
  ));
}

export function buildCaptureJobs(contract, filters = {}) {
  const surfaceIds = toOptionalSet(filters.surfaceIds);
  const stateKeys = toOptionalSet(filters.stateKeys);
  const viewportIds = toOptionalSet(filters.viewportIds);
  const captureIds = toOptionalSet(filters.captures);
  const jobs = [];
  for (const entry of flattenImage2States(contract)) {
    if (surfaceIds && !surfaceIds.has(entry.surfaceId)) continue;
    if (stateKeys && !stateKeys.has(entry.key)) continue;
    for (const viewportId of entry.state.viewportProfiles ?? []) {
      if (viewportIds && !viewportIds.has(viewportId)) continue;
      const profile = contract.viewportProfiles?.[viewportId];
      if (!profile) throw new Error(`Unknown Image2 viewport profile: ${viewportId}`);
      for (const capture of entry.state.screenshotPolicy?.captures ?? ['viewport']) {
        if (captureIds && !captureIds.has(capture)) continue;
        jobs.push({
          ...entry,
          actor: entry.state.actor,
          viewportId,
          profile,
          capture,
          fileName: image2ScreenshotName(
            entry.surfaceId,
            entry.stateId,
            entry.state.actor,
            viewportId,
            capture,
          ),
        });
      }
    }
  }
  const names = jobs.map(({ fileName }) => fileName);
  if (new Set(names).size !== names.length) throw new Error('Image2 capture matrix contains duplicate filenames.');
  return jobs;
}

export function image2ScreenshotName(surface, state, actor, viewport, capture = 'viewport') {
  const base = [surface, state, actor, viewport].map(safeFilePart).join('--');
  return `${base}${capture === 'viewport' ? '' : `--${safeFilePart(capture)}`}.png`;
}

export function evaluateImage2Layout({ state, contract, profile, observation }) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const tolerance = contract?.interactionPolicies?.overflow?.documentTolerancePx ?? 1;
  const viewportWidth = observation.viewportWidth ?? profile?.width ?? 0;
  if ((observation.documentScrollWidth ?? 0) > viewportWidth + tolerance) {
    fail('document-horizontal-overflow', {
      scrollWidth: observation.documentScrollWidth,
      viewportWidth,
      tolerance,
    });
  }

  if (contract?.interactionPolicies?.overflow?.hideDocumentOverflowAllowed === false) {
    const hidden = ['hidden', 'clip'];
    if (hidden.includes(observation.htmlOverflowX) || hidden.includes(observation.bodyOverflowX)) {
      fail('document-overflow-hidden', {
        html: observation.htmlOverflowX,
        body: observation.bodyOverflowX,
      });
    }
  }

  const primaryActions = observation.primaryActions ?? [];
  const visibleEnabled = primaryActions.filter((action) => action.visible && action.enabled);
  const policy = state.primaryActionPolicy;
  const primaryCountValid = policy === 'exactly-one'
    ? primaryActions.length === 1 && visibleEnabled.length === 1
    : policy === 'at-most-one'
      ? primaryActions.length <= 1 && visibleEnabled.length <= 1
      : policy === 'none' ? primaryActions.length === 0 : false;
  if (!primaryCountValid) {
    fail('primary-action-count', {
      policy,
      rendered: primaryActions.length,
      visibleEnabled: visibleEnabled.length,
    });
  }
  const policyMarkers = observation.primaryActionPolicyMarkers ?? [];
  if (policyMarkers.length !== 1 || policyMarkers[0] !== policy) {
    fail('primary-action-policy-marker', { expected: policy, actual: policyMarkers });
  }

  const allowedMotion = new Set(contract?.interactionPolicies?.reducedMotion?.allowedValues ?? ['paused', 'reduced']);
  const motionValues = observation.motionValues ?? [];
  if (motionValues.length === 0 || motionValues.some((value) => !allowedMotion.has(value))) {
    fail('motion-state-invalid', { allowed: [...allowedMotion], actual: motionValues });
  }
  if ((observation.runningAnimations ?? 0) > 0) {
    fail('reduced-motion-running-animation', observation.runningAnimations);
  }

  for (const selector of state.requiredSelectors ?? []) {
    if ((observation.selectorCounts?.[selector] ?? 0) < 1) {
      fail('required-selector-missing', selector);
    }
  }
  for (const region of observation.regionRects ?? []) {
    if (region.count < 1 || region.width <= 0 || region.height <= 0) {
      fail('required-region-missing', { name: region.name, selector: region.selector });
    }
  }

  const clipped = (observation.clickables ?? []).filter((control) => (
    control.visible
      && !control.insideAllowedScroller
      && !control.svg
      && (control.width <= 0
        || control.height <= 0
        || control.left < -tolerance
        || control.right > viewportWidth + tolerance)
  ));
  if (clipped.length) {
    fail('clickable-horizontal-clipping', clipped.map(({ tag, label, left, right }) => ({ tag, label, left, right })));
  }

  const minimumStickyGap = contract?.interactionPolicies?.overflow?.stickyContentGapPx ?? 16;
  for (const gap of observation.stickyGaps ?? []) {
    if (gap.value < minimumStickyGap) fail('sticky-content-gap', gap);
  }
  return failures;
}

export async function observeImage2Layout(page, state) {
  return page.evaluate(({ requiredSelectors, regions, allowedInternalScrollers }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const isInsideAllowedScroller = (element) => allowedInternalScrollers.some((selector) => {
      const container = element.closest(selector);
      if (!container) return false;
      const style = getComputedStyle(container);
      const scrollsX = /auto|scroll/.test(style.overflowX) && container.scrollWidth > container.clientWidth + 1;
      const scrollsY = /auto|scroll/.test(style.overflowY) && container.scrollHeight > container.clientHeight + 1;
      return scrollsX || scrollsY;
    });
    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        visible: visible(element),
        enabled: !element.matches(':disabled,[aria-disabled="true"]'),
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        insideAllowedScroller: isInsideAllowedScroller(element),
        svg: element.namespaceURI === 'http://www.w3.org/2000/svg',
      };
    };
    const selectorCounts = Object.fromEntries(requiredSelectors.map((selector) => [
      selector,
      document.querySelectorAll(selector).length,
    ]));
    const regionRects = regions.map((region) => {
      const matches = [...document.querySelectorAll(region.selector)].filter(visible);
      const rect = matches[0]?.getBoundingClientRect();
      return {
        ...region,
        count: matches.length,
        width: rect ? Math.round(rect.width * 10) / 10 : 0,
        height: rect ? Math.round(rect.height * 10) / 10 : 0,
      };
    });
    const root = document.documentElement;
    const body = document.body;
    const motionElements = [...document.querySelectorAll('[data-motion]')].filter(visible);
    return {
      actualUrl: location.href,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentScrollWidth: root.scrollWidth,
      documentScrollHeight: root.scrollHeight,
      htmlOverflowX: getComputedStyle(root).overflowX,
      bodyOverflowX: getComputedStyle(body).overflowX,
      primaryActions: [...document.querySelectorAll('[data-primary-action]')].map(describe),
      primaryActionPolicyMarkers: [...document.querySelectorAll('[data-primary-action-policy]')]
        .filter(visible)
        .map((element) => element.getAttribute('data-primary-action-policy')),
      motionValues: motionElements.map((element) => element.getAttribute('data-motion')),
      selectorCounts,
      regionRects,
      clickables: [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]')].map(describe),
      runningAnimations: [...document.getAnimations({ subtree: true })]
        .filter((animation) => animation.playState === 'running').length,
      skipLinks: [...document.querySelectorAll('a[href^="#"]')]
        .filter((element) => /跳到|跳过|主要内容/.test(element.textContent || '')).length,
    };
  }, {
    requiredSelectors: state.requiredSelectors ?? [],
    regions: state.regions ?? [],
    allowedInternalScrollers: state.allowedInternalScrollers ?? [],
  });
}

export async function waitForImage2Stability(page, state, timeout = 20_000) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => document.fonts?.ready);
  for (const selector of state.requiredSelectors ?? []) {
    await page.locator(selector).first().waitFor({ state: 'attached', timeout });
  }
  await page.waitForFunction(() => (
    [...document.images].every((image) => image.complete)
  ), null, { timeout });
  await page.waitForTimeout(80);
}

export async function authenticateImage2Context(context, actor, baseUrl, password = '123456') {
  const username = image2Username(actor);
  if (!username) return { actor, username: null, anonymous: true };
  const response = await context.request.post(new URL('/api/auth/login', normalizeBaseUrl(baseUrl)).toString(), {
    data: { username, password },
  });
  if (!response.ok()) throw new Error(`${actor} login returned ${response.status()}`);
  return { actor, username, anonymous: false };
}

export function image2Username(actor) {
  return ({
    'stu-01': 'student01',
    'stu-02': 'student02',
    'stu-03': 'student03',
    teacher01: 'teacher01',
  })[actor] ?? null;
}

export function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function safeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function toOptionalSet(value) {
  if (!value) return null;
  const items = Array.isArray(value) ? value : String(value).split(',');
  return new Set(items.map((item) => String(item).trim()).filter(Boolean));
}
