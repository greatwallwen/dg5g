import { chromium } from 'playwright';

export async function launchChromium(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (!isMissingPlaywrightBrowser(error)) throw error;
    const originalError = error;
    for (const channel of ['chrome', 'msedge']) {
      try {
        console.warn(`[playwright] bundled Chromium missing; falling back to ${channel}.`);
        return await chromium.launch({ ...options, channel });
      } catch {
        // Try the next locally installed browser channel.
      }
    }
    throw originalError;
  }
}

function isMissingPlaywrightBrowser(error) {
  const message = error?.message ?? '';
  return message.includes('Executable doesn\'t exist') && message.includes('playwright install');
}
