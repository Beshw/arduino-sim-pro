/**
 * Component catalog: geometry (pins on a 0.1" = 10 px grid), metadata and
 * editable properties. Electrical behaviour lives in ../circuit/models.ts.
 */
export interface PinDef { id: string; label: string; x: number; y: number; kind?: 'power' | 'ground' | 'digital' | 'analog' | 'passive' }
export interface PropDef {
  key: string; label: { ar: string; en: string }; type: 'number' | 'select' | 'text';
  default: number | string; unit?: string; min?: number; max?: number; step?: number;
  options?: { value: string; label: string }[];
  /** interactive props are changed live during simulation (button, pot, sensors) */
  live?: boolean;
}
export interface PartDef {
  type: string;
  name: { ar: string; en: string };
  category: 'board' | 'basic' | 'input' | 'output' | 'sensor' | 'display' | 'actuator' | 'power' | 'semiconductor';
  w: number; h: number;
  pins: PinDef[];
  props: PropDef[];
  /** groups of pins that are always electrically connected inside the part */
  internal?: string[][];
  description?: { ar: string; en: string };
  icon?: string;
}

export const GRID = 10;

function header(prefix: string, labels: string[], x0: number, y: number, kinds?: Record<string, PinDef['kind']>): PinDef[] {
  return labels.map((l, i) => ({ id: l, label: l, x: x0 + i * GRID, y, kind: kinds?.[l] ?? (l.startsWith('A') ? 'analog' : l.startsWith('D') ? 'digital' : 'passive') }));
}

