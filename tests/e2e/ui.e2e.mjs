// End-to-end test of the packaged/dev Electron app with Playwright.
// Usage: xvfb-run -a node tests/e2e/ui.e2e.mjs [outDir] [exePath]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'test-results/e2e');
const exe = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

const app = await electron.launch({
  ...(exe ? { executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : { executablePath: path.resolve('node_modules/electron/dist/electron'), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '.'] }),
  env: { ...process.env, ASP_CACHE_DIR: path.join(out, 'cache') },
  timeout: 60000,
});
const win = await app.firstWindow();
win.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
win.on('pageerror', (e) => console.log('[pageerror]', e.message));
await win.setViewportSize({ width: 1600, height: 940 }).catch(() => undefined);
await win.waitForSelector('[data-testid="btn-run"]', { timeout: 30000 });
const state = () => win.evaluate(() => { const s = window.__aspState(); return { simState: s.simState, compile: s.compile && { ok: s.compile.ok, size: s.compile.size, diag: s.compile.diagnostics.length }, serial: s.serial.slice(-5).map((l) => l.text), snap: s.snap && { timeS: s.snap.timeS, cycles: s.snap.cycles, pins: s.snap.pins, parts: s.snap.parts, issues: s.snap.issues }, rt: s.rt, project: s.project.name }; });
const shot = (n) => win.screenshot({ path: path.join(out, n + '.png') });

// 1. load the demo example and run
await win.click('[data-testid="ex-demo"]');
await shot('01-home');
await win.click('[data-testid="btn-run"]');
await win.waitForFunction(() => window.__aspState().simState === 'running', null, { timeout: 120000 });
await win.waitForFunction(() => window.__aspState().snap?.timeS > 1.5, null, { timeout: 30000 });
let s = await state();
check('build-ok', s.compile?.ok, JSON.stringify(s.compile?.size));
check('running', s.simState === 'running', `t=${s.snap?.timeS.toFixed(2)} rt=${s.rt.toFixed(2)}`);
check('realtime', s.rt > 0.8, `rt=${s.rt.toFixed(2)}`);
check('serial', s.serial.some((l) => /LED:\d+,BTN:RELEASED,POT:\d+/.test(l)), s.serial.at(-1));
const led = s.snap.parts.LED1;
check('led-lit', (led?.avg?.current_anode ?? 0) > 0.004, `I=${((led?.avg?.current_anode ?? 0) * 1000).toFixed(2)}mA`);
check('pwm-d9', s.snap.pins.D9.pwmDuty > 0.6 && s.snap.pins.D9.pwmDuty < 0.8, `duty=${s.snap.pins.D9.pwmDuty}`);
await shot('02-running-breadboard');

// 2. press the button on the canvas (real pointer events)
const btn = await win.locator('[data-part="BTN1"]').boundingBox();
await win.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
await win.mouse.down();
await win.waitForTimeout(900);
s = await state();
check('button-press-tone', (s.snap.parts.BZ1?.frequency ?? 0) > 1000 && s.serial.some((l) => /BTN:PRESSED/.test(l)), `f=${s.snap.parts.BZ1?.frequency} ${s.serial.at(-1)}`);
await shot('03-button-pressed');
await win.mouse.up();
await win.waitForTimeout(600);
s = await state();
check('button-release', (s.snap.parts.BZ1?.frequency ?? 0) === 0, `f=${s.snap.parts.BZ1?.frequency}`);

// 3. turn the pot through the inspector (live prop)
await win.click('[data-part="POT1"]', { position: { x: 5, y: 5 } }).catch(() => undefined);
await win.evaluate(() => window.__aspActions.select({ kind: 'part', id: 'POT1' }));
await win.waitForSelector('[data-testid="prop-position"]');
await win.locator('[data-testid="prop-position"]').fill('0.2');
await win.waitForTimeout(800);
s = await state();
check('pot-live', s.snap.pins.D9.pwmDuty > 0.12 && s.snap.pins.D9.pwmDuty < 0.28, `duty=${s.snap.pins.D9.pwmDuty?.toFixed(3)} analog=${await win.textContent('[data-testid="status-analog"]')}`);
await shot('04-inspector');

// 4. views
await win.click('[data-testid="view-3d-btn"]');
await win.waitForSelector('[data-testid="view-3d"] canvas', { timeout: 20000 });
await win.waitForTimeout(1500);
await shot('05-3d');
const px = await win.evaluate(() => { const c = document.querySelector('[data-testid="view-3d"] canvas'); return c ? [c.width, c.height] : null; });
check('3d-render', px && px[0] > 100, JSON.stringify(px));
await win.click('[data-testid="view-sch-btn"]');
await win.waitForSelector('[data-testid="schematic"]');
await shot('06-schematic');
check('schematic', await win.locator('[data-testid="schematic"] text', { hasText: 'D9' }).count() > 0);
await win.click('[data-testid="tab-timeline"]');
await win.waitForTimeout(1200);
await shot('07-timeline');
check('timeline', await win.locator('[data-testid="timeline"] .meas tbody tr').count() >= 1);
await win.click('[data-testid="tab-sim"]');
await win.click('[data-testid="view-bb-btn"]');

// 5. stop, then a compile error shows diagnostics
await win.click('[data-testid="btn-stop"]');
await win.evaluate(() => window.__aspActions.setCode('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n'));
await win.click('[data-testid="btn-run"]');
await win.waitForSelector('[data-testid="diagnostics"]', { timeout: 60000 });
const diag = await win.textContent('[data-testid="diagnostics"]');
check('diagnostics', /2:\d+/.test(diag ?? ''), (diag ?? '').slice(0, 120));
await shot('08-compile-error');

// 6. other examples: LCD + servo
for (const ex of ['lcd', 'servo', 'dht11']) {
  await win.click(`[data-testid="ex-${ex}"]`);
  await win.click('[data-testid="btn-run"]');
  await win.waitForFunction(() => window.__aspState().snap?.timeS > 2.2, null, { timeout: 120000 });
  s = await state();
  const parts = s.snap.parts;
  if (ex === 'lcd') check('lcd-text', (parts.LCD1?.lines?.[0] ?? '').includes('Arduino'), JSON.stringify(parts.LCD1?.lines));
  if (ex === 'servo') check('servo-angle', parts.SV1?.active === true && parts.SV1.angle >= 0, `angle=${parts.SV1?.angle}`);
  if (ex === 'dht11') check('dht-serial', s.serial.some((l) => /\d/.test(l) && /(C|%)/.test(l)), s.serial.at(-1));
  await shot('09-' + ex);
  await win.click('[data-testid="btn-stop"]');
}

// 7. pages
for (const p of ['lessons', 'parts', 'instruments', 'projects', 'settings', 'tools']) {
  await win.click(`[data-testid="nav-${p}"]`);
  await win.waitForTimeout(500);
  await shot('10-page-' + p);
}
await win.waitForSelector('[data-testid="preflight"] tr', { timeout: 15000 });
const pfText = await win.textContent('[data-testid="preflight"]');
check('preflight-avr-gcc', /avr-gcc/.test(pfText ?? ''));
// light theme + english
await win.evaluate(() => window.__aspSet({ theme: 'light', lang: 'en', page: 'home' }));
await win.click('[data-testid="ex-blink"]');
await win.waitForTimeout(800);
await shot('11-light-en');
await win.evaluate(() => window.__aspSet({ theme: 'dark', lang: 'ar' }));

fs.writeFileSync(path.join(out, 'e2e-results.json'), JSON.stringify({ passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
await app.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
