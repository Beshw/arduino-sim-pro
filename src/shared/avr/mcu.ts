/**
 * ATmega328P virtual MCU built on avr8js (instruction-accurate AVR core with
 * timers, USART, ADC, SPI, TWI, EEPROM, watchdog and pin-change interrupts).
 * Executes the real compiled firmware image produced by avr-gcc.
 */
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, AVRUSART, usart0Config,
  AVRADC, adcConfig, AVRSPI, spiConfig, AVRTWI, twiConfig, AVREEPROM, EEPROMMemoryBackend, eepromConfig,
  AVRWatchdog, watchdogConfig, AVRClock, clockConfig, PinState,
} from 'avr8js';
import { unoPinToPort } from '../parts/catalog';
import type { PinMode } from '../circuit/models';

export const F_CPU = 16_000_000;

export class Mcu {
  readonly cpu: CPU;
  readonly ports: Record<'B' | 'C' | 'D', AVRIOPort>;
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  readonly spi: AVRSPI;
  readonly twi: AVRTWI;
  readonly eeprom: AVREEPROM;
  readonly timers: AVRTimer[];
  private serialListeners: ((byte: number) => void)[] = [];
  private gpioListeners: (() => void)[] = [];

  constructor(flash: Uint8Array) {
    if (flash.length > 0x8000) throw new Error('Firmware exceeds 32 KB flash');
    const prog = new Uint8Array(0x8000).fill(0xff);
    prog.set(flash.subarray(0, Math.min(flash.length, 0x8000)));
    this.cpu = new CPU(new Uint16Array(prog.buffer));
    this.timers = [new AVRTimer(this.cpu, timer0Config), new AVRTimer(this.cpu, timer1Config), new AVRTimer(this.cpu, timer2Config)];
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.usart = new AVRUSART(this.cpu, usart0Config, F_CPU);
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.spi = new AVRSPI(this.cpu, spiConfig, F_CPU);
    this.twi = new AVRTWI(this.cpu, twiConfig, F_CPU);
    this.eeprom = new AVREEPROM(this.cpu, new EEPROMMemoryBackend(1024));
    new AVRWatchdog(this.cpu, watchdogConfig, new AVRClock(this.cpu, F_CPU, clockConfig));
    this.usart.onByteTransmit = (b) => { for (const l of this.serialListeners) l(b); };
    for (const p of Object.values(this.ports)) p.addListener(() => { for (const l of this.gpioListeners) l(); });
  }

  get cycles() { return this.cpu.cycles; }
  get timeSeconds() { return this.cpu.cycles / F_CPU; }

  step() { avrInstruction(this.cpu); this.cpu.tick(); }

  onSerial(cb: (b: number) => void) { this.serialListeners.push(cb); }
  onGpio(cb: () => void) { this.gpioListeners.push(cb); }

  serialWrite(text: string) {
    // queue bytes; USART accepts one byte at a time, so pace them via clock events
    const bytes = Array.from(new TextEncoder().encode(text));
    const bitTime = Math.round((F_CPU / (this.usart.baudRate || 9600)) * 10);
    let k = 0;
    const push = () => {
      if (k >= bytes.length) return;
      if (this.usart.writeByte(bytes[k])) k++;
      this.cpu.addClockEvent(push, bitTime);
    };
    push();
  }

  pinMode(pin: string): PinMode {
    const pp = unoPinToPort(pin);
    if (!pp) return 'input';
    const s = this.ports[pp.port].pinState(pp.bit);
    return s === PinState.High ? 'high' : s === PinState.Low ? 'low' : s === PinState.InputPullUp ? 'input_pullup' : 'input';
  }

  /** drive the input level the firmware reads on PINx */
  setInput(pin: string, high: boolean) {
    const pp = unoPinToPort(pin);
    if (pp) this.ports[pp.port].setPin(pp.bit, high);
  }

  /** raw digital output latch (PORTx value incl. timer overrides) for logic traces */
  outputLevel(pin: string): 0 | 1 | null {
    const m = this.pinMode(pin);
    return m === 'high' ? 1 : m === 'low' ? 0 : null;
  }
}
