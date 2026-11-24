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
const v3 = win.locator('[data-testid="view-3d"]');
const before3 = await v3.screenshot();
await v3.click({ position: { x: 20, y: 20 } });
await win.keyboard.down('e'); await win.waitForTimeout(600); await win.keyboard.up('e');
await win.keyboard.down('w'); await win.waitForTimeout(300); await win.keyboard.up('w');
await win.waitForTimeout(700);
const after3 = await v3.screenshot();
check('3d-keyboard', !before3.equals(after3), `bytes ${before3.length} -> ${after3.length}`);
await shot('05b-3d-keys');
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

// I2C LCD example end-to-end in the UI
await win.click('[data-testid="ex-lcd_i2c"]');
await win.click('[data-testid="btn-run"]');
await win.waitForFunction(() => window.__aspState().snap?.parts?.LCD1?.lines?.[0] === 'Hello over I2C! ', null, { timeout: 120000 }).catch(() => undefined);
s = await state();
check('i2c-lcd-ui', s.snap?.parts?.LCD1?.lines?.[0] === 'Hello over I2C! ' && s.serial.some((l) => /0x27/.test(l)), JSON.stringify(s.snap?.parts?.LCD1?.lines));
await shot('12-i2c-lcd');
// 74HC595 over SPI
await win.click('[data-testid="ex-shift595"]');
await win.click('[data-testid="btn-run"]');
await win.waitForFunction(() => (window.__aspState().snap?.parts?.U1?.spiBytes ?? 0) >= 2, null, { timeout: 120000 }).catch(() => undefined);
s = await state();
check('spi-595-ui', (s.snap?.parts?.U1?.spiBytes ?? 0) >= 2 && s.snap?.parts?.U1?.powered, `${s.snap?.parts?.U1?.hex} after ${s.snap?.parts?.U1?.spiBytes} bytes`);
await shot('13-shift595');
await win.click('[data-testid="btn-stop"]').catch(() => undefined);

// guided course: open a lesson, run its example, pass the quiz -> progress 1/16
await win.evaluate(() => { window.__aspActions.resetLessonProgress(); window.__aspSet({ page: 'lessons' }); });
await win.waitForSelector('[data-testid="course-progress"]');
const p0 = await win.textContent('[data-testid="course-progress"]');
await shot('20-course');
await win.click('[data-testid="lesson-blink"]');
await win.waitForSelector('[data-testid="quiz"]');
await shot('21-lesson');
await win.click('[data-testid="lesson-run"]');
await win.waitForFunction(() => window.__aspState().simState === 'running', null, { timeout: 120000 }).catch(() => undefined);
await win.waitForTimeout(1500);
const ranOk = await win.evaluate(() => !!window.__aspState().lessonProgress.blink?.ran);
await win.click('[data-testid="btn-stop"]').catch(() => undefined);
await win.evaluate(() => window.__aspSet({ page: 'lessons' }));
await win.click('[data-testid="lesson-blink"]');
await win.waitForSelector('[data-testid="quiz"]');
await win.locator('[data-testid="quiz"] .qq').nth(0).locator('.opt').nth(0).click(); // wrong on purpose
await win.locator('[data-testid="quiz"] .qq').nth(1).locator('.opt').nth(1).click();
await win.locator('[data-testid="quiz"] button.btn.primary').click();
const wrongBlocked = await win.evaluate(() => !window.__aspState().lessonProgress.blink?.quiz);
await win.locator('[data-testid="quiz"] .qq').nth(0).locator('.opt').nth(1).click();
await win.locator('[data-testid="quiz"] button.btn.primary').click();
await win.waitForTimeout(300);
await shot('22-quiz');
await win.locator('.lesson-view .page-h .btn').first().click();
await win.waitForSelector('[data-testid="course-progress"]');
const p1 = await win.textContent('[data-testid="course-progress"]');
check('course-progress', /0\/16/.test(p0 ?? '') && /1\/16/.test(p1 ?? '') && ranOk && wrongBlocked, `${p0} -> ${p1} ran=${ranOk} wrongBlocked=${wrongBlocked}`);
await win.click('.seg button:nth-child(2)');
await win.waitForSelector('.uno-x');
await win.waitForTimeout(300);
await shot('23-board-explorer');
await win.click('.uno-x .seg button:nth-child(2)');
await win.waitForSelector('[data-testid="ux-A4"]');
await win.hover('[data-testid="ux-A4"]');
const ux2 = await win.textContent('[data-testid="ux-info"]').catch(() => '');
check('board-explorer', /A4/.test(ux2 ?? '') && /I2C/.test(ux2 ?? ''), (ux2 || '').slice(0, 80));
await shot('24-pinout');
await win.evaluate(() => window.__aspSet({ page: 'home' }));

// real serial monitor against a virtual serial pair (socat), when provided
if (process.env.ASP_TEST_PTY) {
  const [mine, peer] = process.env.ASP_TEST_PTY.split(',');
  await win.evaluate((p) => window.__aspActions.connectHardwareSerial(p), mine);
  await win.waitForFunction((p) => window.__aspState().serialSource === p, mine, { timeout: 10000 }).catch(() => undefined);
  const fd = fs.openSync(peer, 'r+');
  fs.writeSync(fd, 'HW:READY,TEMP:21.5\n');
  await win.waitForTimeout(800);
  await win.fill('[data-testid="serial-input"]', 'PING');
  await win.press('[data-testid="serial-input"]', 'Enter');
  await win.waitForTimeout(500);
  const buf = Buffer.alloc(64); let got = '';
  try { const n = fs.readSync(fd, buf, 0, 64, null); got = buf.subarray(0, n).toString(); } catch { /* */ }
  s = await state();
  check('hardware-serial', s.serial.some((l) => l.includes('HW:READY')) && got.includes('PING'), `rx=${s.serial.at(-2)} tx→peer=${JSON.stringify(got)}`);
  await shot('14-hardware-serial');
  await win.evaluate(() => window.__aspActions.connectHardwareSerial('sim'));
  fs.closeSync(fd);
}

fs.writeFileSync(path.join(out, 'e2e-results.json'), JSON.stringify({ passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
await app.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
