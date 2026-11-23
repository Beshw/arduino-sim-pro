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
        if (this.eightBit) {
          const lo4 = [p('D3'), p('D2'), p('D1'), p('D0')].reduce((acc, v) => (acc << 1) | (v > HI ? 1 : 0), 0);
          this.exec(rs, (hi4 << 4) | lo4);
        } else if (this.nibbleHigh === null) this.nibbleHigh = hi4;
        else { const b = (this.nibbleHigh << 4) | hi4; this.nibbleHigh = null; this.exec(rs, b); }
      }
    }
    this.lastE = e;
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
