// The SolidCraft 3000 Cloud Account in the browser (EN and DE): it works, nothing leaves the page, the design
// is never touched, and every step fails the run if it fails.
// npm run account -- http://127.0.0.1:8765/ /absolute/path/to/evidence [--quick]
// --quick (every build): sign in, the back-up note, privacy and the design. The timed pages (the sign-out, the
// wrong password and reset after it, the recovery report) are covered by the app's unit tests; without --quick
// (inspect runs) they are reached here too, for review screenshots.
// Drives the app through its control API. The sign-out (10-20 min of use) and the recovery report (30 min
// unsaved) are reached with Playwright's fake clock: each fastForward(1000) is one frame and one second of use.
// Every network API is blocked and counted, as in support.mjs; nothing may leave the page.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const [url, directory, ...flags] = process.argv.slice(2);
const quick = flags.includes('--quick');
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
      window.__accountAudit = audit;
      const block = (object, key, record) => {
        if (!object || typeof object[key] !== 'function') return;
        object[key] = function (...args) { record(args); throw new Error('Blocked by the Cloud Account check'); };
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
    // Our screenshots never show the Donate and Discord pills (Ray, 2026-11-25): off in the app's preferences.
    await page.evaluate(() => window.solidcraft.request('ui.prefs', { show_donate_button: false, show_discord_button: false }));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__arm());
    // Once page.clock is installed, the page draws frames only as its clock moves: waits run the fake clock.
    let faked = false;
    const pause = ms => (faked ? page.clock.runFor(ms) : page.waitForTimeout(ms));
    const call = async (method, params) => {
      const reply = await page.evaluate(([m, p]) => window.solidcraft.request(m, p).then(r => ({ ok: r }), e => ({ error: String(e) })), [method, params]);
      if (reply.error) throw new Error(`${method}: ${reply.error}`);
      return reply.ok;
    };
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
    const type = async (handle, text) => { await click(handle); await call('ui.text', { text }); await pause(400); };
    // A synthetic click on the fake clock is now and then not taken by the page: click again until
    // what it opens shows, up to three times (a person would click again too).
    const opens = async (handle, expected) => {
      for (let i = 0; i < 3; i++) {
        if (await shown(handle)) await click(handle);
        if (await waitFor(expected)) return true;
      }
      // For the evidence: what was on screen when the page did not open.
      const handles = await call('ui.handles', { prefix: '' }).catch(error => String(error));
      writeFileSync(resolve(directory, `account-${locale}-missed-${expected.replace(/[^a-z_]/gi, '-')}.json`), JSON.stringify({ clicked: handle, expected, handles }, null, 2));
      await page.screenshot({ path: resolve(directory, `account-${locale}-missed-${expected.replace(/[^a-z_]/gi, '-')}.png`) }).catch(() => {});
      return false;
    };
    const shot = async name => { await page.screenshot({ path: resolve(directory, `account-${locale}-${name}.png`) }); steps.push(name); };
    const step = async (name, f) => { try { await f(); } catch (error) { steps.push(`${name} FAILED: ${error.message}`); } };

    await call('ui.click', { x: 800, y: 720 });
    await page.waitForTimeout(1500);
    await step('sign in', async () => {
      assert(await opens('sc3000_account:open', 'sc3000_account:id'), 'the sign-in page opened');
      await type('sc3000_account:id', de ? 'max.mustermann' : 'jane.doe');
      await type('sc3000_account:password', 'correct horse');
      await shot('1-sign-in');
      await click('sc3000_account:submit');
      await page.waitForTimeout(1000);
      await shot('2-signed-in');
      if (await shown('sc3000_account:close')) await click('sc3000_account:close');
    });
    await step('back-up note', async () => {
      await call('engine.execute', { command: 'file.new', params: { name: de ? 'Halterung' : 'Bracket' } });
      await call('engine.execute', { command: 'solid.sphere', params: { body_name: 'Ball', radius: 10, center: [0, 0, 10] } });
      await call('ui.key', { key: 'Escape' });
      assert(await waitFor('sc3000_account:nag:save', 50), 'the back-up note appeared within 25 s');
      await shot('3-backup-note');
      await click('sc3000_account:nag:dismiss');
    });
    await step('design intact', async () => {
      const design = await call('document.inspect', {});
      const bodies = (typeof design === 'string' ? JSON.parse(design) : design).bodies || [];
      assert(bodies.some(b => b.name === 'Ball'), `the design still has its Ball: ${JSON.stringify(bodies)}`);
      steps.push('design intact');
    });
    if (!quick) {
      // From here on, time is faked: one fastForward(1000) is one frame and one second of use.
      await page.clock.install();
      faked = true;
      const advance = async (until, seconds) => {
        for (let s = 0; s < seconds; s++) {
          await page.clock.fastForward(1000);
          if (s % 30 === 29 && await shown(until)) return true;
          if (await shown('sc3000_account:nag:dismiss')) await call('ui.key', { key: 'Escape' }).catch(() => {});
        }
        return shown(until);
      };
      await step('session expired', async () => {
        assert(await advance('sc3000_account:expired:sign_in', 1300), 'the session expired within 21 min of use');
        await shot('4-session-expired');
        assert(await opens('sc3000_account:expired:sign_in', 'sc3000_account:password'), 'the sign-in page opened again');
        await type('sc3000_account:password', 'correct horse');
        await click('sc3000_account:submit');
        await pause(1000);
        await shot('5-incorrect-password');
      });
      await step('reset', async () => {
        assert(await opens('sc3000_account:reset', 'sc3000_account:new_password'), 'the reset page opened');
        const tries = ['correct horse', 'fillet', 'fillet 3000', 'fillet3000', 'fillet 3000 surely now', 'filet3000!!!!!!!!!!', 'please', 'anything'];
        for (let i = 0; i < tries.length; i++) {
          if (!(await shown('sc3000_account:new_password'))) break;
          await type('sc3000_account:new_password', tries[i]);
          await click('sc3000_account:change');
          await shot(`6-reset-${i + 1}`);
        }
        if (await shown('sc3000_account:close')) await click('sc3000_account:close');
        if (await shown('sc3000_account:cancel')) await click('sc3000_account:cancel');
      });
      await step('recovery', async () => {
        assert(await advance('sc3000_account:recovery:close', 1900), 'the recovery report came within 31 min unsaved');
        await shot('7-recovery');
        await click('sc3000_account:recovery:close');
        const design = await call('document.inspect', {});
        steps.push(`design after recovery: ${JSON.stringify(design).slice(0, 200)}`);
      });
    }
    const audit = await page.evaluate(() => ({ ...window.__accountAudit }));
    const result = { locale, steps, network: audit.network, opened: audit.opened, errors };
    writeFileSync(resolve(directory, `account-${locale}.json`), JSON.stringify(result, null, 2));
    assert.equal(audit.network, 0, 'the Cloud Account called a network API');
    assert.deepEqual(audit.opened, [], 'the Cloud Account opened a page');
    assert.deepEqual(steps.filter(s => s.includes('FAILED')), [], `${locale}: every step works (account-${locale}.json)`);
    assert.deepEqual(errors, [], `${locale}: browser errors`);
    return result;
  } finally {
    await browser.close();
  }
}

results.push(await session('en-US'));
results.push(await session('de-DE'));
console.log(JSON.stringify(results, null, 2));
