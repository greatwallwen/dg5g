import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\alvin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe'
});
const p = await browser.newPage();
const errors = [];
p.on('console', msg => { if (msg.type() === 'error') errors.push('CON: ' + msg.text()); });
p.on('pageerror', e => errors.push('PAGE: ' + e.message));
await p.goto('http://127.0.0.1:4321/projects/P04', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
const widgetText = await p.locator('.widgets-region').innerText().catch(() => '(no widgets-region)');
const widgetHtml = await p.locator('.widgets-region').innerHTML().catch(() => '(no html)');
console.log('=== widget region text ===');
console.log(widgetText.slice(0, 400));
console.log('=== widget region html (head 1200) ===');
console.log(widgetHtml.slice(0, 1200));
console.log('=== console errors ===');
for (const e of errors) console.log(e);
await browser.close();
