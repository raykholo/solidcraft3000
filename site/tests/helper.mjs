// SolidCraft 3000's Cumulo and insistent updates in the browser (EN and DE): Cumulo's tips and every level of the
// update notice show, Later always closes it, Update now installs nothing, the design is untouched and nothing
// leaves the page. Time is Playwright's fake clock: each fastForward(1000) is one frame and one second of use.
// npm run helper -- http://127.0.0.1:8765/ /absolute/path/to/evidence
// Drives the app through its control API. Every network API is blocked and counted, as in account.mjs.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const [url, directory] = process.argv.slice(2);
assert(url && directory, 'Pass the app URL and an evidence directory');
mkdirSync(directory, { recursive: true });
const results = [];

async function session(locale) {
  const de = locale.startsWith('de');
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const steps = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1600, height: 900 }, locale });
    await context.addInitScript(() => {
      Math.random = () => 0.5;
      const audit = { network: 0, opened: [] };
      window.__helperAudit = audit;
      const block = (object, key, record) => {
        if (!object || typeof object[key] !== 'function') return;
        object[key] = function (...args) { record(args); throw new Error('Blocked by the Cumulo check'); };
      };
      let armed = false;
      window.__arm = () => { armed = true; };
      const original = window.fetch;
      window.fetch = function (...args) { if (armed) { audit.network++; throw new Error('blocked'); } return original.apply(this, args); };
      block(navigator, 'sendBeacon', () => audit.network++);
      block(window, 'open', args => audit.opened.push(String(args[0])));
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (...args) { if (armed) { audit.network++; throw new Error('blocked'); } return send.apply(this, args); };
      for (const key of ['WebSocket', 'EventSource']) {
        const original = window[key];
        if (original) window[key] = new Proxy(original, { construct(target, args) {
          if (armed) { audit.network++; throw new Error('blocked'); }
          return Reflect.construct(target, args);
        } });
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.solidcraft, null, { timeout: 120000 });
    await page.waitForTimeout(8000);
    // Our screenshots never show the Donate and Discord pills: off in the app's preferences.
    await page.evaluate(() => window.solidcraft.request('ui.prefs', { show_donate_button: false, show_discord_button: false }));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__arm());
    let faked = false;
    const pause = ms => (faked ? page.clock.runFor(ms) : page.waitForTimeout(ms));
    const call = async (method, params) => {
      const reply = await page.evaluate(([m, p]) => window.solidcraft.request(m, p).then(r => ({ ok: r }), e => ({ error: String(e) })), [method, params]);
      if (reply.error) throw new Error(`${method}: ${reply.error}`);
      return reply.ok;
    };
    const run = (command, params) => call('engine.execute', { command, params });
    const shown = handle => page.evaluate(h => window.solidcraft.request('ui.at', { handle: h }).then(p => p != null, () => false), handle);
    const waitFor = async (handle, tries = 20) => {
      for (let i = 0; i < tries; i++) { if (await shown(handle)) return true; await pause(500); }
      return false;
    };
    const click = async handle => {
      const point = await call('ui.at', { handle });
      const [x, y] = Array.isArray(point) ? point : JSON.parse(point);
      await call('ui.move', { x, y });
      await pause(300);
      await call('ui.click', { x, y });
      await pause(700);
    };
    const bodies = async () => {
      const design = await call('document.inspect', {});
      return ((typeof design === 'string' ? JSON.parse(design) : design).bodies || []).map(b => b.name);
    };
    const shot = async name => { await page.screenshot({ path: resolve(directory, `helper-${locale}-${name}.png`) }); steps.push(name); };
    const step = async (name, f) => { try { await f(); } catch (error) { steps.push(`${name} FAILED: ${error.message}`); } };

    await call('ui.click', { x: 800, y: 720 });
    await pause(1500);
    await run('file.new', { name: de ? 'Halterung' : 'Bracket' });
    await run('solid.sphere', { body_name: 'Ball', radius: 10, center: [0, 0, 10] });
    await call('ui.key', { key: 'Escape' });
    await page.clock.install();
    faked = true;
    const advance = async (until, seconds) => {
      for (let s = 0; s < seconds; s++) {
        await page.clock.fastForward(1000);
        if (s % 10 === 9 && await shown(until)) return true;
      }
      return shown(until);
    };
    await step('hello', async () => {
      assert(await advance('sc3000_helper:more', 80), 'Cumulo came within 80 s of use');
      await shot('1-hello');
      await click('sc3000_helper:more');
      await shot('2-tell-me-more');
      await click('sc3000_helper:not_now');
      assert(!(await shown('sc3000_helper:more')), 'Not now sent Cumulo away');
    });
    await step('a tip about the extrude', async () => {
      await run('sketch.create', { plane: 'XY', name: 'Base' });
      await run('sketch.rectangle.two_point', { p0: [30, 0], p1: [60, 20] });
      await run('sketch.finish', {});
      await run('solid.extrude', { profile: { sketch: 'Base', index: 0 }, distance: 15, body_name: 'Plate' });
      await call('ui.key', { key: 'Escape' });
      if (await shown('sc3000_credits:note:ok')) await click('sc3000_credits:note:ok');
      assert(await advance('sc3000_helper:not_now', 150), 'Cumulo came back after Not now');
      await shot('3-extrude-tip');
      await click('sc3000_helper:break');
    });
    await step('every level of the update', async () => {
      for (let level = 1; level <= 5; level++) {
        assert(await advance('sc3000_updates:later', 320), `update notice ${level} came`);
        await shot(`4-update-level-${level}`);
        await click('sc3000_updates:later');
        assert(!(await shown('sc3000_updates:later')), `Later closed level ${level}`);
      }
    });
    await step('update now', async () => {
      assert(await advance('sc3000_updates:now', 320), 'the update notice came again');
      await click('sc3000_updates:now');
      await pause(1500);
      await shot('5-installing');
      assert(await advance('sc3000_updates:close', 10), 'the update installed');
      await shot('6-installed');
      await click('sc3000_updates:close');
    });
    await step('design intact', async () => {
      const names = await bodies();
      assert(names.includes('Ball') && names.includes('Plate'), `the design still has its bodies: ${JSON.stringify(names)}`);
      steps.push('design intact');
    });
    const audit = await page.evaluate(() => ({ ...window.__helperAudit }));
    const result = { locale, steps, network: audit.network, opened: audit.opened, errors };
    writeFileSync(resolve(directory, `helper-${locale}.json`), JSON.stringify(result, null, 2));
    assert.equal(audit.network, 0, 'Cumulo or the updates called a network API');
    assert.deepEqual(audit.opened, [], 'Cumulo or the updates opened a page');
    assert.deepEqual(steps.filter(s => s.includes('FAILED')), [], `${locale}: every step works (helper-${locale}.json)`);
    assert.deepEqual(errors, [], `${locale}: browser errors`);
    return result;
  } finally {
    await browser.close();
  }
}

results.push(await session('en-US'));
results.push(await session('de-DE'));
console.log(JSON.stringify(results, null, 2));
