/** Ready-made projects (real circuits on a breadboard + real sketches). */
import { PART_MAP, defaultProps, GRID } from './parts/catalog';
import { PROJECT_FORMAT, PROJECT_VERSION, Project, PartInstance, Wire } from './project';

const BB = { x: 360, y: 40 };
const UNO = { x: 20, y: 60 };
type Row = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'TN' | 'TP' | 'BP' | 'BN';
export function hole(row: Row, col: number) {
  const x = BB.x + 20 + (col - 1) * GRID;
  const ys: Record<string, number> = { TN: 10, TP: 20, a: 40, b: 50, c: 60, d: 70, e: 80, f: 110, g: 120, h: 130, i: 140, j: 150, BP: 170, BN: 180 };
  return { x, y: BB.y + ys[row] };
}
/** breadboard hole id; rail columns skip every 6th position like a real board */
const holeId = (row: Row, col: number) => {
  if (row.length === 2 && col % 6 === 0) col -= 1;
  return `bb.${row}${col}`;
};

class Builder {
  parts: PartInstance[] = [{ id: 'uno', type: 'uno', x: UNO.x, y: UNO.y, props: {} }, { id: 'bb', type: 'breadboard', x: BB.x, y: BB.y, props: {} }];
  wires: Wire[] = [];
  /** place part so that pin `pinId` sits on the given hole */
  place(id: string, type: string, pinId: string, row: Row, col: number, props: Record<string, number | string> = {}, rotation = 0) {
    const pin = PART_MAP[type].pins.find((p) => p.id === pinId)!;
    const h = hole(row, col);
    this.parts.push({ id, type, x: h.x - pin.x, y: h.y - pin.y, rotation, props: { ...defaultProps(type), ...props } });
    return this;
  }
  free(id: string, type: string, x: number, y: number, props: Record<string, number | string> = {}) {
    this.parts.push({ id, type, x, y, props: { ...defaultProps(type), ...props } });
    return this;
  }
  wire(from: string, to: string, color = '#2f9bff') { this.wires.push({ id: `w${this.wires.length + 1}`, from, to, color }); return this; }
  rails() { // 5V and GND to the top rails
    return this.wire('uno.5V', holeId('TP', 2), '#ff3b3b').wire('uno.GND.2', holeId('TN', 2), '#222a36');
  }
  build(name: string, code: string, probes?: string[]): Project {
    return { format: PROJECT_FORMAT, version: PROJECT_VERSION, name, board: 'uno', code, parts: this.parts, wires: this.wires, probes };
  }
}
const H = holeId;

export interface Example { id: string; title: { ar: string; en: string }; level: 1 | 2 | 3; description: { ar: string; en: string }; project: () => Project }

