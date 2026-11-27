// SolidCraft 3000's SolidCredits in the browser (EN and DE): priced features still run, the note and the Top up
// page show, the Appearance Pack swatches carry their PRO tag, nothing leaves the page, and Save is never blocked.
// npm run credits -- http://127.0.0.1:8765/ /absolute/path/to/evidence
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
      window.__creditsAudit = audit;
      const block = (object, key, record) => {
        if (!object || typeof object[key] !== 'function') return;
        object[key] = function (...args) { record(args); throw new Error('Blocked by the SolidCredits check'); };
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
    const pause = ms => page.waitForTimeout(ms);
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
    const shot = async name => { await page.screenshot({ path: resolve(directory, `credits-${locale}-${name}.png`) }); steps.push(name); };
    const step = async (name, f) => { try { await f(); } catch (error) { steps.push(`${name} FAILED: ${error.message}`); } };

    await call('ui.click', { x: 800, y: 720 });
    await pause(1500);
    await step('extrude', async () => {
      await run('file.new', { name: de ? 'Halterung' : 'Bracket' });
      await run('sketch.create', { plane: 'XY', name: 'Base' });
      await run('sketch.rectangle.two_point', { p0: [0, 0], p1: [40, 20] });
      await run('sketch.finish', {});
      await run('solid.extrude', { profile: { sketch: 'Base', index: 0 }, distance: 124, body_name: 'Plate' });
      await call('ui.key', { key: 'Escape' });
      assert((await bodies()).includes('Plate'), 'the extrude made its body');
      assert(await waitFor('sc3000_credits:note:ok'), 'the extrude note showed');
      await call('ui.camera', { fit: true }).catch(() => {});
      await pause(800);
      await shot('1-extrude');
      await click('sc3000_credits:note:ok');
    });
    await step('pattern', async () => {
      await run('solid.pattern.rectangular', { bodies: ['Plate'], dir1: [1, 0, 0], count1: 3, spacing1: 60, dir2: [0, 1, 0], count2: 2, spacing2: 40 });
      assert(await waitFor('sc3000_credits:note:ok'), 'the pattern note showed');
      await call('ui.camera', { fit: true }).catch(() => {});
      await pause(800);
      await shot('2-pattern');
    });
    await step('top up', async () => {
      await click('sc3000_credits:note:top_up');
      assert(await waitFor('sc3000_credits:top_up:close'), 'the Top up page opened');
      await shot('3-top-up');
      await click('sc3000_credits:top_up:close');
    });
    await step('appearance pack', async () => {
      await call('ui.start', { command: 'appearance.assign' });
      assert(await waitFor('appearance:search'), 'the appearance dialog opened');
      await click('appearance:search');
      await call('ui.text', { text: de ? 'Brass' : 'Brass' });
      await pause(800);
      assert(await waitFor('sc3000_credits:pack:Brass - Polished'), 'the Brass swatch has its PRO tag');
      await shot('4-appearance-pack');
      await call('ui.key', { key: 'Escape' });
      await pause(500);
      await run('appearance.assign', { bodies: ['Plate'], appearance: 'Brass - Polished' });
      assert(await waitFor('sc3000_credits:note:ok'), 'the Appearance Pack note showed');
      await shot('5-appearance-note');
      await click('sc3000_credits:note:ok');
    });
    await step('account balance', async () => {
      await click('sc3000_account:open');
      if (await shown('sc3000_account:id')) {
        await click('sc3000_account:id');
        await call('ui.text', { text: de ? 'max.mustermann' : 'jane.doe' });
        await click('sc3000_account:password');
        await call('ui.text', { text: 'correct horse' });
        await click('sc3000_account:submit');
        await click('sc3000_account:open');
      }
      assert(await waitFor('sc3000_credits:balance'), 'the account page shows the balance');
      await shot('6-account-balance');
      await click('sc3000_account:close');
    });
    await step('design intact', async () => {
      const names = await bodies();
      assert(names.includes('Plate'), `the design still has its Plate: ${JSON.stringify(names)}`);
      steps.push('design intact');
    });
    const audit = await page.evaluate(() => ({ ...window.__creditsAudit }));
    const result = { locale, steps, network: audit.network, opened: audit.opened, errors };
    writeFileSync(resolve(directory, `credits-${locale}.json`), JSON.stringify(result, null, 2));
    assert.equal(audit.network, 0, 'SolidCredits called a network API');
    assert.deepEqual(audit.opened, [], 'SolidCredits opened a page');
    assert.deepEqual(steps.filter(s => s.includes('FAILED')), [], `${locale}: every step works (credits-${locale}.json)`);
    assert.deepEqual(errors, [], `${locale}: browser errors`);
    return result;
  } finally {
    await browser.close();
  }
}

results.push(await session('en-US'));
results.push(await session('de-DE'));
console.log(JSON.stringify(results, null, 2));
