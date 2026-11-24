/**
 * Bidirectional, clock-synchronised co-simulation of the ATmega328P firmware
 * (avr8js) and the electrical circuit (MNA solver) on one shared timeline.
 *
 *  MCU -> circuit : every GPIO/timer output change re-solves the circuit at the
 *                   exact CPU cycle (pin = Norton driver with 30 Ω / 35 kΩ pull-up)
 *  circuit -> MCU : node voltages are fed back to PINx (with Schmitt thresholds)
 *                   and the ADC channels after every solve; devices (DHT11,
 *                   HC-SR04) drive the net on the CPU clock event queue.
 *  Reactive parts (C/L/motor) are integrated with backward Euler between events.
 */
import { Mcu, F_CPU } from './avr/mcu';
import { buildCircuit, BuiltCircuit, MCU, setMcuPin, PinMode, PartOutputs } from './circuit/models';
import type { SolveResult, ElN } from './circuit/mna';
import { checkTopology, CircuitIssue } from './circuit/netlist';
import { UNO_ANALOG, UNO_DIGITAL } from './parts/catalog';
import type { Project } from './project';
import { BuzzerCtl, DeviceContext, DeviceController, Dht11Ctl, HcSr04Ctl, Hd44780, Hc595, I2cLcd, ServoCtl } from './devices';

export interface GpioEvent { t: number; pin: string; value: 0 | 1 } // t in seconds
export interface ProbeSample { t: number; v: number }

export interface SimOptions {
  /** pins whose digital drive level is recorded (default all) */
  tracePins?: string[];
  /** nets / endpoints sampled for the oscilloscope */
  probes?: string[];
  probeIntervalS?: number;
  maxProbeSamples?: number;
  maxGpioEvents?: number;
}

export interface Snapshot {
  timeS: number;
  cycles: number;
  pins: Record<string, { mode: PinMode; voltage: number; current: number; pwmDuty: number | null }>;
  nets: Record<string, number>;
  parts: Record<string, PartOutputs & Record<string, unknown>>;
  serial: string; // bytes since last snapshot
  issues: CircuitIssue[];
  supplyCurrent: number;
  resetHeld: boolean;
  solves: number;
}

const IDLE_FIRMWARE = new Uint8Array([0xff, 0xcf]); // rjmp .-2 (infinite loop)

export class CoSimulation {
  readonly mcu: Mcu;
  readonly built: BuiltCircuit;
  readonly project: Project;
  readonly topology: CircuitIssue[];
  private last!: SolveResult;
  private lastSolveCycle = 0;
  private inputLevel = new Map<string, boolean>();
  private devices: DeviceController[] = [];
  private devMap = new Map<string, DeviceController>();
  private props = new Map<string, Record<string, number | string>>();
  private solving = false;
  private pendingResolve = false;
  private periodic: number;
  private nextPeriodic = 0;
  private serialBuf = '';
  private serialAll = '';
  readonly gpio: GpioEvent[] = [];
  private lastLevel = new Map<string, 0 | 1 | null>();
  readonly probes = new Map<string, ProbeSample[]>();
  private probeEps: string[];
  private nextProbe = 0;
  private probeInterval: number;
  private maxProbe: number;
  private maxGpio: number;
  private tracePins: Set<string>;
  // time-weighted averages for outputs since last snapshot
  private acc = new Map<string, Map<string, number>>();
  private accPin = new Map<string, number>();
  private accT = 0;
  private pwmHigh = new Map<string, number>();
  private runtimeIssues = new Map<string, CircuitIssue>();
  solves = 0;
  private resetHeld = false;
  private hasDynamic: boolean;

