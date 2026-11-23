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
  it('blink toggles D13 every 1000 ms', async () => {
    const s = await sim('blink');
    s.run(3.2);
    const e = s.gpio.filter((g) => g.pin === 'D13');
    const d = e.slice(1).map((x, i) => x.t - e[i].t).filter((x) => x > 0.01); // first edge is pinMode() at t≈0
    expect(d.length).toBeGreaterThanOrEqual(2);
    for (const x of d) expect(Math.abs(x - 1)).toBeLessThan(0.005);
  }, 60000);
});
