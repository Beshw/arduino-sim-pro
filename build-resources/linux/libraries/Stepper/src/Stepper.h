// Stepper motor driver, API-compatible with the Arduino Stepper library
// (2-wire and 4-wire, full-step two-phase sequence).
#ifndef ASP_STEPPER_H
#define ASP_STEPPER_H
#include <Arduino.h>
class Stepper {
public:
  Stepper(int number_of_steps, int motor_pin_1, int motor_pin_2);
  Stepper(int number_of_steps, int motor_pin_1, int motor_pin_2, int motor_pin_3, int motor_pin_4);
  void setSpeed(long whatSpeed);
  void step(int number_of_steps);
  int version(void) { return 5; }
private:
  void stepMotor(int this_step);
  int direction;
  unsigned long step_delay;
  int number_of_steps;
  int pin_count;
  int step_number;
  int motor_pin_1, motor_pin_2, motor_pin_3, motor_pin_4;
  unsigned long last_step_time;
};
#endif