  constructor(project: Project, firmware: Uint8Array | null, opts: SimOptions = {}) {
    this.project = project;
    this.mcu = new Mcu(firmware ?? IDLE_FIRMWARE);
    this.built = buildCircuit(project);
    this.topology = checkTopology(project, this.built.netlist);
    for (const p of project.parts) this.props.set(p.id, { ...p.props });
    for (const p of project.parts) {
      const ctl = p.type === 'lcd1602' ? new Hd44780(p.id) : p.type === 'servo' ? new ServoCtl(p.id) : p.type === 'buzzer' ? new BuzzerCtl(p.id)
        : p.type === 'dht11' ? new Dht11Ctl(p.id) : p.type === 'hcsr04' ? new HcSr04Ctl(p.id) : p.type === 'lcd1602_i2c' ? new I2cLcd(p.id) : p.type === 'hc595' ? new Hc595(p.id) : null;
      if (ctl) { this.devices.push(ctl); this.devMap.set(p.id, ctl); this.applyDeviceProps(p.id); }
    }
    this.attachI2cBus();
    this.attachSpiBus();
    this.hasDynamic = this.built.circuit.hasReactive || project.parts.some((p) => ['dc_motor', 'tmp36'].includes(p.type));
    this.periodic = Math.round(F_CPU * (this.built.circuit.hasReactive ? 100e-6 : 1e-3));
    this.tracePins = new Set(opts.tracePins ?? [...UNO_DIGITAL, ...UNO_ANALOG]);
    this.probeEps = opts.probes ?? [];
    this.probeInterval = opts.probeIntervalS ?? 100e-6;
    this.maxProbe = opts.maxProbeSamples ?? 200000;
    this.maxGpio = opts.maxGpioEvents ?? 500000;
    for (const ep of this.probeEps) this.probes.set(ep, []);
    this.mcu.onSerial((b) => { const ch = String.fromCharCode(b); this.serialBuf += ch; this.serialAll += ch; if (this.serialAll.length > 1e6) this.serialAll = this.serialAll.slice(-5e5); });
    this.mcu.onGpio(() => this.onGpio());
    // initial DC operating point
    this.syncPins();
    this.last = this.built.circuit.solve(0);
    this.solves++;
    this.afterSolve(0);
    this.recordLevels();
  }

  get timeS() { return this.mcu.cycles / F_CPU; }
  get serialOutput() { return this.serialAll; }

  /** change a live property (button press, pot position, sensor value) */
  setProp(partId: string, key: string, value: number | string) {
    const p = this.props.get(partId);
    if (!p) throw new Error('Unknown part ' + partId);
    p[key] = value;
    const rt = this.built.runtimes.find((r) => r.part.id === partId);
    rt?.apply(p);
    this.applyDeviceProps(partId);
    this.resolve();
  }

  /**
   * I2C bus on the ATmega328P TWI peripheral. A slave takes part only when its
   * SDA/SCL pins are on the same circuit nodes as A4/A5. Each address/data
   * phase completes after 9 SCL periods at the frequency the firmware set in TWBR.
   */
  private attachI2cBus() {
    const slaves = this.devices.filter((d): d is I2cLcd => d instanceof I2cLcd);
    const sda = this.built.mcuPinNode.get('A4'), scl = this.built.mcuPinNode.get('A5');
    for (const d of slaves) d.wired = sda !== undefined && scl !== undefined && sda >= 0 && scl >= 0 && this.built.nodeOf(`${d.partId}.SDA`) === sda && this.built.nodeOf(`${d.partId}.SCL`) === scl;
    const twi = this.mcu.twi;
    let cur: I2cLcd | null = null;
    const later = (bits: number, cb: () => void) => this.mcu.cpu.addClockEvent(cb, Math.max(1, Math.round((bits * F_CPU) / (twi.sclFrequency || 100000))));
    twi.eventHandler = {
      start: () => later(1, () => twi.completeStart()),
      stop: () => { cur = null; later(1, () => twi.completeStop()); },
      connectToSlave: (addr: number) => { cur = slaves.find((d) => d.address === addr && d.acks()) ?? null; const ack = !!cur; later(9, () => twi.completeConnect(ack)); },
      writeByte: (v: number) => { const ack = !!cur && cur.acks(); if (ack) cur!.write(v); later(9, () => twi.completeWrite(ack)); },
      readByte: () => { const v = cur && cur.acks() ? cur.read() : 0xff; later(9, () => twi.completeRead(v)); },
    };
  }

