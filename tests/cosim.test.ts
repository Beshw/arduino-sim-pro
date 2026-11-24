import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { setResourcesRoot } from '../src/main/services/toolchain';
import { compileSketch } from '../src/main/services/compiler';
import { parseIntelHex } from '../src/shared/hex';
import { CoSimulation } from '../src/shared/cosim';
import { EXAMPLES } from '../src/shared/examples';

beforeAll(() => setResourcesRoot(path.resolve(__dirname, '..', 'build-resources', process.platform === 'win32' ? 'win' : 'linux')));

async function sim(id: string) {
  const p = EXAMPLES.find((e) => e.id === id)!.project();
  const c = await compileSketch(p.code);
  expect(c.ok, c.log).toBe(true);
  return new CoSimulation(p, parseIntelHex(c.hex!).image);
}

describe('co-simulation (real firmware + circuit)', () => {
  it('PWM duty measured on D9 follows the potentiometer through the ADC', async () => {
    const s = await sim('demo');
    for (const pos of [0.2, 0.72]) {
      s.setProp('POT1', 'position', pos);
      s.run(0.4); s.snapshot(); s.run(0.05);
      const snap = s.snapshot();
      const adc = Math.round((snap.pins.A0.voltage / 5) * 1023);
      expect(Math.abs(snap.pins.D9.pwmDuty! - Math.round((adc * 255) / 1023) / 255)).toBeLessThan(0.015);
    }
  }, 60000);
  it('button press produces a tone on the buzzer and serial reports it', async () => {
    const s = await sim('demo');
    s.run(0.3); s.setProp('BTN1', 'pressed', 1); s.run(0.4);
    const snap = s.snapshot();
    expect(Number(snap.parts.BZ1.frequency)).toBeGreaterThan(1000);
    expect(s.serialOutput).toMatch(/BTN:PRESSED/);
  }, 60000);
  it('I2C LCD: TWI bus scan finds 0x27 and the PCF8574 backpack drives the HD44780', async () => {
    const s = await sim('lcd_i2c');
    s.run(1.5);
    expect(s.serialOutput).toMatch(/I2C device at 0x27/);
    expect((s.serialOutput.match(/I2C device at/g) ?? []).length).toBe(1);
    const o: any = s.snapshot().parts.LCD1;
    expect(o.connected).toBe(true);
    expect(o.lines[0]).toBe('Hello over I2C! ');
    expect(o.lines[1]).toMatch(/^Count: 1/);
    expect(o.backlight).toBeGreaterThan(0);
  }, 60000);
  it('I2C LCD with SDA not wired to A4 does not answer', async () => {
    const ex = EXAMPLES.find((e) => e.id === 'lcd_i2c')!;
    const p = ex.project();
    p.wires = p.wires.filter((w) => !(w.from === 'uno.A4' || w.to === 'uno.A4'));
    const c = await compileSketch(p.code);
    const s = new CoSimulation(p, parseIntelHex(c.hex!).image);
    s.run(1.0);
    expect(s.serialOutput).not.toMatch(/I2C device at/);
    const o: any = s.snapshot().parts.LCD1;
    expect(o.connected).toBe(false);
    expect(o.displayOn).toBe(false);
  }, 60000);
  it('74HC595: hardware SPI byte is shifted, latched and lights the 7-segment', async () => {
    const s = await sim('shift595');
    s.run(1.15); s.snapshot(); s.run(0.05); // digit 2 is showing (0, 1, 2 at 0/0.5/1.0 s); avg covers the last 50 ms
    const snap: any = s.snapshot();
    expect(snap.parts.U1.latch).toBe(0b1011011);
    expect(snap.parts.U1.spiWired).toBe(true);
    const lit = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((g) => Number(snap.parts.SEG1?.avg?.['current_' + g] ?? snap.parts.SEG1?.['current_' + g] ?? 0) > 0.002);
    expect(lit.sort().join('')).toBe('ABDEG');
  }, 60000);
  it('74HC595 driven by shiftOut() bit-banging through the circuit', async () => {
    const p = EXAMPLES.find((e) => e.id === 'shift595')!.project();
    p.code = `void setup() { pinMode(10, OUTPUT); pinMode(11, OUTPUT); pinMode(13, OUTPUT);
  digitalWrite(10, LOW); shiftOut(11, 13, MSBFIRST, 0b1100110); digitalWrite(10, HIGH); }
void loop() {}`;
    const c = await compileSketch(p.code);
    expect(c.ok, c.log).toBe(true);
    const s = new CoSimulation(p, parseIntelHex(c.hex!).image);
    s.run(0.2);
    const snap: any = s.snapshot();
    expect(snap.parts.U1.latch).toBe(0b1100110);
    expect(snap.pins.D13).toBeDefined();
    expect(snap.nets).toBeDefined();
  }, 60000);
  it('blink toggles D13 every 1000 ms', async () => {
    const s = await sim('blink');
    s.run(3.2);
    const e = s.gpio.filter((g) => g.pin === 'D13');
    const d = e.slice(1).map((x, i) => x.t - e[i].t).filter((x) => x > 0.01); // first edge is pinMode() at t≈0
    expect(d.length).toBeGreaterThanOrEqual(2);
    for (const x of d) expect(Math.abs(x - 1)).toBeLessThan(0.005);
  }, 60000);
});
