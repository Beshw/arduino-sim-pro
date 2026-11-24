/**
 * Digital device behaviour driven by real node voltages from the circuit solver.
 * Controllers observe logic levels after every solve and may drive their own
 * output elements (DHT11 data, HC-SR04 echo) on the CPU clock timeline.
 */
import type { ElN } from './circuit/mna';

export interface DeviceContext {
  /** current simulated time in seconds */
  now(): number;
  /** voltage of an endpoint "part.pin" relative to ground */
  volt(ep: string): number;
  /** schedule callback after `seconds` of simulated time */
  after(seconds: number, cb: () => void): void;
  /** request an immediate circuit re-solve (after changing a driver element) */
  resolve(): void;
  element(name: string): ElN | undefined;
}

export interface DeviceController {
  partId: string;
  observe(ctx: DeviceContext): void;
  outputs(): Record<string, unknown>;
}

const HI = 3.0, LO = 1.5;
function logic(v: number, prev: boolean): boolean { return v > HI ? true : v < LO ? false : prev; }

// ------------------------------- HD44780 16x2 -------------------------------
export class Hd44780 implements DeviceController {
  ddram = new Uint8Array(128).fill(0x20);
  cgram = new Uint8Array(64);
  addr = 0; cgMode = false; inc = true; shiftDisplay = false;
  displayOn = false; cursorOn = false; blinkOn = false;
  eightBit = true; twoLine = false; nibbleHigh: number | null = null;
  shift = 0; lastE = false; initialized = false;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    const p = (pin: string) => ctx.volt(`${this.partId}.${pin}`);
    if (p('VDD') - p('VSS') < 4.0) { this.initialized = false; this.lastE = false; return; }
    this.initialized = true;
    const e = logic(p('E'), this.lastE);
    if (this.lastE && !e) { // falling edge latches
      const rs = p('RS') > HI;
      const rw = p('RW') > HI;
      if (!rw) {
        const hi4 = [p('D7'), p('D6'), p('D5'), p('D4')].reduce((acc, v) => (acc << 1) | (v > HI ? 1 : 0), 0);
        const lo4 = [p('D3'), p('D2'), p('D1'), p('D0')].reduce((acc, v) => (acc << 1) | (v > HI ? 1 : 0), 0);
        this.latch(rs, hi4, lo4);
      }
    }
    this.lastE = e;
  }
  /** one E falling edge with RW=0: D7..D4 = hi4, D3..D0 = lo4 (ignored in 4-bit mode) */
  latch(rs: boolean, hi4: number, lo4: number) {
    if (this.eightBit) this.exec(rs, (hi4 << 4) | lo4);
    else if (this.nibbleHigh === null) this.nibbleHigh = hi4;
    else { const b = (this.nibbleHigh << 4) | hi4; this.nibbleHigh = null; this.exec(rs, b); }
  }
  private exec(rs: boolean, b: number) {
    if (rs) {
      if (this.cgMode) { this.cgram[this.addr & 0x3f] = b; this.addr = (this.addr + (this.inc ? 1 : -1)) & 0x3f; }
      else { this.ddram[this.addr & 0x7f] = b; this.addr = (this.addr + (this.inc ? 1 : -1)) & 0x7f; if (this.shiftDisplay) this.shift += this.inc ? 1 : -1; }
      return;
    }
    if (b & 0x80) { this.cgMode = false; this.addr = b & 0x7f; }
    else if (b & 0x40) { this.cgMode = true; this.addr = b & 0x3f; }
    else if (b & 0x20) { this.eightBit = !!(b & 0x10); this.twoLine = !!(b & 0x08); this.nibbleHigh = null; }
    else if (b & 0x10) { if (b & 0x08) this.shift += (b & 0x04) ? -1 : 1; else this.addr = (this.addr + ((b & 0x04) ? 1 : -1)) & 0x7f; }
    else if (b & 0x08) { this.displayOn = !!(b & 0x04); this.cursorOn = !!(b & 0x02); this.blinkOn = !!(b & 0x01); }
    else if (b & 0x04) { this.inc = !!(b & 0x02); this.shiftDisplay = !!(b & 0x01); }
    else if (b & 0x02) { this.addr = 0; this.shift = 0; this.cgMode = false; }
    else if (b & 0x01) { this.ddram.fill(0x20); this.addr = 0; this.shift = 0; this.inc = true; this.cgMode = false; }
  }
  lines(): string[] {
    const row = (base: number) => {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const a = base + ((i + this.shift) % 40 + 40) % 40;
        const c = this.ddram[a];
        s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : c < 8 ? '▮' : '?';
      }
      return s;
    };
    return [row(0x00), row(0x40)];
  }
  outputs() {
    return { powered: this.initialized, displayOn: this.displayOn && this.initialized, lines: this.lines(), cursor: this.cursorOn ? this.addr : -1, mode: this.eightBit ? 8 : 4 };
  }
}

