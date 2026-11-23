#ifndef ASP_DHT_H
#define ASP_DHT_H
#include <Arduino.h>
#define DHT11 11
#define DHT22 22
#define DHT21 21
class DHT {
public:
  DHT(uint8_t pin, uint8_t type, uint8_t count = 6);
  void begin(uint8_t usec = 55);
  float readTemperature(bool fahrenheit = false, bool force = false);
  float readHumidity(bool force = false);
  bool read(bool force = false);
private:
  uint8_t data[5];
  uint8_t _pin, _type;
  uint32_t _lastreadtime, _maxcycles;
  bool _lastresult;
  uint32_t expectPulse(bool level);
};
#endif