  /**
   * Hardware SPI master (SPDR writes). avr8js models the peripheral, not the
   * pin waveform, so bytes are delivered to shift registers whose DS/SHCP are
   * on the same nodes as MOSI (D11) and SCK (D13); MISO reads back 0xFF.
   */
  private attachSpiBus() {
    const regs = this.devices.filter((d): d is Hc595 => d instanceof Hc595);
    const mosi = this.built.mcuPinNode.get('D11'), sck = this.built.mcuPinNode.get('D13');
    for (const r of regs) r.spiWired = mosi !== undefined && sck !== undefined && mosi >= 0 && sck >= 0 && this.built.nodeOf(`${r.partId}.DS`) === mosi && this.built.nodeOf(`${r.partId}.SHCP`) === sck;
    const spi = this.mcu.spi;
    spi.onByte = (v: number) => {
      for (const r of regs) if (r.spiWired) r.spiByte(v, spi.dataOrder === 'lsbFirst');
      this.mcu.cpu.addClockEvent(() => spi.completeTransfer(0xff), spi.transferCycles);
    };
  }

  private applyDeviceProps(partId: string) {
    const d = this.devMap.get(partId) as any;
    const p = this.props.get(partId)!;
    if (!d) return;
    if (d instanceof Dht11Ctl) { d.temperature = Number(p.temperature); d.humidity = Number(p.humidity); }
    if (d instanceof HcSr04Ctl) d.distance = Number(p.distance);
    if (d instanceof I2cLcd) d.address = parseInt(String(p.address ?? '0x27'), 16) || 0x27;
  }

  serialWrite(text: string) { this.mcu.serialWrite(text); }

  /** run for `seconds` of simulated time */
  run(seconds: number) {
    const end = this.mcu.cycles + Math.round(seconds * F_CPU);
    const cpu = this.mcu.cpu;
    while (cpu.cycles < end) {
      if (this.resetHeld) {
        cpu.cycles = Math.min(end, cpu.cycles + 1600);
        this.resolve();
        if (!this.resetHeld) cpu.reset();
        continue;
      }
      this.mcu.step();
      if (cpu.cycles >= this.nextPeriodic) {
        this.nextPeriodic = cpu.cycles + this.periodic;
        if (this.hasDynamic || this.pendingResolve) this.resolve();
        else this.accumulate(); // keep averages moving with constant state
      }
      if (cpu.cycles >= this.nextProbe && this.probeEps.length) this.sampleProbes();
    }
    this.accumulate();
  }

  private onGpio() {
    this.recordLevels();
    this.resolve();
  }

  private recordLevels() {
    const t = this.timeS;
    for (const pin of this.tracePins) {
      const lvl = this.mcu.outputLevel(pin);
      if (lvl !== this.lastLevel.get(pin)) {
        this.lastLevel.set(pin, lvl);
        if (lvl !== null && this.gpio.length < this.maxGpio) this.gpio.push({ t, pin, value: lvl });
      }
    }
  }

  private solvedMode = new Map<string, PinMode>();
  private syncPins() {
    for (const [pin, el] of this.built.mcuPins) { const m = this.mcu.pinMode(pin); setMcuPin(el, m); this.solvedMode.set(pin, m); }
  }

  /** Re-solve the circuit at the current CPU cycle (event-driven step). */
  resolve() {
    if (this.solving) { this.pendingResolve = true; return; }
    this.solving = true;
    try {
      do {
        this.pendingResolve = false;
        this.accumulate();
        this.syncPins();
        const dtCycles = this.mcu.cycles - this.lastSolveCycle;
        const dt = this.built.circuit.hasReactive ? Math.max(dtCycles, 1) / F_CPU : 0;
        for (const rt of this.built.runtimes) rt.step?.(Math.max(dtCycles, 1) / F_CPU, this.last);
        const res = this.built.circuit.solve(dt);
        this.solves++;
        if (res.ok || !this.last) this.last = res;
        this.lastSolveCycle = this.mcu.cycles;
        this.afterSolve(dtCycles / F_CPU);
      } while (this.pendingResolve);
    } finally { this.solving = false; }
  }