// ------------------------- I2C LCD (PCF8574 + HD44780) -------------------------
/**
 * 16x2 LCD behind a PCF8574 I2C backpack. The expander's 8 outputs drive
 * P0=RS P1=RW P2=E P3=backlight P4..P7=D4..D7; the HD44780 latches on the
 * falling edge of E exactly as with a direct parallel connection. The part
 * answers on the bus only when powered and when SDA/SCL share a node with
 * the Uno's A4/A5 (checked by the co-simulation from the real netlist).
 */
export class I2cLcd implements DeviceController {
  lcd: Hd44780; port = 0xff; powered = false; wired = false; address = 0x27; bytes = 0;
  constructor(public partId: string) { this.lcd = new Hd44780(partId); }
  observe(ctx: DeviceContext) {
    const on = ctx.volt(`${this.partId}.VCC`) - ctx.volt(`${this.partId}.GND`) > 4.0;
    if (!on && this.powered) { this.lcd = new Hd44780(this.partId); this.port = 0xff; }
    this.powered = on; this.lcd.initialized = on;
  }
  /** ACK for the slave address */
  acks(): boolean { return this.powered && this.wired; }
  write(b: number) {
    if ((this.port & 0x04) && !(b & 0x04) && !(this.port & 0x02)) this.lcd.latch(!!(this.port & 0x01), this.port >> 4, 0);
    this.port = b & 0xff; this.bytes++;
  }
  read(): number { return this.port; }
  outputs() {
    const o = this.lcd.outputs();
    return { ...o, powered: this.powered, displayOn: o.displayOn && this.powered, backlight: this.powered && (this.port & 0x08) ? 0.012 : 0, address: '0x' + this.address.toString(16).toUpperCase(), connected: this.wired, i2cBytes: this.bytes };
  }
}

// ------------------------------- 74HC595 -------------------------------
/**
 * 8-bit serial-in/parallel-out shift register with output latch. Inputs are
 * read from solved node voltages (so shiftOut() bit-banging works through the
 * circuit); hardware SPI bytes are clocked in by the co-simulation when DS/SHCP
 * sit on D11/D13. Outputs are push-pull drivers (~50 Ω) referenced to VCC.
 */
export class Hc595 implements DeviceController {
  shift = 0; latch = 0; private sh = false; private st = false; oe = true; mr = true; powered = false; vcc = 0;
  spiWired = false; bytes = 0; private ctx: DeviceContext | null = null; private pending = false;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    this.ctx = ctx;
    const g = ctx.volt(`${this.partId}.GND`);
    const p = (pin: string) => ctx.volt(`${this.partId}.${pin}`) - g;
    this.vcc = p('VCC'); const on = this.vcc > 2.0;
    if (on !== this.powered) { this.powered = on; if (!on) { this.shift = 0; this.latch = 0; } this.schedule(); }
    if (!on) return;
    const th = this.vcc * 0.6, tl = this.vcc * 0.3;
    const lv = (v: number, prev: boolean) => (v > th ? true : v < tl ? false : prev);
    const mr = lv(p('MR'), this.mr); if (!mr) this.shift = 0;
    const sh = lv(p('SHCP'), this.sh); if (sh && !this.sh && mr) this.clockBit(lv(p('DS'), false));
    const st = lv(p('STCP'), this.st); if (st && !this.st) { this.latch = this.shift; this.schedule(); }
    const oe = !lv(p('OE'), false); if (oe !== this.oe) { this.oe = oe; this.schedule(); }
    if (mr !== this.mr) { this.mr = mr; this.schedule(); }
    this.sh = sh; this.st = st;
  }
  private clockBit(bit: boolean) { this.shift = ((this.shift << 1) | (bit ? 1 : 0)) & 0x1ff; this.schedule(); }
  /** a full byte arriving over hardware SPI (MSB first unless lsbFirst) */
  spiByte(v: number, lsbFirst: boolean) { if (!this.powered || !this.mr) return; for (let i = 0; i < 8; i++) this.clockBit(!!((lsbFirst ? v >> i : v >> (7 - i)) & 1)); this.bytes++; }
  /** drive outputs one CPU cycle later (propagation delay), outside the current solve */
  private schedule() {
    const ctx = this.ctx; if (!ctx || this.pending) return;
    this.pending = true;
    ctx.after(1e-8, () => { this.pending = false; this.drive(ctx); });
  }
  private drive(ctx: DeviceContext) {
    const G = 1 / 50;
    for (let i = 0; i < 8; i++) {
      const el = ctx.element(`${this.partId}:Q${i}`); if (!el) continue;
      if (!this.powered || !this.oe) { el.g = 1e-9; el.i = 0; } else { el.g = G; el.i = (this.latch >> i) & 1 ? this.vcc * G : 0; }
    }
    const q7s = ctx.element(`${this.partId}:Q7S`);
    if (q7s) { q7s.g = this.powered ? G : 1e-9; q7s.i = this.powered && (this.shift & 0x80) ? this.vcc * G : 0; }
    ctx.resolve();
  }
  outputs() {
    const bits = Array.from({ length: 8 }, (_, i) => ((this.latch >> i) & 1) === 1);
    return { powered: this.powered, outputsEnabled: this.oe, shift: this.shift & 0xff, latch: this.latch & 0xff, q: bits, hex: '0x' + (this.latch & 0xff).toString(16).padStart(2, '0').toUpperCase(), spiBytes: this.bytes, spiWired: this.spiWired };
  }
}

