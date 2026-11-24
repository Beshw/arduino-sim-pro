/**
 * Electrical models: turn a validated project + netlist into an MNA Circuit.
 * Each part gets a runtime object that can update live inputs (button, pot,
 * sensors) and report measured outputs after a solve.
 */
import { Circuit, DIODE_MODELS, ElN, ElR, ElV, SolveResult } from './mna';
import { buildNetlist, Netlist } from './netlist';
import { PART_MAP, UNO_ANALOG, UNO_DIGITAL } from '../parts/catalog';
import type { PartInstance, Project } from '../project';

export const MCU = {
  VCC: 5.0,
  ROUT: 30, // Ω, output driver resistance (ATmega328P ~ 4.2 V @ 20 mA)
  RPULLUP: 35000,
  RLEAK: 1e9,
  PIN_ABS_MAX_A: 0.04,
  PIN_RECOMMENDED_A: 0.02,
  USB_LIMIT_A: 0.5,
};

export type PinMode = 'low' | 'high' | 'input' | 'input_pullup';

export interface PartOutputs { [k: string]: number | string | boolean }

export interface PartRuntime {
  part: PartInstance;
  /** apply (possibly live-changed) properties to element parameters */
  apply(props: Record<string, number | string>): void;
  /** read outputs; avg = time-averaged currents since last frame, if available */
  read(res: SolveResult, v: (node: number) => number): PartOutputs;
  /** advance internal mechanical/thermal state */
  step?(dt: number, res: SolveResult): void;
}

export interface BuiltCircuit {
  circuit: Circuit;
  netlist: Netlist;
  netNode: number[];
  nodeNet: Map<number, number>;
  mcuPins: Map<string, ElN>;
  mcuPinNode: Map<string, number>;
  runtimes: PartRuntime[];
  boardId: string;
  railElements: { v5: ElN; v33: ElN; reset: ElR };
  /** names of current-measured elements per part for averaging */
  nodeOf(ep: string): number;
}

export function buildCircuit(project: Project): BuiltCircuit {
  const netlist = buildNetlist(project);
  const board = project.parts.find((p) => p.type === 'uno')!;
  const netNode: number[] = [];
  const nodeNet = new Map<number, number>();
  let next = 1;
  // GND net is node 0
  const gndNet = netlist.pinToNet.get(`${board.id}.GND.1`)!;
  const bbIds = new Set(project.parts.filter((p) => p.type === 'breadboard').map((p) => p.id));
  for (const net of netlist.nets) {
    if (net.id === gndNet) netNode[net.id] = 0;
    else if (net.pins.every((ep) => bbIds.has(ep.slice(0, ep.indexOf('.'))))) netNode[net.id] = -1; // empty breadboard strip: no node
    else { netNode[net.id] = next; nodeNet.set(next, net.id); next++; }
  }
  nodeNet.set(0, gndNet);
  const circuit = new Circuit(next);
  const nodeOf = (ep: string) => {
    const n = netlist.pinToNet.get(ep);
    if (n === undefined) throw new Error('Unknown endpoint ' + ep);
    return netNode[n];
  };
  const B = (pin: string) => nodeOf(`${board.id}.${pin}`);

  // board supply rails
  const v5 = circuit.add({ kind: 'N', name: 'board:5V', a: B('5V'), b: 0, g: 1 / 0.05, i: MCU.VCC / 0.05 }) as ElN;
  const v33 = circuit.add({ kind: 'N', name: 'board:3V3', a: B('3V3'), b: 0, g: 1 / 1.0, i: 3.3 / 1.0 }) as ElN;
  const reset = circuit.add({ kind: 'R', name: 'board:RESET_PU', a: B('RESET'), b: B('5V'), r: 10000 }) as ElR;
  circuit.add({ kind: 'R', name: 'board:IOREF', a: B('IOREF'), b: B('5V'), r: 1 });
  const mcuPins = new Map<string, ElN>();
  const mcuPinNode = new Map<string, number>();
  for (const pin of [...UNO_DIGITAL, ...UNO_ANALOG]) {
    const node = B(pin);
    mcuPinNode.set(pin, node);
    mcuPins.set(pin, circuit.add({ kind: 'N', name: `mcu:${pin}`, a: node, b: 0, g: 1 / MCU.RLEAK, i: 0 }) as ElN);
  }

  const runtimes: PartRuntime[] = [];
  for (const part of project.parts) {
    if (part.type === 'uno' || part.type === 'breadboard') continue;
    const n = (pin: string) => nodeOf(`${part.id}.${pin}`);
    const id = part.id;
    const rt = makeRuntime(part, circuit, n, id);
    if (rt) { rt.apply(part.props); runtimes.push(rt); }
  }
  circuit.resetState();
  return { circuit, netlist, netNode, nodeNet, mcuPins, mcuPinNode, runtimes, boardId: board.id, railElements: { v5, v33, reset }, nodeOf };
}

