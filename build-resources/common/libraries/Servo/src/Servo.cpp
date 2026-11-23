#include "Servo.h"
#include <avr/interrupt.h>

struct ServoSlot { uint8_t pin; volatile unsigned int ticks; bool active; };
static ServoSlot slots[MAX_SERVOS];
static uint8_t servoCount = 0;
static volatile int8_t channel = -1;
// Timer1 prescaler 8 -> 2 ticks per microsecond at 16 MHz
#define US_TO_TICKS(us) ((unsigned int)((us) * 2))
#define TICKS_TO_US(t) ((int)((t) / 2))

ISR(TIMER1_COMPA_vect) {
  if (channel < 0) {
    TCNT1 = 0;
  } else if (channel < servoCount && slots[channel].active) {
    digitalWrite(slots[channel].pin, LOW);
  }
  channel++;
  if (channel < servoCount) {
    OCR1A = TCNT1 + slots[channel].ticks;
    if (slots[channel].active) digitalWrite(slots[channel].pin, HIGH);
  } else {
    unsigned int now = TCNT1 + 8;
    OCR1A = (now < US_TO_TICKS(REFRESH_INTERVAL)) ? US_TO_TICKS(REFRESH_INTERVAL) : now;
    channel = -1;
  }
}

static void initTimer() {
  TCCR1A = 0;
  TCCR1B = _BV(CS11); // prescaler 8, normal mode
  TCNT1 = 0;
  OCR1A = US_TO_TICKS(REFRESH_INTERVAL);
  TIFR1 |= _BV(OCF1A);
  TIMSK1 |= _BV(OCIE1A);
}

Servo::Servo() {
  if (servoCount < MAX_SERVOS) {
    servoIndex = servoCount++;
    slots[servoIndex].ticks = US_TO_TICKS(DEFAULT_PULSE_WIDTH);
    slots[servoIndex].active = false;
  } else servoIndex = INVALID_SERVO;
  minUs = MIN_PULSE_WIDTH; maxUs = MAX_PULSE_WIDTH;
}
uint8_t Servo::attach(int pin) { return attach(pin, MIN_PULSE_WIDTH, MAX_PULSE_WIDTH); }
uint8_t Servo::attach(int pin, int mn, int mx) {
  if (servoIndex == INVALID_SERVO) return INVALID_SERVO;
  pinMode(pin, OUTPUT);
  slots[servoIndex].pin = pin;
  minUs = mn; maxUs = mx;
  bool first = true;
  for (uint8_t i = 0; i < servoCount; i++) if (slots[i].active) first = false;
  slots[servoIndex].active = true;
  if (first) initTimer();
  return servoIndex;
}
void Servo::detach() { if (servoIndex != INVALID_SERVO) slots[servoIndex].active = false; }
void Servo::write(int value) {
  if (value < MIN_PULSE_WIDTH) {
    if (value < 0) value = 0;
    if (value > 180) value = 180;
    value = map(value, 0, 180, minUs, maxUs);
  }
  writeMicroseconds(value);
}
void Servo::writeMicroseconds(int value) {
  if (servoIndex == INVALID_SERVO) return;
  if (value < minUs) value = minUs;
  if (value > maxUs) value = maxUs;
  uint8_t s = SREG; cli();
  slots[servoIndex].ticks = US_TO_TICKS(value);
  SREG = s;
}
int Servo::readMicroseconds() { return servoIndex == INVALID_SERVO ? 0 : TICKS_TO_US(slots[servoIndex].ticks); }
int Servo::read() { return map(readMicroseconds() + 1, minUs, maxUs, 0, 180); }
bool Servo::attached() { return servoIndex != INVALID_SERVO && slots[servoIndex].active; }
