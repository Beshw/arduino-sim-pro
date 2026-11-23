import { describe, it, expect } from 'vitest';
import { Circuit, DIODE_MODELS } from '../src/shared/circuit/mna';

describe('MNA solver', () => {
  it('solves a voltage divider', () => {
    const c = new Circuit(3);
    c.add({ kind: 'V', name: 'V1', p: 1, n: 0, v: 5 });
    c.add({ kind: 'R', name: 'R1', a: 1, b: 2, r: 1000 });
    c.add({ kind: 'R', name: 'R2', a: 2, b: 0, r: 1000 });
    const r = c.solve();
    expect(r.ok).toBe(true);
    expect(r.v[2]).toBeCloseTo(2.5, 6);
    expect(r.current.get('R1')!).toBeCloseTo(2.5e-3, 8);
  });
  it('red LED with 220 ohm from 5V draws ~13.6 mA', () => {
    const c = new Circuit(3);
    c.add({ kind: 'V', name: 'V1', p: 1, n: 0, v: 5 });
    c.add({ kind: 'R', name: 'R1', a: 1, b: 2, r: 220 });
    c.addDiode('D1', 2, 0, DIODE_MODELS.red);
    const r = c.solve();
    expect(r.ok).toBe(true);
    const i = r.current.get('R1')!;
    expect(i).toBeGreaterThan(0.0125); expect(i).toBeLessThan(0.0145);
  });
  for (const color of ['red', 'yellow', 'green', 'blue', 'white']) {
    it(`${color} LED model Vf at 20mA close to datasheet`, () => {
      const m = DIODE_MODELS[color];
      const c = new Circuit(2);
      c.add({ kind: 'I', name: 'I1', p: 0, n: 1, i: 0.02 });
      c.addDiode('D1', 1, 0, m);
      const r = c.solve();
      expect(r.ok).toBe(true);
      expect(Math.abs(r.v[1] - m.vf20)).toBeLessThan(0.08);
    });
  }
  it('RC charging matches analytic solution', () => {
    const c = new Circuit(3);
    c.add({ kind: 'V', name: 'V1', p: 1, n: 0, v: 5 });
    c.add({ kind: 'R', name: 'R1', a: 1, b: 2, r: 1000 });
    c.add({ kind: 'C', name: 'C1', a: 2, b: 0, c: 1e-6, v0: 0 });
    c.resetState();
    const dt = 1e-6; let t = 0; let v = 0;
    while (t < 1e-3 - 1e-12) { const r = c.solve(dt); t += dt; v = r.v[2]; }
    expect(v).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
  });
  it('NPN switch saturates with base drive', () => {
    const c = new Circuit(5);
    c.add({ kind: 'V', name: 'VCC', p: 1, n: 0, v: 5 });
    c.add({ kind: 'R', name: 'RC', a: 1, b: 2, r: 100 }); // collector load
    c.add({ kind: 'V', name: 'VB', p: 3, n: 0, v: 5 });
    c.add({ kind: 'R', name: 'RB', a: 3, b: 4, r: 1000 });
    c.add({ kind: 'Q', name: 'Q1', c: 2, b: 4, e: 0, is: 1e-14, bf: 200, br: 3 });
    const r = c.solve();
    expect(r.ok).toBe(true);
    expect(r.v[4]).toBeGreaterThan(0.6); expect(r.v[4]).toBeLessThan(0.85);
    expect(r.v[2]).toBeLessThan(0.3);
    expect(r.current.get('Q1')!).toBeGreaterThan(0.045);
  });
  it('inductor current ramps L di/dt = V', () => {
    const c = new Circuit(3);
    c.add({ kind: 'V', name: 'V1', p: 1, n: 0, v: 1 });
    c.add({ kind: 'R', name: 'R1', a: 1, b: 2, r: 1e-3 });
    c.add({ kind: 'L', name: 'L1', a: 2, b: 0, l: 1e-3, i0: 0 });
    c.resetState();
    let r; for (let k = 0; k < 100; k++) r = c.solve(1e-6);
    expect(r!.branch.get('L1')!).toBeCloseTo(0.1, 2);
  });
});