  private afterSolve(_dt: number) {
    const v = this.last.v;
    // feed back to MCU digital inputs and ADC
    for (const [pin, node] of this.built.mcuPinNode) {
      const volts = v[node];
      const prev = this.inputLevel.get(pin) ?? false;
      const lvl = volts > 0.6 * MCU.VCC ? true : volts < 0.3 * MCU.VCC ? false : prev;
      if (lvl !== prev || !this.inputLevel.has(pin)) { this.inputLevel.set(pin, lvl); this.mcu.setInput(pin, lvl); }
    }
    UNO_ANALOG.forEach((pin, i) => { this.mcu.adc.channelValues[i] = Math.max(0, v[this.built.mcuPinNode.get(pin)!]); });
    // reset line
    const resetV = v[this.built.nodeOf(`${this.built.boardId}.RESET`)];
    this.resetHeld = resetV < 1.0;
    // devices
    const ctx = this.deviceCtx;
    for (const d of this.devices) d.observe(ctx);
    if (this.mcu.cycles >= this.nextRuntimeCheck) { this.nextRuntimeCheck = this.mcu.cycles + F_CPU / 200; this.checkRuntime(); }
  }
  private nextRuntimeCheck = 0;

  private deviceCtx: DeviceContext = {
    now: () => this.timeS,
    volt: (ep: string) => { const n = this.built.nodeOf(ep); return n >= 0 ? this.last.v[n] : 0; },
    after: (s: number, cb: () => void) => { this.mcu.cpu.addClockEvent(cb, Math.max(1, Math.round(s * F_CPU))); },
    resolve: () => this.resolve(),
    element: (name: string) => this.built.circuit.elements.find((e) => e.name === name) as ElN | undefined,
  };

  private accumulate() {
    const dtc = this.mcu.cycles - (this.lastAccCycle ?? 0);
    this.lastAccCycle = this.mcu.cycles;
    if (dtc <= 0 || !this.last) return;
    const dt = dtc / F_CPU;
    this.accT += dt;
    const v = (n: number) => this.last.v[n];
    for (const rt of this.built.runtimes) {
      const out = rt.read(this.last, v);
      let m = this.acc.get(rt.part.id);
      if (!m) { m = new Map(); this.acc.set(rt.part.id, m); }
      for (const [k, val] of Object.entries(out)) if (typeof val === 'number') m.set(k, (m.get(k) ?? 0) + val * dt);
    }
    for (const [pin, el] of this.built.mcuPins) {
      const i = el.g * v(el.a) - el.i; // current from pin node into the driver (sink positive)
      this.accPin.set(pin, (this.accPin.get(pin) ?? 0) + -i * dt);
      // level that was driven during the interval that just ended (set at the previous solve)
      if (this.solvedMode.get(pin) === 'high') this.pwmHigh.set(pin, (this.pwmHigh.get(pin) ?? 0) + dt);
    }
  }
  private lastAccCycle = 0;

  private sampleProbes() {
    this.nextProbe = this.mcu.cycles + Math.round(this.probeInterval * F_CPU);
    const t = this.timeS;
    for (const ep of this.probeEps) {
      const arr = this.probes.get(ep)!;
      if (arr.length < this.maxProbe) arr.push({ t, v: this.voltageOf(ep) });
    }
  }

  voltageOf(ep: string): number {
    if (/^[A-Za-z0-9]+$/.test(ep) && !ep.includes('.')) {
      const net = this.built.netlist.nets.find((n) => n.name === ep);
      return net && this.built.netNode[net.id] >= 0 ? this.last.v[this.built.netNode[net.id]] : NaN;
    }
    const node = this.built.nodeOf(ep);
    return node >= 0 ? this.last.v[node] : NaN;
  }

