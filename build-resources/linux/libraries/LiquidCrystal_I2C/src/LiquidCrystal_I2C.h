// HD44780 LCD over a PCF8574 I2C expander. API-compatible with the widely used
// LiquidCrystal_I2C library. Backpack wiring: P0=RS P1=RW P2=EN P3=backlight P4..P7=D4..D7.
#ifndef ASP_LIQUIDCRYSTAL_I2C_H
#define ASP_LIQUIDCRYSTAL_I2C_H
#include <Arduino.h>
#include <Print.h>
#include <Wire.h>
#define LCD_CLEARDISPLAY 0x01
#define LCD_RETURNHOME 0x02
#define LCD_ENTRYMODESET 0x04
#define LCD_DISPLAYCONTROL 0x08
#define LCD_CURSORSHIFT 0x10
#define LCD_FUNCTIONSET 0x20
#define LCD_SETCGRAMADDR 0x40
#define LCD_SETDDRAMADDR 0x80
#define LCD_ENTRYRIGHT 0x00
#define LCD_ENTRYLEFT 0x02
#define LCD_ENTRYSHIFTINCREMENT 0x01
#define LCD_ENTRYSHIFTDECREMENT 0x00
#define LCD_DISPLAYON 0x04
#define LCD_DISPLAYOFF 0x00
#define LCD_CURSORON 0x02
#define LCD_CURSOROFF 0x00
#define LCD_BLINKON 0x01
#define LCD_BLINKOFF 0x00
#define LCD_DISPLAYMOVE 0x08
#define LCD_MOVERIGHT 0x04
#define LCD_MOVELEFT 0x00
#define LCD_4BITMODE 0x00
#define LCD_2LINE 0x08
#define LCD_1LINE 0x00
#define LCD_5x8DOTS 0x00
#define LCD_BACKLIGHT 0x08
#define LCD_NOBACKLIGHT 0x00
#define En 0x04
#define Rw 0x02
#define Rs 0x01

class LiquidCrystal_I2C : public Print {
public:
  LiquidCrystal_I2C(uint8_t addr, uint8_t cols, uint8_t rows);
  void begin(uint8_t cols = 0, uint8_t rows = 0, uint8_t charsize = LCD_5x8DOTS);
  void init();
  void clear(); void home();
  void noDisplay(); void display(); void noBlink(); void blink(); void noCursor(); void cursor();
  void scrollDisplayLeft(); void scrollDisplayRight(); void leftToRight(); void rightToLeft();
  void autoscroll(); void noAutoscroll();
  void noBacklight(); void backlight(); void setBacklight(uint8_t on);
  void createChar(uint8_t location, uint8_t charmap[]);
  void setCursor(uint8_t col, uint8_t row);
  void printLeft(); void printRight(); void shiftIncrement(); void shiftDecrement();
  void cursor_on() { cursor(); } void cursor_off() { noCursor(); } void blink_on() { blink(); } void blink_off() { noBlink(); }
  void load_custom_character(uint8_t n, uint8_t *rows) { createChar(n, rows); }
  virtual size_t write(uint8_t value);
  void command(uint8_t value);
  using Print::write;
private:
  void send(uint8_t value, uint8_t mode);
  void write4bits(uint8_t value);
  void expanderWrite(uint8_t data);
  void pulseEnable(uint8_t data);
  uint8_t _addr, _cols, _rows, _displayfunction, _displaycontrol, _displaymode, _backlight;
};
#endif
