#include "Stepper.h"

Stepper::Stepper(int steps, int p1, int p2)
  : direction(0), step_delay(0), number_of_steps(steps), pin_count(2), step_number(0),
    motor_pin_1(p1), motor_pin_2(p2), motor_pin_3(0), motor_pin_4(0), last_step_time(0) {
  pinMode(p1, OUTPUT); pinMode(p2, OUTPUT);
}

Stepper::Stepper(int steps, int p1, int p2, int p3, int p4)
  : direction(0), step_delay(0), number_of_steps(steps), pin_count(4), step_number(0),
    motor_pin_1(p1), motor_pin_2(p2), motor_pin_3(p3), motor_pin_4(p4), last_step_time(0) {
  pinMode(p1, OUTPUT); pinMode(p2, OUTPUT); pinMode(p3, OUTPUT); pinMode(p4, OUTPUT);
}

void Stepper::setSpeed(long rpm) {
  if (rpm <= 0) rpm = 1;
  step_delay = 60UL * 1000UL * 1000UL / number_of_steps / rpm;
}

void Stepper::step(int steps_to_move) {
  int steps_left = steps_to_move < 0 ? -steps_to_move : steps_to_move;
  direction = steps_to_move > 0 ? 1 : 0;
  while (steps_left > 0) {
    unsigned long now = micros();
    if (now - last_step_time >= step_delay) {
      last_step_time = now;
      if (direction == 1) { step_number++; if (step_number == number_of_steps) step_number = 0; }
      else { if (step_number == 0) step_number = number_of_steps; step_number--; }
      steps_left--;
      stepMotor(step_number % 4);
    }
  }
}

void Stepper::stepMotor(int s) {
  if (pin_count == 2) {
    static const byte seq2[4][2] = { {0, 1}, {1, 1}, {1, 0}, {0, 0} };
    digitalWrite(motor_pin_1, seq2[s][0]); digitalWrite(motor_pin_2, seq2[s][1]);
    return;
  }
  static const byte seq4[4][4] = { {1, 0, 1, 0}, {0, 1, 1, 0}, {0, 1, 0, 1}, {1, 0, 0, 1} };
  digitalWrite(motor_pin_1, seq4[s][0]); digitalWrite(motor_pin_2, seq4[s][1]);
  digitalWrite(motor_pin_3, seq4[s][2]); digitalWrite(motor_pin_4, seq4[s][3]);
}