// ------------------------- 28BYJ-48 stepper + ULN2003 -------------------------
/**
 * The coil pattern on IN1..IN4 is mapped onto the 8-state half-step cycle
 * (1000,1100,0100,0110,0010,0011,0001,1001). Each transition to a
 * neighbouring state moves the rotor by ±1 half step (4096 per output turn).
 * Patterns that are not part of the cycle (3 coils, opposite coils) hold the
 * rotor where it is, exactly like the real motor would stall.
 */
const HALF_STEPS = [0b1000, 0b1100, 0b0100, 0b0110, 0b0010, 0b0011, 0b0001, 0b1001];
export class StepperCtl implements DeviceController {
  halfSteps = 0; phase = -1; coils = 0; powered = false; private ctx: DeviceContext | null = null; private lastR = -1;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    this.ctx = ctx;
    const g = ctx.volt(`${this.partId}.GND`);
    this.powered = ctx.volt(`${this.partId}.VCC`) - g > 4.0;
    let pat = 0;
    ['IN1', 'IN2', 'IN3', 'IN4'].forEach((k, i) => { if (ctx.volt(`${this.partId}.${k}`) - g > 2.5) pat |= 8 >> i; });
    this.coils = pat;
    const idx = HALF_STEPS.indexOf(pat);
    if (this.powered && idx >= 0) {
      if (this.phase >= 0) {
        const d = (idx - this.phase + 8) % 8;
        if (d >= 1 && d <= 3) this.halfSteps += d; else if (d >= 5) this.halfSteps -= 8 - d;
      }
      this.phase = idx;
    }
    // coil current: ≈50 Ω per energised coil
    const n = [8, 4, 2, 1].filter((b) => pat & b).length;
    const r = this.powered && n ? 50 / n : 1e6;
    if (r !== this.lastR) { this.lastR = r; const el: any = ctx.element(`${this.partId}:coils`); if (el) { el.r = r; ctx.after(1e-8, () => ctx.resolve()); } }
  }
  outputs() {
    const angle = (this.halfSteps * 360) / 4096;
    return { powered: this.powered, steps: this.halfSteps / 2, halfSteps: this.halfSteps, angle, angleMod: ((angle % 360) + 360) % 360, coils: [8, 4, 2, 1].map((b) => !!(this.coils & b)) };
  }
}

// ------------------------------- Servo -------------------------------
export class ServoCtl implements DeviceController {
  private high = false; private rise = 0; angle = 90; pulseUs = 0; lastPulse = -1;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    const v = ctx.volt(`${this.partId}.sig`) - ctx.volt(`${this.partId}.gnd`);
    const h = logic(v, this.high);
    const t = ctx.now();
    if (h && !this.high) this.rise = t;
    if (!h && this.high) {
      const w = (t - this.rise) * 1e6;
      if (w >= 400 && w <= 2700) {
        this.pulseUs = w; this.lastPulse = t;
        this.angle = Math.max(0, Math.min(180, ((w - 544) / (2400 - 544)) * 180));
      }
    }
    this.high = h;
  }
  outputs() { return { angle: this.angle, pulseUs: this.pulseUs, active: this.lastPulse >= 0 }; }
}

