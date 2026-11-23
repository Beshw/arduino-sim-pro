#include "DHT.h"
#define TIMEOUT UINT32_MAX
DHT::DHT(uint8_t pin, uint8_t type, uint8_t) : _pin(pin), _type(type) {
  _maxcycles = microsecondsToClockCycles(1000);
}
void DHT::begin(uint8_t) { pinMode(_pin, INPUT_PULLUP); _lastreadtime = millis() - 2000; _lastresult = false; }
float DHT::readTemperature(bool f, bool force) {
  float t = NAN;
  if (read(force)) {
    if (_type == DHT11) { t = data[2]; if (data[3] & 0x80) t = -1 - t; t += (data[3] & 0x0f) * 0.1; }
    else { t = ((word)(data[2] & 0x7F)) << 8 | data[3]; t *= 0.1; if (data[2] & 0x80) t *= -1; }
    if (f) t = t * 1.8 + 32;
  }
  return t;
}
float DHT::readHumidity(bool force) {
  float h = NAN;
  if (read(force)) {
    if (_type == DHT11) h = data[0] + data[1] * 0.1;
    else { h = ((word)data[0]) << 8 | data[1]; h *= 0.1; }
  }
  return h;
}
uint32_t DHT::expectPulse(bool level) {
  uint32_t count = 0;
  uint8_t bit = digitalPinToBitMask(_pin);
  volatile uint8_t *port = portInputRegister(digitalPinToPort(_pin));
  uint8_t want = level ? bit : 0;
  while ((*port & bit) == want) { if (count++ >= _maxcycles) return TIMEOUT; }
  return count;
}
bool DHT::read(bool force) {
  uint32_t now = millis();
  if (!force && ((now - _lastreadtime) < 2000)) return _lastresult;
  _lastreadtime = now;
  data[0] = data[1] = data[2] = data[3] = data[4] = 0;
  pinMode(_pin, INPUT_PULLUP); delay(1);
  pinMode(_pin, OUTPUT); digitalWrite(_pin, LOW);
  if (_type == DHT11) delay(20); else delayMicroseconds(1100);
  uint32_t cycles[80];
  {
    pinMode(_pin, INPUT_PULLUP);
    delayMicroseconds(10);
    noInterrupts();
    // wait for the sensor to pull low, then the 80us low / 80us high preamble
    if (expectPulse(HIGH) == TIMEOUT) { interrupts(); _lastresult = false; return false; }
    if (expectPulse(LOW) == TIMEOUT) { interrupts(); _lastresult = false; return false; }
    if (expectPulse(HIGH) == TIMEOUT) { interrupts(); _lastresult = false; return false; }
    for (int i = 0; i < 80; i += 2) { cycles[i] = expectPulse(LOW); cycles[i + 1] = expectPulse(HIGH); }
    interrupts();
  }
  for (int i = 0; i < 40; ++i) {
    uint32_t lowCycles = cycles[2 * i], highCycles = cycles[2 * i + 1];
    if (lowCycles == TIMEOUT || highCycles == TIMEOUT) { _lastresult = false; return false; }
    data[i / 8] <<= 1;
    if (highCycles > lowCycles) data[i / 8] |= 1;
  }
  _lastresult = (data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xFF));
  return _lastresult;
}