export function setMcuPin(el: ElN, mode: PinMode) {
  switch (mode) {
    case 'high': el.g = 1 / MCU.ROUT; el.i = MCU.VCC / MCU.ROUT; break;
    case 'low': el.g = 1 / MCU.ROUT; el.i = 0; break;
    case 'input_pullup': el.g = 1 / MCU.RPULLUP; el.i = MCU.VCC / MCU.RPULLUP; break;
    default: el.g = 1 / MCU.RLEAK; el.i = 0;
  }
}

const fmtR = (x: number) => Math.max(x, 1e-3);

function makeRuntime(part: PartInstance, c: Circuit, n: (pin: string) => number, id: string): PartRuntime | null {
  const num = (props: Record<string, number | string>, k: string) => Number(props[k]);
  switch (part.type) {
    case 'resistor': {
      const r = c.add({ kind: 'R', name: `${id}`, a: n('a'), b: n('b'), r: 220 }) as ElR;
      return {
        part, apply: (p) => { r.r = fmtR(num(p, 'ohms')); },
        read: (res) => {
          const i = res.current.get(id) ?? 0;
          const v = res.v[r.a] - res.v[r.b];
          return { current: i, voltage: v, power: Math.abs(i * v), overPower: Math.abs(i * v) > 0.25 };
        },
      };
    }
    case 'led': case 'rgb_led': case 'seven_segment': {
      const segs = part.type === 'led' ? [['anode', 'cathode', String(part.props.color ?? 'red')]]
        : part.type === 'rgb_led' ? [['R', 'K', 'red'], ['G', 'K', 'green'], ['B', 'K', 'blue']]
          : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map((s) => [s, 'COM1', String(part.props.color ?? 'red')]);
      for (const [a, k, col] of segs) c.addDiode(`${id}:${a}`, n(a), n(k), DIODE_MODELS[col] ?? DIODE_MODELS.red);
      return {
        part, apply: () => {},
        read: (res) => {
          const out: PartOutputs = {};
          let maxI = 0;
          for (const [a, k] of segs) {
            const i = res.current.get(`${id}:${a}`) ?? 0;
            out[`current_${a}`] = i;
            out[`voltage_${a}`] = res.v[n(a)] - res.v[n(k)];
            maxI = Math.max(maxI, i);
          }
          if (part.type === 'led') {
            out.current = out.current_anode; out.voltage = out.voltage_anode;
            out.power = Number(out.current) * Number(out.voltage);
          }
          out.maxCurrent = maxI;
          out.overCurrent = maxI > 0.03;
          return out;
        },
      };
    }
    case 'button': {
      const r1 = c.add({ kind: 'R', name: `${id}:sw`, a: n('1a'), b: n('2a'), r: 1e9 }) as ElR;
      return { part, apply: (p) => { r1.r = num(p, 'pressed') > 0.5 ? 0.05 : 1e9; }, read: (res) => ({ pressed: r1.r < 1, current: res.current.get(`${id}:sw`) ?? 0 }) };
    }
    case 'switch': {
      const r1 = c.add({ kind: 'R', name: `${id}:1`, a: n('com'), b: n('c1'), r: 0.05 }) as ElR;
      const r2 = c.add({ kind: 'R', name: `${id}:2`, a: n('com'), b: n('c2'), r: 1e9 }) as ElR;
      return { part, apply: (p) => { const pos = num(p, 'position') > 0.5; r1.r = pos ? 1e9 : 0.05; r2.r = pos ? 0.05 : 1e9; }, read: () => ({ position: r2.r < 1 ? 1 : 0 }) };
    }
    case 'potentiometer': {
      const r1 = c.add({ kind: 'R', name: `${id}:1`, a: n('gnd'), b: n('wiper'), r: 5000 }) as ElR;
      const r2 = c.add({ kind: 'R', name: `${id}:2`, a: n('wiper'), b: n('vcc'), r: 5000 }) as ElR;
      return {
        part, apply: (p) => { const R = num(p, 'ohms'); const pos = Math.min(1, Math.max(0, num(p, 'position'))); r1.r = Math.max(0.5, R * pos); r2.r = Math.max(0.5, R * (1 - pos)); },
        read: (res) => ({ wiperVoltage: res.v[n('wiper')] - res.v[n('gnd')], position: r1.r / (r1.r + r2.r) }),
      };
    }
    case 'ldr': {
      const r = c.add({ kind: 'R', name: id, a: n('a'), b: n('b'), r: 10000 }) as ElR;
      return { part, apply: (p) => { r.r = ldrResistance(num(p, 'lux')); }, read: (res) => ({ resistance: r.r, current: res.current.get(id) ?? 0 }) };
    }
    case 'fsr': {
      const r = c.add({ kind: 'R', name: id, a: n('a'), b: n('b'), r: 1e7 }) as ElR;
      return { part, apply: (p) => { r.r = fsrResistance(num(p, 'force')); }, read: (res) => ({ resistance: r.r, current: res.current.get(id) ?? 0 }) };
    }
    case 'ntc': {
      const r = c.add({ kind: 'R', name: id, a: n('a'), b: n('b'), r: 10000 }) as ElR;
      return { part, apply: (p) => { r.r = ntcResistance(num(p, 'temperature'), num(p, 'r25'), num(p, 'beta')); }, read: () => ({ resistance: r.r }) };
    }
    case 'tmp36': {
      c.add({ kind: 'R', name: `${id}:iq`, a: n('vs'), b: n('gnd'), r: 100000 });
      const out = c.add({ kind: 'N', name: `${id}:out`, a: n('vout'), b: n('gnd'), g: 1 / 100, i: 0 }) as ElN;
      let temp = 25;
      return {
        part, apply: (p) => { temp = num(p, 'temperature'); },
        read: (res) => ({ vout: res.v[n('vout')] - res.v[n('gnd')], temperature: temp }),
        step: (_dt, res) => {
          const supply = res.v[n('vs')] - res.v[n('gnd')];
          const vo = supply > 2.6 ? 0.5 + 0.01 * temp : 0;
          out.i = vo * out.g;
        },
      };
    }
    case 'dht11': {
      c.add({ kind: 'R', name: `${id}:pu`, a: n('data'), b: n('vcc'), r: 10000 });
      c.add({ kind: 'R', name: `${id}:iq`, a: n('vcc'), b: n('gnd'), r: 20000 });
      c.add({ kind: 'N', name: `${id}:drv`, a: n('data'), b: n('gnd'), g: 1e-9, i: 0 });
      return { part, apply: () => {}, read: () => ({}) };
    }
    case 'hc595': {
      c.add({ kind: 'R', name: `${id}:iq`, a: n('VCC'), b: n('GND'), r: 100000 });
      for (const pin of ['DS', 'OE', 'STCP', 'SHCP', 'MR']) c.add({ kind: 'R', name: `${id}:in_${pin}`, a: n(pin), b: n('GND'), r: 1e7 });
      for (const q of ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q7S']) c.add({ kind: 'N', name: `${id}:${q}`, a: n(q), b: n('GND'), g: 1e-9, i: 0 });
      return { part, apply: () => {}, read: () => ({}) };
    }
    case 'hcsr04': {
      c.add({ kind: 'R', name: `${id}:iq`, a: n('vcc'), b: n('gnd'), r: 330 }); // ~15 mA
      c.add({ kind: 'R', name: `${id}:trigin`, a: n('trig'), b: n('gnd'), r: 1e6 });
      c.add({ kind: 'N', name: `${id}:drv`, a: n('echo'), b: n('gnd'), g: 1 / 100, i: 0 });
      return { part, apply: () => {}, read: () => ({}) };
    }
    case 'buzzer': {
      c.add({ kind: 'R', name: id, a: n('pos'), b: n('neg'), r: 1000 });
      return { part, apply: () => {}, read: (res) => ({ current: res.current.get(id) ?? 0, voltage: res.v[n('pos')] - res.v[n('neg')] }) };
    }
    case 'stepper': {
      // ULN2003 inputs: ~2.7 kΩ base resistor + Vbe; coils (~50 Ω @5 V) switched to GND
      for (const k of ['IN1', 'IN2', 'IN3', 'IN4']) c.add({ kind: 'R', name: `${id}:in_${k}`, a: n(k), b: n('GND'), r: 3400 });
      c.add({ kind: 'R', name: `${id}:coils`, a: n('VCC'), b: n('GND'), r: 1e6 }); // set by the StepperCtl device (≈50 Ω per energised coil)
      return { part, apply: () => {}, read: (res) => ({ supply: res.v[n('VCC')] - res.v[n('GND')], coilCurrent: res.current.get(`${id}:coils`) ?? 0 }) };
    }
    case 'servo': {
      c.add({ kind: 'R', name: `${id}:pwr`, a: n('vcc'), b: n('gnd'), r: 500 });
      c.add({ kind: 'R', name: `${id}:sig`, a: n('sig'), b: n('gnd'), r: 1e6 });
      return { part, apply: () => {}, read: (res) => ({ supply: res.v[n('vcc')] - res.v[n('gnd')] }) };
    }
    case 'lcd1602': {
      c.add({ kind: 'R', name: `${id}:iq`, a: n('VDD'), b: n('VSS'), r: 5000 });
      c.addDiode(`${id}:bl`, n('A'), n('K'), { ...DIODE_MODELS.white, rs: 40 });
      for (const pin of ['RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'V0']) c.add({ kind: 'R', name: `${id}:in${pin}`, a: n(pin), b: n('VSS'), r: 1e7 });
      return { part, apply: () => {}, read: (res) => ({ supply: res.v[n('VDD')] - res.v[n('VSS')], backlight: res.current.get(`${id}:bl`) ?? 0, contrast: res.v[n('V0')] - res.v[n('VSS')] }) };
    }
    case 'capacitor': {
      const cap = c.add({ kind: 'C', name: id, a: n('a'), b: n('b'), c: 1e-4, v0: 0 });
      return { part, apply: (p) => { (cap as any).c = num(p, 'farads'); }, read: (res) => ({ voltage: res.v[n('a')] - res.v[n('b')], current: res.current.get(id) ?? 0, reversed: res.v[n('a')] - res.v[n('b')] < -0.5 }) };
    }
    case 'inductor': {
      const l = c.add({ kind: 'L', name: id, a: n('a'), b: n('b'), l: 1e-3, i0: 0 });
      return { part, apply: (p) => { (l as any).l = num(p, 'henries'); }, read: (res) => ({ current: res.branch.get(id) ?? 0 }) };
    }
    case 'diode': {
      c.addDiode(id, n('anode'), n('cathode'), DIODE_MODELS[String(part.props.model)] ?? DIODE_MODELS['1n4007']);
      return { part, apply: () => {}, read: (res) => ({ current: res.current.get(id) ?? 0, voltage: res.v[n('anode')] - res.v[n('cathode')] }) };
    }
    case 'npn': {
      const q = c.add({ kind: 'Q', name: id, c: n('c'), b: n('b'), e: n('e'), is: 1e-14, bf: 150, br: 3 });
      return {
        part, apply: (p) => { (q as any).bf = num(p, 'beta'); },
        read: (res) => ({ ic: res.current.get(id) ?? 0, ib: res.current.get(id + ':b') ?? 0, vce: res.v[n('c')] - res.v[n('e')], vbe: res.v[n('b')] - res.v[n('e')] }),
      };
    }
    case 'dc_motor': {
      // R + back-EMF (V source) with first-order mechanical model
      const mid = c.newNode();
      const r = c.add({ kind: 'R', name: `${id}:R`, a: n('a'), b: mid, r: 25 }) as ElR;
      const emf = c.add({ kind: 'V', name: `${id}:emf`, p: mid, n: n('b'), v: 0 }) as ElV;
      let omega = 0; let kt = 5 / 628; let b = 0; let J = 1e-6;
      return {
        part,
        apply: (p) => {
          r.r = Math.max(0.5, num(p, 'ohms'));
          const vr = num(p, 'ratedVoltage'); kt = vr / 628;
          const i0 = 0.1 * vr / r.r; b = kt * i0 / 628; J = 0.05 * kt * kt / r.r;
        },
        read: (res) => ({ current: res.branch.get(`${id}:emf`) ?? 0, rpm: omega * 60 / (2 * Math.PI), voltage: res.v[n('a')] - res.v[n('b')] }),
        step: (dt, res) => {
          const i = res.branch.get(`${id}:emf`) ?? 0;
          const domega = (kt * i - b * omega) / J;
          omega = Math.max(-1e4, Math.min(1e4, omega + domega * Math.min(dt, 1e-3)));
          emf.v = kt * omega;
        },
      };
    }
    case 'dc_supply': {
      const s = c.add({ kind: 'N', name: id, a: n('pos'), b: n('neg'), g: 10, i: 90 }) as ElN;
      return { part, apply: (p) => { s.g = 10; s.i = num(p, 'volts') * 10; }, read: (res) => ({ current: -(res.current.get(id) ?? 0) }) };
    }
  }
  if (!PART_MAP[part.type]) throw new Error('Unknown part ' + part.type);
  return null;
}

/** FSR-402-like: conductance roughly proportional to force; ~10 MΩ untouched, ~2.5 kΩ at 1 kg */
export function fsrResistance(grams: number) {
  const g = Math.max(0, Number(grams) || 0);
  return 1 / (g * 4e-7 + 1e-7);
}
export function ldrResistance(lux: number) {
  return Math.min(2e6, Math.max(100, 15000 * Math.pow(Math.max(lux, 0.01) / 10, -0.75)));
}
export function ntcResistance(tC: number, r25 = 10000, beta = 3950) {
  return r25 * Math.exp(beta * (1 / (tC + 273.15) - 1 / 298.15));
}
