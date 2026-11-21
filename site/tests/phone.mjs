// Browser proof against a CI-built web app: npm ci && npx playwright install chromium
// npm run phone -- http://127.0.0.1:8765/ /absolute/path/to/evidence
// Serve the downloaded github-pages artifact with any static HTTP server; never compile here.
import { chromium } from '@playwright/test';
import { createWorker } from 'tesseract.js';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const [url, directory] = process.argv.slice(2);
assert(url && directory, 'Pass the CI-built app URL and evidence directory');
mkdirSync(directory, { recursive: true });
const cachePath = resolve(tmpdir(), 'sc3000-tesseract');
mkdirSync(cachePath, { recursive: true });
const worker = await createWorker('eng', 1, { cachePath });
let browser;
const results = [];

async function session(theme, small = false, privateMode = false) {
  const name = `${theme}${privateMode ? '-private' : ''}${small ? '-small' : ''}`;
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: small ? { width: 480, height: 640 } : { width: 1280, height: 720 } });
  await context.addInitScript(({ theme }) => {
    // Test setup precedes the privacy guard. Keep unrelated random outage theatre deterministic.
    localStorage.setItem('solidcraft.prefs', JSON.stringify({ dark: theme === 'dark', preferences: { theme } }));
    Math.random = () => 0.5;
    const audit = { armed: false, network: 0, storage: 0, logs: 0, inputWrites: 0, storageEvents: [] };
    window.__phoneAudit = audit;
    window.__phoneTimeOffset = 0;
    const now = performance.now.bind(performance);
    performance.now = () => now() + window.__phoneTimeOffset;
    const wrap = (object, key, kind) => {
      if (!object || typeof object[key] !== 'function') return;
      const original = object[key];
      object[key] = function (...args) {
        if (audit.armed) {
          audit[kind]++;
          if (kind === 'storage') {
            audit.storageEvents.push({ api: `${object.constructor?.name}.${key}`, key: key === 'setItem' ? String(args[0]).replace(/2025550149|739162/g, '[input]') : undefined });
            const written = JSON.stringify(args, (_key, value) => ArrayBuffer.isView(value) ? new TextDecoder().decode(value) : value instanceof ArrayBuffer ? new TextDecoder().decode(value) : value);
            if (/2025550149|739162/.test(written)) audit.inputWrites++;
          }
          if (kind === 'network') throw new Error('Network blocked by phone privacy test');
        }
        return Reflect.apply(original, this, args);
      };
    };
    for (const key of ['setItem', 'removeItem', 'clear']) wrap(Storage.prototype, key, 'storage');
    for (const key of ['put', 'add', 'delete', 'clear']) wrap(IDBObjectStore.prototype, key, 'storage');
    wrap(IDBFactory.prototype, 'deleteDatabase', 'storage');
    for (const key of ['createObjectStore', 'deleteObjectStore']) wrap(IDBDatabase.prototype, key, 'storage');
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cookie?.set) Object.defineProperty(Document.prototype, 'cookie', { ...cookie, set(value) {
      if (audit.armed) {
        audit.storage++; audit.storageEvents.push({ api: 'Document.cookie' });
        if (/2025550149|739162/.test(value)) audit.inputWrites++;
      }
      return Reflect.apply(cookie.set, this, [value]);
    } });
    if (window.FileSystemWritableFileStream) for (const key of ['write', 'truncate']) wrap(FileSystemWritableFileStream.prototype, key, 'storage');
    if (window.CacheStorage) wrap(CacheStorage.prototype, 'delete', 'storage');
    if (window.Cache) for (const key of ['put', 'add', 'addAll', 'delete']) wrap(Cache.prototype, key, 'storage');
    wrap(window, 'fetch', 'network');
    wrap(XMLHttpRequest.prototype, 'send', 'network');
    wrap(navigator, 'sendBeacon', 'network');
    for (const key of ['WebSocket', 'EventSource']) {
      const original = window[key];
      if (original) window[key] = new Proxy(original, { construct(target, args) {
        if (audit.armed) { audit.network++; throw new Error('Network blocked by phone privacy test'); }
        return Reflect.construct(target, args);
      } });
    }
    for (const key of ['log', 'info', 'warn', 'error', 'debug']) wrap(console, key, 'logs');
  }, { theme });
  let armed = false, requests = 0;
  // Also block browser-managed requests (images, forms, navigation), beyond API probes.
  await context.route('**/*', route => armed ? route.abort('blockedbyclient') : route.continue());
  context.on('request', () => { if (armed) requests++; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const shot = async label => {
    const path = resolve(directory, `${name}-${label}.png`);
    const bytes = await page.screenshot({ path });
    const original = PNG.sync.read(bytes);
    const recognise = async (image, scale = 1, offsetX = 0, offsetY = 0) => {
      const enlarged = new PNG({ width: image.width * scale, height: image.height * scale });
      for (let y = 0; y < enlarged.height; y++) for (let x = 0; x < enlarged.width; x++) {
        const from = ((Math.floor(y / scale) * image.width) + Math.floor(x / scale)) * 4;
        image.data.copy(enlarged.data, (y * enlarged.width + x) * 4, from, from + 4);
      }
      const { data } = await worker.recognize(PNG.sync.write(enlarged), {}, { tsv: true });
      const lines = new Map();
      const words = [];
      for (const row of data.tsv.split('\n').slice(1)) {
        const c = row.split('\t');
        if (c[0] !== '5' || !c[11]?.trim()) continue;
        const id = c.slice(1, 5).join(':');
        const [rawX, rawY, width, height] = c.slice(6, 10).map(value => Number(value) / scale);
        const x = rawX + offsetX, y = rawY + offsetY;
        words.push({ text: c[11], x, y, width, height });
        const line = lines.get(id) ?? { text: '', x, y, right: x, bottom: y };
        line.text += `${c[11]} `; line.x = Math.min(line.x, x); line.y = Math.min(line.y, y);
        line.right = Math.max(line.right, x + width); line.bottom = Math.max(line.bottom, y + height); lines.set(id, line);
      }
      return { text: data.text.replace(/\s+/g, ' '), lines: [...lines.values()], words, path };
    };
    const full = await recognise(original);
    const title = /Verify your phone number/i.test(full.text) ? full.words.find(word => /^Verify$/i.test(word.text)) : undefined;
    if (!title) return full;
    // Modal windows are centred. Isolate the detected modal for OCR so background text
    // cannot merge into its heading, then enlarge its small footer only for recognition.
    const left = Math.max(0, Math.floor(title.x - 16));
    const top = Math.max(0, Math.floor(title.y - 16));
    const cropped = new PNG({ width: original.width - left * 2, height: original.height - top * 2 });
    PNG.bitblt(original, cropped, left, top, cropped.width, cropped.height, 0, 0);
    return recognise(cropped, 3, left, top);
  };
  const find = (capture, expression) => {
    const line = capture.lines.find(line => expression.test(line.text));
    assert(line, `Missing ${expression} in ${capture.path}:\n${capture.text}`);
    return line;
  };
  const click = async (capture, expression, field = false) => {
    const line = find(capture, expression);
    await page.mouse.click(field ? Math.min(line.right + 90, page.viewportSize().width - 45) : (line.x + line.right) / 2, (line.y + line.bottom) / 2);
    await page.waitForTimeout(250);
  };
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}sample&webgl${privateMode ? '&embed=editor' : ''}`);
  let capture;
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(3000);
    capture = await shot('loading');
    if (/Continue to CAD/.test(capture.text)) break;
  }
  await click(capture, /Continue to CAD/);
  await page.waitForTimeout(3500);
  capture = await shot('number');
  assert.match(capture.text, /Verify your phone number to keep designing/i);
  assert.match(capture.text, /SolidCraft 3000 is a parody\. [NM]othing you type here is sent or stored/i);
  if (small) {
    assert.match(capture.text, /surprise calls from our Customer Success Team/i);
    assert.match(capture.text, /Weekly Fillet Digest/i);
    await context.close(); await browser.close(); return { name, smallWindowFits: true };
  }

  await page.evaluate(() => { Object.assign(window.__phoneAudit, { armed: true, network: 0, storage: 0, logs: 0 }); });
  armed = true;
  await click(capture, /^Phone number/, true);
  await page.keyboard.insertText('2025550149');
  await click(capture, /Send code/);
  capture = await shot('code');
  assert.match(capture.text, /Enter the 6-digit code we texted you/i);
  assert.match(capture.text, /[NM]o text was sent.*Any [6&] digits work/i);
  if (theme === 'dark') {
    await click(capture, /^6-digit code/, true);
    await page.keyboard.insertText('739162');
    // The highlighted button can be omitted by OCR; its row follows the recognised hint.
    const hint = find(capture, /[NM]o text was sent/);
    await page.mouse.click(hint.x + 22, hint.bottom + 18);
    await page.waitForTimeout(250);
    capture = await shot('verified');
    assert.match(capture.text, /Phone verified/i);
    assert.match(capture.text, /Expect a call between 2\s*AM and 4\s*AM/i);
  } else {
    await click(capture, /Skip for now/);
    capture = await shot('skipped');
    assert.doesNotMatch(capture.text, /Verify your phone number to keep designing/i);
  }
  const audit = await page.evaluate(() => ({ ...window.__phoneAudit }));
  writeFileSync(resolve(directory, `${name}-audit.json`), JSON.stringify({ audit, requests }, null, 2));
  assert.equal(audit.network, 0, 'Phone flow invoked a network API');
  assert.equal(requests, 0, 'Phone flow generated a browser network request');
  if (privateMode) assert.equal(audit.storage, 0, 'Nonpersistent phone flow wrote browser storage');
  else assert(audit.storageEvents.every(event => event.api === 'Storage.setItem' && ['egui_memory_ron', 'solidcraft.prefs'].includes(event.key)), 'Unexpected normal-app storage write');
  assert.equal(audit.inputWrites, 0, 'A storage write contained phone input');
  assert.equal(audit.logs, 0, 'Phone flow logged output');
  assert.deepEqual(errors, [], 'Browser errors');
  armed = false;
  await page.evaluate(() => { window.__phoneAudit.armed = false; window.__phoneTimeOffset += 181000; });
  await page.waitForTimeout(1000);
  capture = await shot('after-three-minutes');
  if (theme === 'dark') assert.doesNotMatch(capture.text, /Verify your phone number to keep designing/i);
  else assert.match(capture.text, /Verify your phone number to keep designing/i);
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert(!stored.includes('2025550149') && !stored.includes('739162'), 'Input persisted in Web Storage');
  await context.close();
  await browser.close();
  return { name, action: theme === 'dark' ? 'verified-any-six-digits-once' : 'skipped-and-returned-after-three-minutes', audit, requests };
}
try {
  results.push(await session('dark'));
  results.push(await session('light'));
  results.push(await session('dark', false, true));
  results.push(await session('dark', true));
  writeFileSync(resolve(directory, 'audit.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, results }));
} finally { if (browser?.isConnected()) await browser.close(); await worker.terminate(); }