export const EXAMPLES: Example[] = [
  {
    id: 'demo', level: 2,
    title: { ar: 'دائرة المبتدئين: LED وزر ومقاومة متغيرة وطنان', en: 'Beginner demo: LED, button, pot, buzzer' },
    description: { ar: 'المقاومة المتغيرة تتحكم بسطوع LED عبر PWM، والضغط على الزر يشغل الطنان بتردد يتبع المقاومة.', en: 'Pot controls LED brightness via PWM; holding the button plays a tone that follows the pot.' },
    project: () => new Builder().rails()
      .place('LED1', 'led', 'cathode', 'c', 4, { color: 'red' }).place('R1', 'resistor', 'a', 'b', 5, { ohms: 220 })
      .wire(H('a', 4), H('TN', 4), '#222a36').wire('uno.D9', H('a', 9), '#ffb000')
      .place('BTN1', 'button', '1a', 'e', 12).wire(H('a', 12), 'uno.D2', '#2fd36b').wire(H('j', 15), H('BN', 16), '#222a36')
      .place('POT1', 'potentiometer', 'gnd', 'c', 20, { position: 0.72 }).wire(H('a', 20), H('TN', 20), '#222a36').wire(H('a', 22), H('TP', 23), '#ff3b3b').wire(H('a', 21), 'uno.A0', '#a46bff')
      .place('BZ1', 'buzzer', 'neg', 'c', 26).wire(H('a', 26), H('TN', 26), '#222a36').wire(H('a', 27), 'uno.D8', '#ff7a00')
      .wire(H('BN', 2), H('TN', 1), '#222a36')
      .build('Beginner Circuit Demo', `// Beginner Circuit Demo
// LED, Button, Potentiometer, Buzzer
const int LED_PIN = 9;
const int BUTTON_PIN = 2;
const int POT_PIN = A0;
const int BUZZER_PIN = 8;
bool lastButtonState = HIGH;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int potValue = analogRead(POT_PIN);
  int brightness = map(potValue, 0, 1023, 0, 255);
  analogWrite(LED_PIN, brightness);

  int buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW) {
    tone(BUZZER_PIN, map(potValue, 0, 1023, 200, 2000));
  } else {
    noTone(BUZZER_PIN);
  }
  lastButtonState = buttonState;

  Serial.print("LED:"); Serial.print(brightness);
  Serial.print(",BTN:"); Serial.print(buttonState == LOW ? "PRESSED" : "RELEASED");
  Serial.print(",POT:"); Serial.print(potValue);
  Serial.print(",FREQ:"); Serial.println(buttonState == LOW ? map(potValue, 0, 1023, 200, 2000) : 0);
  delay(150);
}
`, ['D9', 'D8', 'A0']),
  },
  {
    id: 'blink', level: 1,
    title: { ar: 'وميض LED (Blink)', en: 'Blink - LED' },
    description: { ar: 'أول برنامج: تشغيل LED على المنفذ 13 ثانية وإطفاؤه ثانية عبر مقاومة 220Ω.', en: 'Toggle an LED on pin 13 every second through a 220 Ω resistor.' },
    project: () => new Builder().rails()
      .place('LED1', 'led', 'cathode', 'c', 6, { color: 'red' }).place('R1', 'resistor', 'a', 'b', 7, { ohms: 220 })
      .wire(H('a', 6), H('TN', 6), '#222a36').wire('uno.D13', H('a', 11), '#ffb000')
      .build('Blink', `// Blink: LED on D13, 1 second on / 1 second off
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
`, ['D13']),
  },
  {
    id: 'button', level: 1,
    title: { ar: 'زر ضغط يتحكم بـ LED', en: 'Button - LED' },
    description: { ar: 'قراءة زر بمقاومة سحب داخلية INPUT_PULLUP وإضاءة LED عند الضغط.', en: 'Read a button with INPUT_PULLUP and light an LED while pressed.' },
    project: () => new Builder().rails()
      .place('LED1', 'led', 'cathode', 'c', 4, { color: 'green' }).place('R1', 'resistor', 'a', 'b', 5, { ohms: 220 })
      .wire(H('a', 4), H('TN', 4), '#222a36').wire('uno.D13', H('a', 9), '#ffb000')
      .place('BTN1', 'button', '1a', 'e', 14).wire(H('a', 14), 'uno.D2', '#2fd36b').wire(H('j', 17), H('BN', 18), '#222a36').wire(H('BN', 2), H('TN', 1), '#222a36')
      .build('Button LED', `const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = digitalRead(BUTTON) == LOW;
  digitalWrite(LED, pressed ? HIGH : LOW);
  static bool last = false;
  if (pressed != last) {
    Serial.println(pressed ? "PRESSED" : "RELEASED");
    last = pressed;
    delay(20); // debounce
  }
}
`, ['D2', 'D13']),
  },
  {
    id: 'fade', level: 1,
    title: { ar: 'تدرج سطوع LED بـ PWM', en: 'Fade (PWM)' },
    description: { ar: 'analogWrite على المنفذ 9 يولد PWM بتردد 490Hz؛ راقب Duty Cycle في راسم الإشارات.', en: 'analogWrite on pin 9 generates 490 Hz PWM; watch the duty cycle on the scope.' },
    project: () => new Builder().rails()
      .place('LED1', 'led', 'cathode', 'c', 6, { color: 'blue' }).place('R1', 'resistor', 'a', 'b', 7, { ohms: 220 })
      .wire(H('a', 6), H('TN', 6), '#222a36').wire('uno.D9', H('a', 11), '#ffb000')
      .build('Fade', `int brightness = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brightness);
  brightness += step;
  if (brightness <= 0 || brightness >= 255) step = -step;
  delay(30);
}
`, ['D9']),
  },
  {
    id: 'buzzer', level: 1,
    title: { ar: 'طنان: لحن بسيط', en: 'Buzzer melody' },
    description: { ar: 'tone() تولد موجة مربعة بالتردد المطلوب؛ يقيس المحاكي التردد الفعلي.', en: 'tone() generates a square wave; the simulator measures the real frequency.' },
    project: () => new Builder().rails()
      .place('BZ1', 'buzzer', 'neg', 'c', 8).wire(H('a', 8), H('TN', 8), '#222a36').wire(H('a', 9), 'uno.D8', '#ff7a00')
      .build('Buzzer', `int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 8; i++) {
    tone(8, notes[i], 250);
    Serial.print("Note: "); Serial.println(notes[i]);
    delay(300);
  }
  noTone(8);
  delay(1000);
}
`, ['D8']),
  },
  {
    id: 'ldr', level: 2,
    title: { ar: 'حساس الضوء LDR - إنارة ليلية', en: 'LDR night light' },
    description: { ar: 'مقسم جهد من LDR ومقاومة 10kΩ على A0؛ يضيء LED عند انخفاض الإضاءة. غيّر شدة الضوء من خصائص الحساس.', en: 'LDR + 10 kΩ divider on A0; LED turns on in the dark. Change lux in the inspector.' },
    project: () => new Builder().rails()
      .place('LDR1', 'ldr', 'a', 'c', 4, { lux: 300 }).place('R2', 'resistor', 'a', 'd', 5, { ohms: 10000 })
      .wire(H('a', 4), H('TP', 4), '#ff3b3b').wire(H('e', 9), H('TN', 10), '#222a36').wire(H('a', 5), 'uno.A0', '#a46bff')
      .place('LED1', 'led', 'cathode', 'c', 16, { color: 'yellow' }).place('R1', 'resistor', 'a', 'b', 17, { ohms: 220 })
      .wire(H('a', 16), H('TN', 16), '#222a36').wire('uno.D10', H('a', 21), '#ffb000')
      .build('LDR Night Light', `void setup() {
  pinMode(10, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(A0);
  Serial.print("Light: "); Serial.println(light);
  digitalWrite(10, light < 400 ? HIGH : LOW);
  delay(200);
}
`, ['A0', 'D10']),
  },
  {
    id: 'tmp36', level: 2,
    title: { ar: 'حساس الحرارة TMP36', en: 'TMP36 temperature' },
    description: { ar: 'تحويل جهد الحساس (10mV/°C مع إزاحة 0.5V) إلى درجة حرارة.', en: 'Convert TMP36 voltage (10 mV/°C, 0.5 V offset) to °C.' },
    project: () => new Builder().rails()
      .place('T1', 'tmp36', 'vs', 'c', 8, { temperature: 27 }).wire(H('a', 8), H('TP', 8), '#ff3b3b').wire(H('a', 10), H('TN', 10), '#222a36').wire(H('a', 9), 'uno.A1', '#a46bff')
      .build('TMP36', `void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A1);
  float volts = raw * 5.0 / 1024.0;
  float celsius = (volts - 0.5) * 100.0;
  Serial.print("Temp: "); Serial.print(celsius, 1); Serial.println(" C");
  delay(500);
}
`, ['A1']),
  },
  {
    id: 'dht11', level: 3,
    title: { ar: 'DHT11 - حرارة ورطوبة', en: 'DHT11 - Temp & Humidity' },
    description: { ar: 'بروتوكول السلك الواحد بتوقيت حقيقي بالميكروثانية مع مكتبة DHT المضمّنة.', en: 'Single-wire protocol with real microsecond timing using the bundled DHT library.' },
    project: () => new Builder().rails()
      .place('DHT1', 'dht11', 'vcc', 'c', 8, { temperature: 26, humidity: 48 }).wire(H('a', 8), H('TP', 8), '#ff3b3b').wire(H('a', 10), H('TN', 10), '#222a36').wire(H('a', 9), 'uno.D7', '#2fd36b')
      .build('DHT11', `#include <DHT.h>
DHT dht(7, DHT11);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {
    Serial.println("DHT read failed");
    return;
  }
  Serial.print("Humidity: "); Serial.print(h); Serial.print(" %  ");
  Serial.print("Temp: "); Serial.print(t); Serial.println(" C");
}
`, ['D7']),
  },
  {
    id: 'lcd', level: 2,
    title: { ar: 'شاشة LCD 16x2', en: 'LCD 16x2' },
    description: { ar: 'متحكم HD44780 حقيقي بوضع 4 بت؛ الشاشة تفك أوامر الـ firmware من جهود الأطراف.', en: 'HD44780 controller in 4-bit mode decoded from real pin voltages.' },
    project: () => {
      const b = new Builder().rails();
      b.place('LCD1', 'lcd1602', 'VSS', 'j', 8);
      const pin = (name: string) => 8 + ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'].indexOf(name);
      b.wire(H('f', pin('VSS')), H('BN', pin('VSS') + 1), '#222a36').wire(H('f', pin('VDD')), H('BP', pin('VDD') + 1), '#ff3b3b')
        .wire(H('g', pin('V0')), H('BN', pin('V0') + 2), '#222a36').wire(H('g', pin('RW')), H('BN', pin('RW') + 1), '#222a36')
        .wire(H('f', pin('RS')), 'uno.D12', '#2f9bff').wire(H('f', pin('E')), 'uno.D11', '#2fd36b')
        .wire(H('f', pin('D4')), 'uno.D5', '#ffb000').wire(H('f', pin('D5')), 'uno.D4', '#ffb000').wire(H('f', pin('D6')), 'uno.D3', '#ffb000').wire(H('f', pin('D7')), 'uno.D2', '#ffb000')
        .wire(H('f', pin('A')), H('BP', pin('A') - 1), '#ff3b3b').wire(H('f', pin('K')), H('BN', pin('K') + 1), '#222a36')
        .wire(H('TP', 1), H('BP', 1), '#ff3b3b').wire(H('TN', 3), H('BN', 3), '#222a36');
      return b.build('LCD 16x2', `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);
  lcd.print("Arduino Sim Pro");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print(" s");
  delay(250);
}
`);
    },
  },
  {
    id: 'lcd_i2c', level: 2,
    title: { ar: 'شاشة LCD بواجهة I2C', en: 'I2C LCD 16x2' },
    description: { ar: 'ناقل I2C حقيقي على المسجل TWI: البرنامج يمسح العناوين ثم يكتب على الشاشة عبر PCF8574 بسلكين فقط (A4/A5).', en: 'Real I2C on the TWI peripheral: scans the bus, then drives the LCD through a PCF8574 using only A4/A5.' },
    project: () => new Builder().rails()
      .place('LCD1', 'lcd1602_i2c', 'GND', 'j', 20)
      .wire(H('f', 20), H('BN', 21), '#222a36').wire(H('f', 21), H('BP', 22), '#ff3b3b')
      .wire(H('f', 22), 'uno.A4', '#2f9bff').wire(H('f', 23), 'uno.A5', '#2fd36b')
      .wire(H('TP', 1), H('BP', 1), '#ff3b3b').wire(H('TN', 3), H('BN', 3), '#222a36')
      .build('I2C LCD', `#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(9600);
  Wire.begin();
  // I2C scanner: only devices that are wired and powered answer
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("I2C device at 0x");
      Serial.println(addr, HEX);
    }
  }
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello over I2C!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Count: ");
  lcd.print(millis() / 1000);
  delay(250);
}
`),
  },
  {
    id: 'servo', level: 2,
    title: { ar: 'محرك سيرفو تتحكم به مقاومة متغيرة', en: 'Servo + potentiometer' },
    description: { ar: 'مكتبة Servo تولد نبضات 544-2400µs كل 20ms على D9؛ يقيس المحاكي عرض النبضة ويحرك الذراع.', en: 'Servo library emits 544–2400 µs pulses every 20 ms on D9.' },
    project: () => new Builder().rails()
      .place('POT1', 'potentiometer', 'gnd', 'c', 6, { position: 0.3 }).wire(H('a', 6), H('TN', 6), '#222a36').wire(H('a', 8), H('TP', 9), '#ff3b3b').wire(H('a', 7), 'uno.A0', '#a46bff')
      .place('SV1', 'servo', 'gnd', 'c', 18).wire(H('a', 18), H('TN', 18), '#222a36').wire(H('a', 19), H('TP', 19), '#ff3b3b').wire(H('a', 20), 'uno.D9', '#ffb000')
      .build('Servo', `#include <Servo.h>
Servo myServo;

void setup() {
  myServo.attach(9);
  Serial.begin(9600);
}

void loop() {
  int pot = analogRead(A0);
  int angle = map(pot, 0, 1023, 0, 180);
  myServo.write(angle);
  Serial.print("Angle: "); Serial.println(angle);
  delay(50);
}
`, ['D9']),
  },
  {
    id: 'ultrasonic', level: 2,
    title: { ar: 'حساس المسافة HC-SR04', en: 'HC-SR04 distance' },
    description: { ar: 'نبضة TRIG بطول 10µs ثم قياس عرض نبضة ECHO بـ pulseIn.', en: '10 µs TRIG pulse, then pulseIn() on ECHO.' },
    project: () => new Builder().rails()
      .place('US1', 'hcsr04', 'vcc', 'c', 8, { distance: 42 }).wire(H('a', 8), H('TP', 8), '#ff3b3b').wire(H('a', 11), H('TN', 11), '#222a36')
      .wire(H('a', 9), 'uno.D6', '#2fd36b').wire(H('a', 10), 'uno.D5', '#ffb000')
      .build('Ultrasonic', `const int TRIG = 6;
const int ECHO = 5;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duration = pulseIn(ECHO, HIGH, 30000);
  float cm = duration * 0.0343 / 2.0;
  Serial.print("Distance: "); Serial.print(cm, 1); Serial.println(" cm");
  delay(300);
}
`, ['D6', 'D5']),
  },
  {
    id: 'traffic', level: 1,
    title: { ar: 'إشارة مرور', en: 'Traffic light' },
    description: { ar: 'ثلاثة LED بمقاومات منفصلة وتسلسل زمني.', en: 'Three LEDs with individual resistors and a timed sequence.' },
    project: () => new Builder().rails()
      .place('LR', 'led', 'cathode', 'c', 3, { color: 'red' }).place('R1', 'resistor', 'a', 'b', 4, { ohms: 220 }).wire(H('a', 3), H('TN', 3), '#222a36').wire('uno.D12', H('a', 8), '#ff3b3b')
      .place('LY', 'led', 'cathode', 'c', 11, { color: 'yellow' }).place('R2', 'resistor', 'a', 'b', 12, { ohms: 220 }).wire(H('a', 11), H('TN', 11), '#222a36').wire('uno.D11', H('a', 16), '#ffd21f')
      .place('LG', 'led', 'cathode', 'c', 19, { color: 'green' }).place('R3', 'resistor', 'a', 'b', 20, { ohms: 220 }).wire(H('a', 19), H('TN', 19), '#222a36').wire('uno.D10', H('a', 24), '#2fd36b')
      .build('Traffic Light', `void setup() {
  pinMode(12, OUTPUT); pinMode(11, OUTPUT); pinMode(10, OUTPUT);
}

void light(int r, int y, int g, int ms) {
  digitalWrite(12, r); digitalWrite(11, y); digitalWrite(10, g);
  delay(ms);
}

void loop() {
  light(HIGH, LOW, LOW, 3000);
  light(HIGH, HIGH, LOW, 800);
  light(LOW, LOW, HIGH, 3000);
  light(LOW, HIGH, LOW, 1000);
}
`, ['D12', 'D11', 'D10']),
  },
  {
    id: 'rgb', level: 2,
    title: { ar: 'LED ثلاثي الألوان RGB', en: 'RGB LED' },
    description: { ar: 'ثلاث قنوات PWM لمزج الألوان.', en: 'Three PWM channels mix colours.' },
    project: () => new Builder().rails()
      .place('RGB1', 'rgb_led', 'R', 'e', 10).wire(H('a', 11), H('TN', 11), '#222a36')
      .place('R1', 'resistor', 'a', 'c', 2, { ohms: 220 }).wire(H('d', 6), H('d', 10), '#ff3b3b').wire('uno.D9', H('a', 2), '#ff3b3b')
      .place('R2', 'resistor', 'a', 'h', 12, { ohms: 220 }).wire(H('a', 12), H('g', 12), '#2fd36b').wire('uno.D10', H('i', 16), '#2fd36b')
      .place('R3', 'resistor', 'a', 'h', 18, { ohms: 220 }).wire(H('a', 13), H('g', 18), '#2f9bff').wire('uno.D11', H('i', 22), '#2f9bff')
      .build('RGB LED', `void setup() {
  pinMode(9, OUTPUT); pinMode(10, OUTPUT); pinMode(11, OUTPUT);
}

void color(int r, int g, int b) {
  analogWrite(9, r); analogWrite(10, g); analogWrite(11, b);
  delay(700);
}

void loop() {
  color(255, 0, 0);
  color(0, 255, 0);
  color(0, 0, 255);
  color(255, 180, 0);
  color(160, 0, 255);
}
`, ['D9', 'D10', 'D11']),
  },
  {
    id: 'sevenseg', level: 2,
    title: { ar: 'شاشة 7 مقاطع - عداد', en: '7-segment counter' },
    description: { ar: 'عداد 0-9 على شاشة 7 مقاطع بكاثود مشترك.', en: 'Counts 0–9 on a common-cathode display.' },
    project: () => {
      const b = new Builder().rails();
      b.free('SEG1', 'seven_segment', 520, 300, { color: 'red' });
      const segPins: [string, string][] = [['A', 'D2'], ['B', 'D3'], ['C', 'D4'], ['D', 'D5'], ['E', 'D6'], ['F', 'D7'], ['G', 'D8']];
      segPins.forEach(([s, d], i) => {
        b.free(`RS${i}`, 'resistor', 380, 260 + i * 20, { ohms: 330 });
        b.wire(`uno.${d}`, `RS${i}.a`, '#ffb000').wire(`RS${i}.b`, `SEG1.${s}`, '#ff7a00');
      });
      b.wire('SEG1.COM1', 'uno.GND.3', '#222a36');
      return b.build('7-Segment', `const byte digits[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111
};

void setup() {
  for (int p = 2; p <= 8; p++) pinMode(p, OUTPUT);
}

void show(int n) {
  for (int s = 0; s < 7; s++) digitalWrite(2 + s, (digits[n] >> s) & 1);
}

void loop() {
  for (int n = 0; n < 10; n++) { show(n); delay(600); }
}
`);
    },
  },
  {
    id: 'shift595', level: 3,
    title: { ar: 'مسجل إزاحة 74HC595 عبر SPI', en: '74HC595 over SPI' },
    description: { ar: 'عداد على شاشة 7 مقاطع عبر 3 أسلاك فقط: بايت SPI حقيقي من المسجل SPDR يُزاح إلى 74HC595 ثم يُثبَّت بنبضة D10.', en: 'A 7-segment counter on three wires: real SPDR bytes are shifted into a 74HC595 and latched by a D10 pulse.' },
    project: () => {
      const b = new Builder().rails();
      b.place('U1', 'hc595', 'VCC', 'e', 3);
      b.wire(H('a', 3), H('TP', 3), '#ff3b3b').wire(H('a', 9), H('TP', 9), '#ff3b3b') // VCC, MR high
        .wire(H('a', 6), H('TN', 7), '#222a36').wire(H('j', 10), H('BN', 10), '#222a36') // OE low, GND
        .wire(H('a', 5), 'uno.D11', '#2f9bff').wire(H('a', 8), 'uno.D13', '#2fd36b').wire(H('a', 7), 'uno.D10', '#ffb000')
        .wire(H('TP', 1), H('BP', 1), '#ff3b3b').wire(H('TN', 3), H('BN', 3), '#222a36');
      b.free('SEG1', 'seven_segment', 560, 300, { color: 'red' });
      const q: [string, string][] = [['A', H('b', 4)], ['B', H('j', 3)], ['C', H('j', 4)], ['D', H('j', 5)], ['E', H('j', 6)], ['F', H('j', 7)], ['G', H('j', 8)]];
      q.forEach(([seg, hole], i) => {
        b.free(`RS${i}`, 'resistor', 430, 250 + i * 20, { ohms: 330 });
        b.wire(hole, `RS${i}.a`, '#ff7a00').wire(`RS${i}.b`, `SEG1.${seg}`, '#ff7a00');
      });
      b.wire('SEG1.COM1', 'uno.GND.3', '#222a36');
      return b.build('74HC595', `#include <SPI.h>

const int LATCH_PIN = 10;  // STCP
const byte digits[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111
};

void show(byte pattern) {
  digitalWrite(LATCH_PIN, LOW);
  SPI.transfer(pattern);        // 8 bits out on MOSI (D11) / SCK (D13)
  digitalWrite(LATCH_PIN, HIGH); // rising edge copies them to Q0..Q7
}

void setup() {
  pinMode(LATCH_PIN, OUTPUT);
  SPI.begin();
  Serial.begin(9600);
}

void loop() {
  for (int n = 0; n < 10; n++) {
    show(digits[n]);
    Serial.print("digit ");
    Serial.println(n);
    delay(500);
  }
}
`);
    },
  },
  {
    id: 'piano', level: 1,
    title: { ar: 'بيانو صغير بخمسة مفاتيح', en: 'Mini piano (5 keys)' },
    description: { ar: 'خمسة أزرار بمقاومات سحب داخلية؛ كل زر يعزف نغمة مختلفة على الطنان. اضغط الأزرار بالفأرة أثناء التشغيل.', en: 'Five buttons with internal pull-ups; each plays a different note on the buzzer. Press them with the mouse while running.' },
    project: () => {
      const b = new Builder().rails().wire(H('BN', 2), H('TN', 1), '#222a36');
      [2, 6, 10, 14, 18].forEach((c, i) => {
        b.place(`K${i + 1}`, 'button', '1a', 'e', c).wire(H('a', c), `uno.D${2 + i}`, ['#ff3b3b', '#ffb000', '#ffd21f', '#2fd36b', '#2f9bff'][i]).wire(H('j', c + 3), H('BN', c + 3), '#222a36');
      });
      b.place('BZ1', 'buzzer', 'neg', 'c', 25).wire(H('a', 25), H('TN', 25), '#222a36').wire(H('a', 26), 'uno.D8', '#ff7a00');
      return b.build('Mini Piano', `const int KEYS[5]  = {2, 3, 4, 5, 6};
const int NOTES[5] = {262, 294, 330, 349, 392}; // C D E F G
const int BUZZER = 8;

void setup() {
  for (int i = 0; i < 5; i++) pinMode(KEYS[i], INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int playing = -1;
  for (int i = 0; i < 5; i++) {
    if (digitalRead(KEYS[i]) == LOW) { playing = i; break; }  // pressed = LOW
  }
  if (playing >= 0) {
    tone(BUZZER, NOTES[playing]);
    Serial.print("Note ");
    Serial.println(NOTES[playing]);
  } else {
    noTone(BUZZER);
  }
  delay(30);
}
`);
    },
  },
  {
    id: 'fsr', level: 1,
    title: { ar: 'حساس القوة FSR', en: 'Force sensor (FSR)' },
    description: { ar: 'مقسم جهد من FSR ومقاومة 10kΩ على A0؛ كلما زاد الضغط زاد سطوع LED. غيّر قوة الضغط من الخصائص.', en: 'FSR + 10 kΩ divider on A0; more force, brighter LED. Change the force in the inspector.' },
    project: () => new Builder().rails()
      .place('FSR1', 'fsr', 'a', 'c', 4, { force: 300 }).place('R2', 'resistor', 'a', 'd', 5, { ohms: 10000 })
      .wire(H('a', 4), H('TP', 4), '#ff3b3b').wire(H('e', 9), H('TN', 10), '#222a36').wire(H('a', 5), 'uno.A0', '#a46bff')
      .place('LED1', 'led', 'cathode', 'c', 16, { color: 'blue' }).place('R1', 'resistor', 'a', 'b', 17, { ohms: 220 })
      .wire(H('a', 16), H('TN', 16), '#222a36').wire('uno.D9', H('a', 21), '#ffb000')
      .build('FSR', `const int FSR_PIN = A0;
const int LED = 9;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(FSR_PIN);          // 0..1023
  analogWrite(LED, map(raw, 0, 1023, 0, 255));
  Serial.print("FSR: ");
  Serial.print(raw);
  if (raw < 10) Serial.println("  (no touch)");
  else if (raw < 300) Serial.println("  (light)");
  else if (raw < 700) Serial.println("  (medium)");
  else Serial.println("  (hard)");
  delay(200);
}
`),
  },
  {
    id: 'stepper', level: 2,
    title: { ar: 'محرك خطوي 28BYJ-48', en: 'Stepper motor 28BYJ-48' },
    description: { ar: 'مكتبة Stepper تشغّل الملفات الأربعة بالتتابع عبر ULN2003: دورة كاملة (2048 خطوة) ثم نصف دورة للخلف.', en: 'The Stepper library energises the four coils in sequence through a ULN2003: one full turn (2048 steps), then half a turn back.' },
    project: () => new Builder().rails()
      .free('ST1', 'stepper', 520, 300)
      .wire('uno.D8', 'ST1.IN1', '#ff3b3b').wire('uno.D9', 'ST1.IN2', '#ffb000').wire('uno.D10', 'ST1.IN3', '#ffd21f').wire('uno.D11', 'ST1.IN4', '#2fd36b')
      .wire(H('TP', 20), 'ST1.VCC', '#ff3b3b').wire(H('TN', 20), 'ST1.GND', '#222a36')
      .build('Stepper', `#include <Stepper.h>

const int STEPS_PER_REV = 2048;          // 28BYJ-48 with its 1:64 gearbox
// IN1, IN3, IN2, IN4 order gives the correct coil sequence
Stepper motor(STEPS_PER_REV, 8, 10, 9, 11);

void setup() {
  motor.setSpeed(12);                    // rpm
  Serial.begin(9600);
}

void loop() {
  Serial.println("one turn clockwise");
  motor.step(STEPS_PER_REV);
  delay(500);
  Serial.println("half turn back");
  motor.step(-STEPS_PER_REV / 2);
  delay(500);
}
`),
  },
  {
    id: 'smart_traffic', level: 2,
    title: { ar: 'مشروع: إشارة مرور ذكية', en: 'Project: smart traffic light' },
    description: { ar: 'حساس المسافة يقيس بُعد السيارة، والإشارة تتحول من الأخضر إلى الأصفر ثم الأحمر كلما اقتربت. غيّر المسافة من الخصائص.', en: 'The distance sensor measures how far the car is; the light turns green → yellow → red as it gets closer. Change the distance in the inspector.' },
    project: () => new Builder().rails()
      .place('US1', 'hcsr04', 'vcc', 'c', 2, { distance: 80 }).wire(H('a', 2), H('TP', 2), '#ff3b3b').wire(H('a', 5), H('TN', 5), '#222a36')
      .wire(H('a', 3), 'uno.D6', '#2fd36b').wire(H('a', 4), 'uno.D5', '#ffb000')
      .place('LR', 'led', 'cathode', 'c', 9, { color: 'red' }).place('R1', 'resistor', 'a', 'b', 10, { ohms: 220 }).wire(H('a', 9), H('TN', 9), '#222a36').wire('uno.D12', H('a', 14), '#ff3b3b')
      .place('LY', 'led', 'cathode', 'c', 16, { color: 'yellow' }).place('R2', 'resistor', 'a', 'b', 17, { ohms: 220 }).wire(H('a', 16), H('TN', 16), '#222a36').wire('uno.D11', H('a', 21), '#ffd21f')
      .place('LG', 'led', 'cathode', 'c', 23, { color: 'green' }).place('R3', 'resistor', 'a', 'b', 24, { ohms: 220 }).wire(H('a', 23), H('TN', 23), '#222a36').wire('uno.D10', H('a', 28), '#2fd36b')
      .build('Smart Traffic Light', `const int TRIG = 6, ECHO = 5;
const int RED = 12, YELLOW = 11, GREEN = 10;

float readCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  return us * 0.0343 / 2.0;
}

void show(int r, int y, int g) {
  digitalWrite(RED, r); digitalWrite(YELLOW, y); digitalWrite(GREEN, g);
}

void setup() {
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(RED, OUTPUT); pinMode(YELLOW, OUTPUT); pinMode(GREEN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  float cm = readCm();
  Serial.print("Car at "); Serial.print(cm, 0); Serial.print(" cm -> ");
  if (cm > 50)      { show(LOW, LOW, HIGH); Serial.println("GO"); }
  else if (cm > 20) { show(LOW, HIGH, LOW); Serial.println("SLOW"); }
  else              { show(HIGH, LOW, LOW); Serial.println("STOP"); }
  delay(200);
}
`, ['D12', 'D11', 'D10']),
  },
  {
    id: 'motor', level: 3,
    title: { ar: 'محرك DC بترانزستور وPWM', en: 'DC motor + NPN + PWM' },
    description: { ar: 'ترانزستور NPN كمفتاح، ثنائي حماية عكسي، وتحكم بالسرعة عبر PWM؛ تحسب السرعة من نموذج كهروميكانيكي.', en: 'NPN switch, flyback diode, PWM speed control with an electromechanical model.' },
    project: () => new Builder().rails()
      .place('Q1', 'npn', 'e', 'c', 10).wire(H('a', 10), H('TN', 10), '#222a36')
      .place('RB', 'resistor', 'b', 'd', 11, { ohms: 1000 }).wire('uno.D3', H('a', 7), '#ffb000')
      .free('M1', 'dc_motor', 520, 300, { ohms: 25, ratedVoltage: 5 })
      .free('D1', 'diode', 600, 260, { model: '1n4007' })
      .wire(H('a', 12), 'M1.b', '#2f9bff').wire('M1.a', H('TP', 14), '#ff3b3b')
      .wire('D1.anode', 'M1.b', '#2f9bff').wire('D1.cathode', 'M1.a', '#ff3b3b')
      .build('DC Motor', `void setup() {
  pinMode(3, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  for (int s = 0; s <= 255; s += 51) {
    analogWrite(3, s);
    Serial.print("PWM: "); Serial.println(s);
    delay(1500);
  }
}
`, ['D3']),
  },
  {
    id: 'rc', level: 3,
    title: { ar: 'شحن مكثف RC وقياسه بـ ADC', en: 'RC charge measured by ADC' },
    description: { ar: 'D7 يشحن مكثف 100µF عبر 10kΩ (τ = 1s)؛ قراءة A0 كل 100ms تظهر منحنى الشحن الأسي.', en: 'D7 charges 100 µF through 10 kΩ (τ = 1 s); A0 shows the exponential curve.' },
    project: () => new Builder().rails()
      .place('R1', 'resistor', 'a', 'c', 6, { ohms: 10000 }).place('C1', 'capacitor', 'a', 'd', 10, { farads: 0.0001 })
      .wire('uno.D7', H('a', 6), '#2fd36b').wire(H('a', 11), H('TN', 11), '#222a36').wire(H('a', 10), 'uno.A0', '#a46bff')
      .build('RC Charge', `void setup() {
  pinMode(7, OUTPUT);
  Serial.begin(115200);
  digitalWrite(7, LOW);
  delay(3000);            // discharge
  digitalWrite(7, HIGH);  // start charging
}

void loop() {
  int v = analogRead(A0);
  Serial.print(millis()); Serial.print(" ms, Vc = ");
  Serial.println(v * 5.0 / 1023.0, 3);
  delay(100);
}
`, ['D7', 'A0']),
  },
  {
    id: 'echo', level: 1,
    title: { ar: 'الاتصال التسلسلي: صدى الرسائل', en: 'Serial echo' },
    description: { ar: 'اكتب رسالة في المراقب التسلسلي وسيعيدها البرنامج بأحرف كبيرة.', en: 'Type in the Serial Monitor; the sketch echoes it in upper case.' },
    project: () => new Builder().build('Serial Echo', `void setup() {
  Serial.begin(9600);
  Serial.println("Type something...");
}

void loop() {
  if (Serial.available()) {
    String s = Serial.readStringUntil('\\n');
    s.toUpperCase();
    Serial.print("Echo: ");
    Serial.println(s);
  }
}
`),
  },
];
