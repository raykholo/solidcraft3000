// Browser proof that the Discord button opens SolidCraft 3000 Community Support and nothing leaves the page.
// npm ci && npx playwright install chromium
// npm run support -- http://127.0.0.1:8765/ /absolute/path/to/evidence
// Serve a CI-built web app (dist/web, or the github-pages artifact) with any static HTTP server.
// Runs in English and German. Drives the app through its control API (window.solidcraft.request), so no OCR.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const [url, directory] = process.argv.slice(2);
assert(url && directory, 'Pass the app URL and an evidence directory');
mkdirSync(directory, { recursive: true });
const origin = new URL(url).origin;
const results = [];

async function session(locale) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, locale });
    await context.addInitScript(() => {
      // Keep the random outage theatre out of the way.
      Math.random = () => 0.5;
      const audit = { armed: false, network: 0, opened: [] };
      window.__supportAudit = audit;
      const wrap = (object, key, record) => {
        if (!object || typeof object[key] !== 'function') return;
        const original = object[key];
        object[key] = function (...args) {
          if (audit.armed) { record(args); throw new Error('Blocked by the Community Support privacy test'); }
          return Reflect.apply(original, this, args);
        };
      };
      const count = () => { audit.network++; };
      wrap(window, 'fetch', count);
      wrap(XMLHttpRequest.prototype, 'send', count);
      wrap(navigator, 'sendBeacon', count);
      // egui opens links with window.open: any page the chat opened would show here.
      wrap(window, 'open', args => audit.opened.push(String(args[0])));
      for (const key of ['WebSocket', 'EventSource']) {
        const original = window[key];
        if (original) window[key] = new Proxy(original, { construct(target, args) {
          if (audit.armed) { audit.network++; throw new Error('Blocked by the Community Support privacy test'); }
          return Reflect.construct(target, args);
        } });
      }
    });
    let armed = false;
    const requests = [];
    // Block (and count) every request once armed, including browser-managed ones.
    await context.route('**/*', route => {
      if (!armed) return route.continue();
      requests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    const outside = [];
    context.on('request', r => {
      const u = r.url();
      if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.solidcraft, null, { timeout: 120000 });
    await page.waitForTimeout(8000);
    const call = async (method, params) => {
      const reply = await page.evaluate(([m, p]) => window.solidcraft.request(m, p).then(r => ({ ok: r }), e => ({ error: String(e) })), [method, params]);
      assert(!reply.error, `${method}: ${reply.error}`);
      return reply.ok;
    };
    const at = async handle => {
      const point = await call('ui.at', { handle });
      return Array.isArray(point) ? point : JSON.parse(point);
    };
    const click = async handle => {
      const [x, y] = await at(handle);
      await call('ui.click', { x, y });
      await page.waitForTimeout(500);
    };
    // The daily "new SolidCraft 3000 is ready" popup takes the first click: spend it on empty space.
    await call('ui.click', { x: 800, y: 720 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => { window.__supportAudit.armed = true; });
    armed = true;
    await click('titlebar:discord');
    await page.waitForTimeout(1000);
    await at('sc3000_support:input');
    await at('sc3000_support:real_discord');
    await page.screenshot({ path: resolve(directory, `support-${locale}-1-open.png`) });
    const say = async text => {
      await click('sc3000_support:input');
      await call('ui.text', { text });
      await call('ui.key', { key: 'Enter' });
      await page.waitForTimeout(3500);
    };
    await say(locale.startsWith('de') ? 'Meine Vollrundung schlägt fehl' : 'My fillet fails');
    await say(locale.startsWith('de') ? 'Es gibt keine Cloud' : 'There is no cloud');
    await page.screenshot({ path: resolve(directory, `support-${locale}-2-chat.png`) });
    // The chat opens below the maintenance banner: its Dismiss still takes the click, and the chat stays.
    await click('sc3000:banner:dismiss');
    await page.waitForTimeout(500);
    const banner = await page.evaluate(() => window.solidcraft.request('ui.at', { handle: 'sc3000:banner:dismiss' }).then(point => point != null, () => false));
    assert.equal(banner, false, 'The banner\'s Dismiss was covered by Community Support');
    await at('sc3000_support:input');
    const audit = await page.evaluate(() => ({ ...window.__supportAudit }));
    armed = false;
    const result = { locale, network: audit.network, opened: audit.opened, requests, outside, errors };
    writeFileSync(resolve(directory, `support-${locale}-audit.json`), JSON.stringify(result, null, 2));
    assert.equal(audit.network, 0, 'Community Support called a network API');
    assert.deepEqual(audit.opened, [], 'Community Support opened a page');
    assert.deepEqual(requests, [], 'Community Support made a browser request');
    assert.deepEqual(outside, [], 'The page loaded something from outside its own site');
    assert.deepEqual(errors, [], 'Browser errors');
    return result;
  } finally {
    await browser.close();
  }
}

results.push(await session('en-US'));
results.push(await session('de-DE'));
writeFileSync(resolve(directory, 'support-audit.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: true, results }));