// ------------------------------- Buzzer (frequency meter) -------------------------------
export class BuzzerCtl implements DeviceController {
  private high = false; private lastRise = -1; private period = 0; freq = 0; lastEdge = -1;
  constructor(public partId: string) {}
  private nowT = 0;
  observe(ctx: DeviceContext) {
    const v = ctx.volt(`${this.partId}.pos`) - ctx.volt(`${this.partId}.neg`);
    const h = logic(v, this.high);
    const t = ctx.now(); this.nowT = t;
    if (h && !this.high) {
      if (this.lastRise >= 0) { this.period = t - this.lastRise; this.freq = this.period > 0 ? 1 / this.period : 0; }
      this.lastRise = t; this.lastEdge = t;
    }
    this.high = h;
  }
  outputs() {
    const active = this.lastEdge >= 0 && this.nowT - this.lastEdge < Math.max(0.05, this.period * 2);
    return { frequency: active ? this.freq : 0, active };
  }
}

// ------------------------------- DHT11 -------------------------------
/** Implements the single-wire DHT11 protocol with real microsecond timing. */
export class Dht11Ctl implements DeviceController {
  private lowSince = -1; private busy = false; private prevHigh = true; responses = 0;
  temperature = 24; humidity = 55;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    if (this.busy) return;
    const p = (pin: string) => ctx.volt(`${this.partId}.${pin}`);
    if (p('vcc') - p('gnd') < 3.0) return;
    const high = logic(p('data') - p('gnd'), this.prevHigh);
    const t = ctx.now();
    if (!high && this.prevHigh) this.lowSince = t;
    if (high && !this.prevHigh && this.lowSince >= 0) {
      const lowFor = t - this.lowSince;
      if (lowFor >= 0.0008) this.respond(ctx);
      this.lowSince = -1;
    }
    this.prevHigh = high;
  }
  private respond(ctx: DeviceContext) {
    const drv = ctx.element(`${this.partId}:drv`);
    if (!drv) return;
    this.busy = true;
    const h = Math.round(this.humidity), tt = Math.round(this.temperature);
    const bytes = [h & 0xff, 0, tt & 0xff, 0];
    bytes.push((bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xff);
    const seq: [boolean, number][] = []; // [pullLow, duration_s]
    seq.push([false, 30e-6]); // host release -> sensor waits 20-40us
    seq.push([true, 80e-6]); seq.push([false, 80e-6]);
    for (const b of bytes) for (let i = 7; i >= 0; i--) { seq.push([true, 50e-6]); seq.push([false, (b >> i) & 1 ? 70e-6 : 26e-6]); }
    seq.push([true, 50e-6]); seq.push([false, 0]);
    let k = 0;
    const next = () => {
      if (k >= seq.length) { drv.g = 1e-9; this.busy = false; this.prevHigh = true; this.responses++; ctx.resolve(); return; }
      const [low, d] = seq[k++];
      drv.g = low ? 1 / 50 : 1e-9; drv.i = 0;
      ctx.resolve();
      if (d > 0) ctx.after(d, next); else next();
    };
    next();
  }
  outputs() { return { temperature: this.temperature, humidity: this.humidity, responses: this.responses }; }
}

// ------------------------------- HC-SR04 -------------------------------
export class HcSr04Ctl implements DeviceController {
  private trigHigh = false; private rise = 0; private busy = false; distance = 50; pings = 0;
  constructor(public partId: string) {}
  observe(ctx: DeviceContext) {
    const p = (pin: string) => ctx.volt(`${this.partId}.${pin}`);
    if (p('vcc') - p('gnd') < 4.0) return;
    const h = logic(p('trig') - p('gnd'), this.trigHigh);
    const t = ctx.now();
    if (h && !this.trigHigh) this.rise = t;
    if (!h && this.trigHigh && !this.busy && t - this.rise >= 8e-6) {
      const drv = ctx.element(`${this.partId}:drv`);
      if (drv) {
        this.busy = true;
        const echo = Math.min(38e-3, (this.distance * 2) / 34300); // round trip at 343 m/s
        ctx.after(450e-6, () => {
          drv.i = 5 * drv.g; ctx.resolve();
          ctx.after(echo, () => { drv.i = 0; ctx.resolve(); this.busy = false; this.pings++; });
        });
      }
    }
    this.trigHigh = h;
  }
  outputs() { return { distance: this.distance, pings: this.pings }; }
}