// ---------- Arduino Uno R3 (pin positions follow the real 0.1" headers) ----------
const unoTop = header('', ['AREF', 'GND.1', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'], 96, 10)
  .concat(header('', ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'], 186, 10));
const unoBottom = header('', ['IOREF', 'RESET', '3V3', '5V', 'GND.2', 'GND.3', 'VIN'], 126, 200)
  .concat(header('', ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], 206, 200));
for (const p of [...unoTop, ...unoBottom]) {
  if (p.id.startsWith('GND')) { p.kind = 'ground'; p.label = 'GND'; }
  if (['5V', '3V3', 'VIN', 'IOREF'].includes(p.id)) p.kind = 'power';
}

export const UNO_DIGITAL = Array.from({ length: 14 }, (_, i) => `D${i}`);
export const UNO_ANALOG = Array.from({ length: 6 }, (_, i) => `A${i}`);
/** Arduino pin -> AVR port/bit */
export function unoPinToPort(pin: string): { port: 'B' | 'C' | 'D'; bit: number } | null {
  const m = /^D(\d+)$/.exec(pin);
  if (m) {
    const n = +m[1];
    if (n <= 7) return { port: 'D', bit: n };
    if (n <= 13) return { port: 'B', bit: n - 8 };
    return null;
  }
  const a = /^A(\d)$/.exec(pin);
  if (a && +a[1] <= 5) return { port: 'C', bit: +a[1] };
  return null;
}
export const PWM_PINS = ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'];

// ---------- Breadboard (30 columns, rows a-j, 2 power rails each side) ----------
const BB_COLS = 30;
function breadboardPins(): { pins: PinDef[]; internal: string[][] } {
  const pins: PinDef[] = [];
  const internal: string[][] = [];
  const rowsTop = ['a', 'b', 'c', 'd', 'e'];
  const rowsBot = ['f', 'g', 'h', 'i', 'j'];
  const x0 = 20;
  // rails: top (minus/plus), bottom (plus/minus)
  const rails: [string, number][] = [['TN', 10], ['TP', 20], ['BP', 170], ['BN', 180]];
  for (const [r, y] of rails) {
    const grp: string[] = [];
    for (let c = 0; c < BB_COLS; c++) {
      if (c % 6 === 5) continue; // gap groups like a real board
      const id = `${r}${c + 1}`;
      pins.push({ id, label: id, x: x0 + c * GRID, y, kind: r.endsWith('N') ? 'ground' : 'power' });
      grp.push(id);
    }
    internal.push(grp);
  }
  for (let c = 0; c < BB_COLS; c++) {
    const top: string[] = [], bot: string[] = [];
    rowsTop.forEach((r, i) => { const id = `${r}${c + 1}`; pins.push({ id, label: id, x: x0 + c * GRID, y: 40 + i * GRID }); top.push(id); });
    rowsBot.forEach((r, i) => { const id = `${r}${c + 1}`; pins.push({ id, label: id, x: x0 + c * GRID, y: 110 + i * GRID }); bot.push(id); });
    internal.push(top, bot);
  }
  return { pins, internal };
}
const bb = breadboardPins();

const ledColors = [
  { value: 'red', label: 'Red / أحمر' }, { value: 'yellow', label: 'Yellow / أصفر' }, { value: 'green', label: 'Green / أخضر' },
  { value: 'blue', label: 'Blue / أزرق' }, { value: 'white', label: 'White / أبيض' },
];

export const PARTS: PartDef[] = [
  {
    type: 'uno', name: { ar: 'Arduino Uno', en: 'Arduino Uno' }, category: 'board', w: 300, h: 210,
    pins: [...unoTop, ...unoBottom], props: [],
    internal: [['GND.1', 'GND.2', 'GND.3']],
    description: { ar: 'لوحة ATmega328P بتردد 16MHz وذاكرة 32KB', en: 'ATmega328P @16MHz, 32KB flash' },
  },
  {
    type: 'breadboard', name: { ar: 'لوحة تجارب', en: 'Breadboard' }, category: 'basic', w: 330, h: 190,
    pins: bb.pins, internal: bb.internal, props: [],
  },
  {
    type: 'resistor', name: { ar: 'مقاومة', en: 'Resistor' }, category: 'basic', w: 40, h: 10,
    pins: [{ id: 'a', label: '1', x: 0, y: 0 }, { id: 'b', label: '2', x: 40, y: 0 }],
    props: [{ key: 'ohms', label: { ar: 'المقاومة', en: 'Resistance' }, type: 'number', default: 220, unit: 'Ω', min: 0.1, max: 1e8 }],
  },
  {
    type: 'led', name: { ar: 'LED', en: 'LED' }, category: 'output', w: 10, h: 10,
    pins: [{ id: 'anode', label: 'A+', x: 10, y: 0 }, { id: 'cathode', label: 'K−', x: 0, y: 0 }],
    props: [{ key: 'color', label: { ar: 'اللون', en: 'Color' }, type: 'select', default: 'red', options: ledColors }],
  },
  {
    type: 'rgb_led', name: { ar: 'LED ثلاثي الألوان', en: 'RGB LED (CC)' }, category: 'output', w: 30, h: 10,
    pins: [{ id: 'R', label: 'R', x: 0, y: 0 }, { id: 'K', label: 'K', x: 10, y: 0 }, { id: 'G', label: 'G', x: 20, y: 0 }, { id: 'B', label: 'B', x: 30, y: 0 }],
    props: [],
  },
  {
    type: 'button', name: { ar: 'زر ضغط', en: 'Push button' }, category: 'input', w: 30, h: 30,
    pins: [{ id: '1a', label: '1', x: 0, y: 0 }, { id: '2a', label: '2', x: 30, y: 0 }, { id: '1b', label: '1', x: 0, y: 30 }, { id: '2b', label: '2', x: 30, y: 30 }],
    internal: [['1a', '1b'], ['2a', '2b']],
    props: [{ key: 'pressed', label: { ar: 'مضغوط', en: 'Pressed' }, type: 'number', default: 0, min: 0, max: 1, live: true }],
  },
  {
    type: 'switch', name: { ar: 'مفتاح انزلاقي', en: 'Slide switch' }, category: 'input', w: 20, h: 10,
    pins: [{ id: 'c1', label: '1', x: 0, y: 0 }, { id: 'com', label: 'C', x: 10, y: 0 }, { id: 'c2', label: '2', x: 20, y: 0 }],
    props: [{ key: 'position', label: { ar: 'الوضع', en: 'Position' }, type: 'number', default: 0, min: 0, max: 1, live: true }],
  },
  {
    type: 'potentiometer', name: { ar: 'مقاومة متغيرة', en: 'Potentiometer' }, category: 'input', w: 20, h: 10,
    pins: [{ id: 'gnd', label: '1', x: 0, y: 0 }, { id: 'wiper', label: 'W', x: 10, y: 0 }, { id: 'vcc', label: '3', x: 20, y: 0 }],
    props: [
      { key: 'ohms', label: { ar: 'القيمة الكلية', en: 'Total resistance' }, type: 'number', default: 10000, unit: 'Ω', min: 100, max: 1e6 },
      { key: 'position', label: { ar: 'موضع المؤشر', en: 'Wiper position' }, type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, live: true },
    ],
  },
  {
    type: 'ldr', name: { ar: 'حساس ضوء LDR', en: 'Photoresistor (LDR)' }, category: 'sensor', w: 10, h: 10,
    pins: [{ id: 'a', label: '1', x: 0, y: 0 }, { id: 'b', label: '2', x: 10, y: 0 }],
    props: [{ key: 'lux', label: { ar: 'شدة الإضاءة', en: 'Illuminance' }, type: 'number', default: 300, unit: 'lux', min: 0.1, max: 100000, live: true }],
  },
  {
    type: 'ntc', name: { ar: 'ثرمستور NTC', en: 'NTC thermistor' }, category: 'sensor', w: 10, h: 10,
    pins: [{ id: 'a', label: '1', x: 0, y: 0 }, { id: 'b', label: '2', x: 10, y: 0 }],
    props: [
      { key: 'temperature', label: { ar: 'درجة الحرارة', en: 'Temperature' }, type: 'number', default: 25, unit: '°C', min: -40, max: 125, live: true },
      { key: 'r25', label: { ar: 'R عند 25°C', en: 'R at 25°C' }, type: 'number', default: 10000, unit: 'Ω' },
      { key: 'beta', label: { ar: 'معامل B', en: 'Beta' }, type: 'number', default: 3950 },
    ],
  },
  {
    type: 'tmp36', name: { ar: 'حساس حرارة TMP36', en: 'TMP36 temperature' }, category: 'sensor', w: 20, h: 10,
    pins: [{ id: 'vs', label: '+Vs', x: 0, y: 0 }, { id: 'vout', label: 'Vout', x: 10, y: 0 }, { id: 'gnd', label: 'GND', x: 20, y: 0 }],
    props: [{ key: 'temperature', label: { ar: 'درجة الحرارة', en: 'Temperature' }, type: 'number', default: 25, unit: '°C', min: -40, max: 125, live: true }],
  },
  {
    type: 'dht11', name: { ar: 'حساس حرارة ورطوبة DHT11', en: 'DHT11 temp/humidity' }, category: 'sensor', w: 20, h: 10,
    pins: [{ id: 'vcc', label: 'VCC', x: 0, y: 0 }, { id: 'data', label: 'DATA', x: 10, y: 0 }, { id: 'gnd', label: 'GND', x: 20, y: 0 }],
    props: [
      { key: 'temperature', label: { ar: 'درجة الحرارة', en: 'Temperature' }, type: 'number', default: 24, unit: '°C', min: 0, max: 50, live: true },
      { key: 'humidity', label: { ar: 'الرطوبة', en: 'Humidity' }, type: 'number', default: 55, unit: '%', min: 20, max: 90, live: true },
    ],
  },
  {
    type: 'hcsr04', name: { ar: 'حساس مسافة HC-SR04', en: 'HC-SR04 ultrasonic' }, category: 'sensor', w: 30, h: 10,
    pins: [{ id: 'vcc', label: 'VCC', x: 0, y: 0 }, { id: 'trig', label: 'TRIG', x: 10, y: 0 }, { id: 'echo', label: 'ECHO', x: 20, y: 0 }, { id: 'gnd', label: 'GND', x: 30, y: 0 }],
    props: [{ key: 'distance', label: { ar: 'المسافة', en: 'Distance' }, type: 'number', default: 50, unit: 'cm', min: 2, max: 400, live: true }],
  },
  {
    type: 'buzzer', name: { ar: 'طنان', en: 'Piezo buzzer' }, category: 'output', w: 10, h: 10,
    pins: [{ id: 'pos', label: '+', x: 10, y: 0 }, { id: 'neg', label: '−', x: 0, y: 0 }],
    props: [],
  },
  {
    type: 'servo', name: { ar: 'محرك سيرفو', en: 'Servo motor' }, category: 'actuator', w: 20, h: 10,
    pins: [{ id: 'gnd', label: 'GND', x: 0, y: 0 }, { id: 'vcc', label: '5V', x: 10, y: 0 }, { id: 'sig', label: 'SIG', x: 20, y: 0 }],
    props: [],
  },
  {
    type: 'dc_motor', name: { ar: 'محرك DC', en: 'DC motor' }, category: 'actuator', w: 10, h: 10,
    pins: [{ id: 'a', label: '+', x: 0, y: 0 }, { id: 'b', label: '−', x: 10, y: 0 }],
    props: [
      { key: 'ohms', label: { ar: 'مقاومة الملف', en: 'Winding resistance' }, type: 'number', default: 25, unit: 'Ω' },
      { key: 'ratedVoltage', label: { ar: 'الجهد المقنن', en: 'Rated voltage' }, type: 'number', default: 5, unit: 'V' },
    ],
  },
  {
    type: 'lcd1602', name: { ar: 'شاشة LCD 16x2', en: 'LCD 16x2 (HD44780)' }, category: 'display', w: 150, h: 10,
    pins: ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 0 })),
    props: [],
  },
  {
    type: 'lcd1602_i2c', name: { ar: 'شاشة LCD 16x2 بواجهة I2C', en: 'LCD 16x2 I2C (PCF8574)' }, category: 'display', w: 30, h: 10,
    pins: ['GND', 'VCC', 'SDA', 'SCL'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 0 })),
    props: [{ key: 'address', label: { ar: 'عنوان I2C', en: 'I2C address' }, type: 'select', default: '0x27', options: [{ value: '0x27', label: '0x27 (PCF8574)' }, { value: '0x3F', label: '0x3F (PCF8574A)' }] }],
    description: { ar: 'تتصل عبر سلكين فقط: SDA إلى A4 وSCL إلى A5. استخدم مكتبة LiquidCrystal_I2C.', en: 'Two-wire bus: SDA to A4, SCL to A5. Use the LiquidCrystal_I2C library.' },
  },
  {
    type: 'hc595', name: { ar: 'مسجل إزاحة 74HC595', en: '74HC595 shift register' }, category: 'semiconductor', w: 70, h: 30,
    pins: [
      ...['VCC', 'Q0', 'DS', 'OE', 'STCP', 'SHCP', 'MR', 'Q7S'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 0 })),
      ...['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'GND'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 30 })),
    ],
    props: [],
    description: { ar: 'يحوّل 3 منافذ إلى 8 مخارج. يعمل مع shiftOut() ومع SPI (DS←D11، SHCP←D13).', en: 'Turns 3 pins into 8 outputs. Works with shiftOut() and hardware SPI (DS←D11, SHCP←D13).' },
  },
  {
    type: 'seven_segment', name: { ar: 'شاشة 7 مقاطع', en: '7-segment (CC)' }, category: 'display', w: 40, h: 30,
    pins: [
      ...['G', 'F', 'COM1', 'A', 'B'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 0 })),
      ...['E', 'D', 'COM2', 'C', 'DP'].map((l, i) => ({ id: l, label: l, x: i * 10, y: 30 })),
    ],
    internal: [['COM1', 'COM2']],
    props: [{ key: 'color', label: { ar: 'اللون', en: 'Color' }, type: 'select', default: 'red', options: ledColors }],
  },
  {
    type: 'capacitor', name: { ar: 'مكثف', en: 'Capacitor' }, category: 'basic', w: 10, h: 10,
    pins: [{ id: 'a', label: '+', x: 0, y: 0 }, { id: 'b', label: '−', x: 10, y: 0 }],
    props: [{ key: 'farads', label: { ar: 'السعة', en: 'Capacitance' }, type: 'number', default: 0.0001, unit: 'F', min: 1e-12, max: 1 }],
  },
  {
    type: 'inductor', name: { ar: 'ملف', en: 'Inductor' }, category: 'basic', w: 30, h: 10,
    pins: [{ id: 'a', label: '1', x: 0, y: 0 }, { id: 'b', label: '2', x: 30, y: 0 }],
    props: [{ key: 'henries', label: { ar: 'المحاثة', en: 'Inductance' }, type: 'number', default: 0.001, unit: 'H', min: 1e-9, max: 10 }],
  },
  {
    type: 'diode', name: { ar: 'ثنائي 1N4007', en: 'Diode 1N4007' }, category: 'semiconductor', w: 30, h: 10,
    pins: [{ id: 'anode', label: 'A', x: 0, y: 0 }, { id: 'cathode', label: 'K', x: 30, y: 0 }],
    props: [{ key: 'model', label: { ar: 'الطراز', en: 'Model' }, type: 'select', default: '1n4007', options: [{ value: '1n4007', label: '1N4007' }, { value: '1n4148', label: '1N4148' }] }],
  },
  {
    type: 'npn', name: { ar: 'ترانزستور NPN', en: 'NPN transistor (2N2222)' }, category: 'semiconductor', w: 20, h: 10,
    pins: [{ id: 'e', label: 'E', x: 0, y: 0 }, { id: 'b', label: 'B', x: 10, y: 0 }, { id: 'c', label: 'C', x: 20, y: 0 }],
    props: [{ key: 'beta', label: { ar: 'معامل التكبير β', en: 'Gain β' }, type: 'number', default: 150, min: 10, max: 1000 }],
  },
  {
    type: 'dc_supply', name: { ar: 'مصدر جهد', en: 'DC supply' }, category: 'power', w: 20, h: 20,
    pins: [{ id: 'pos', label: '+', x: 0, y: 0 }, { id: 'neg', label: '−', x: 20, y: 0 }],
    props: [{ key: 'volts', label: { ar: 'الجهد', en: 'Voltage' }, type: 'number', default: 9, unit: 'V', min: 0, max: 30 }],
  },
];

export const PART_MAP: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.type, p]));

export function defaultProps(type: string): Record<string, number | string> {
  const def = PART_MAP[type];
  if (!def) throw new Error('Unknown part type ' + type);
  return Object.fromEntries(def.props.map((p) => [p.key, p.default]));
}

/** World position of a part's pin, honouring rotation (0/90/180/270) about the part origin. */
export function pinWorld(part: { type: string; x: number; y: number; rotation?: number }, pinId: string): { x: number; y: number } | null {
  const def = PART_MAP[part.type];
  const pin = def?.pins.find((p) => p.id === pinId);
  if (!pin) return null;
  const r = ((part.rotation ?? 0) % 360 + 360) % 360;
  let { x, y } = pin;
  if (r === 90) [x, y] = [-y, x];
  else if (r === 180) [x, y] = [-x, -y];
  else if (r === 270) [x, y] = [y, -x];
  return { x: part.x + x, y: part.y + y };
}