  private checkRuntime() {
    const res = this.last;
    for (const [pin, el] of this.built.mcuPins) {
      const i = Math.abs(el.g * res.v[el.a] - el.i);
      const key = 'pin:' + pin;
      if (i > MCU.PIN_ABS_MAX_A) this.runtimeIssues.set(key, { severity: 'error', code: 'pin_overcurrent', net: pin, message: { ar: `تيار المنفذ ${pin} = ${(i * 1000).toFixed(1)}mA يتجاوز الحد الأقصى 40mA — أضف مقاومة على التوالي.`, en: `Pin ${pin} current ${(i * 1000).toFixed(1)} mA exceeds 40 mA absolute max.` } });
    }
    const supply = Math.abs(res.current.get('board:5V') ?? 0);
    if (supply > MCU.USB_LIMIT_A) this.runtimeIssues.set('usb', { severity: 'error', code: 'supply_overcurrent', message: { ar: `سحب تيار ${(supply).toFixed(2)}A من 5V يتجاوز حد USB (0.5A) — احتمال قصر.`, en: `5V rail current ${supply.toFixed(2)} A exceeds USB 0.5 A limit.` } });
    for (const rt of this.built.runtimes) {
      const out = rt.read(res, (n) => res.v[n]);
      if (out.overCurrent) this.runtimeIssues.set('oc:' + rt.part.id, { severity: 'error', code: 'led_overcurrent', parts: [rt.part.id], message: { ar: `تيار ${rt.part.id} = ${(Number(out.maxCurrent) * 1000).toFixed(1)}mA أعلى من الحد الآمن 30mA — استخدم مقاومة أكبر (220Ω أو أكثر).`, en: `${rt.part.id} current ${(Number(out.maxCurrent) * 1000).toFixed(1)} mA is above the 30 mA safe limit.` } });
      if (out.overPower) this.runtimeIssues.set('op:' + rt.part.id, { severity: 'warning', code: 'resistor_power', parts: [rt.part.id], message: { ar: `القدرة على ${rt.part.id} = ${Number(out.power).toFixed(2)}W أكبر من 0.25W.`, en: `${rt.part.id} dissipates ${Number(out.power).toFixed(2)} W (> 0.25 W).` } });
    }
  }

  snapshot(): Snapshot {
    this.accumulate();
    const T = this.accT || 1e-12;
    const res = this.last;
    const pins: Snapshot['pins'] = {};
    for (const [pin, el] of this.built.mcuPins) {
      const mode = this.mcu.pinMode(pin);
      pins[pin] = {
        mode, voltage: res.v[el.a],
        current: this.accT ? (this.accPin.get(pin) ?? 0) / T : -(el.g * res.v[el.a] - el.i),
        pwmDuty: this.accT ? (this.pwmHigh.get(pin) ?? 0) / T : null,
      };
    }
    const nets: Record<string, number> = {};
    for (const net of this.built.netlist.nets) if (this.built.netNode[net.id] >= 0) nets[net.name] = res.v[this.built.netNode[net.id]];
    const parts: Snapshot['parts'] = {};
    for (const rt of this.built.runtimes) {
      const inst = rt.read(res, (n) => res.v[n]);
      const m = this.acc.get(rt.part.id);
      const avg: Record<string, unknown> = {};
      if (m && this.accT) for (const [k, val] of m) avg[k] = val / T;
      parts[rt.part.id] = { ...inst, avg } as any;
    }
    for (const d of this.devices) parts[d.partId] = { ...(parts[d.partId] ?? {}), ...d.outputs() } as any;
    const serial = this.serialBuf; this.serialBuf = '';
    const snap: Snapshot = {
      timeS: this.timeS, cycles: this.mcu.cycles, pins, nets, parts, serial,
      issues: [...this.topology, ...this.runtimeIssues.values()],
      supplyCurrent: Math.abs(res.current.get('board:5V') ?? 0), resetHeld: this.resetHeld, solves: this.solves,
    };
    this.acc.clear(); this.accPin.clear(); this.pwmHigh.clear(); this.accT = 0;
    return snap;
  }

  /** GPIO transitions as CSV time_ms,pin,value (spec-compatible trace format). */
  gpioCsv(pins?: string[]): string {
    const set = pins ? new Set(pins) : null;
    const rows = this.gpio.filter((e) => !set || set.has(e.pin)).map((e) => `${(e.t * 1000).toFixed(6)},${e.pin},${e.value}`);
    return 'time_ms,pin,value\n' + rows.join('\n') + (rows.length ? '\n' : '');
  }
}
