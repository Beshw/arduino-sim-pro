// HD44780 LCD driver, API-compatible with Arduino LiquidCrystal.
#ifndef ASP_LIQUIDCRYSTAL_H
#define ASP_LIQUIDCRYSTAL_H
#include <Arduino.h>
#include <Print.h>
#define LCD_CLEARDISPLAY 0x01
#define LCD_RETURNHOME 0x02
#define LCD_ENTRYMODESET 0x04
#define LCD_DISPLAYCONTROL 0x08
#define LCD_CURSORSHIFT 0x10
#define LCD_FUNCTIONSET 0x20
#define LCD_SETCGRAMADDR 0x40
#define LCD_SETDDRAMADDR 0x80
#define LCD_ENTRYLEFT 0x02
#define LCD_ENTRYSHIFTINCREMENT 0x01
#define LCD_DISPLAYON 0x04
#define LCD_CURSORON 0x02
#define LCD_BLINKON 0x01
#define LCD_DISPLAYMOVE 0x08
#define LCD_MOVERIGHT 0x04
#define LCD_8BITMODE 0x10
#define LCD_2LINE 0x08
#define LCD_5x10DOTS 0x04
class LiquidCrystal : public Print {
public:
  LiquidCrystal(uint8_t rs, uint8_t enable, uint8_t d0, uint8_t d1, uint8_t d2, uint8_t d3, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7);
  LiquidCrystal(uint8_t rs, uint8_t rw, uint8_t enable, uint8_t d0, uint8_t d1, uint8_t d2, uint8_t d3, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7);
  LiquidCrystal(uint8_t rs, uint8_t rw, uint8_t enable, uint8_t d0, uint8_t d1, uint8_t d2, uint8_t d3);
  LiquidCrystal(uint8_t rs, uint8_t enable, uint8_t d0, uint8_t d1, uint8_t d2, uint8_t d3);
  void init(uint8_t fourbitmode, uint8_t rs, uint8_t rw, uint8_t enable, uint8_t d0, uint8_t d1, uint8_t d2, uint8_t d3, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7);
  void begin(uint8_t cols, uint8_t rows, uint8_t charsize = 0);
  void clear(); void home();
  void noDisplay(); void display(); void noBlink(); void blink(); void noCursor(); void cursor();
  void scrollDisplayLeft(); void scrollDisplayRight(); void leftToRight(); void rightToLeft();
  void autoscroll(); void noAutoscroll();
  void setRowOffsets(int row1, int row2, int row3, int row4);
  void createChar(uint8_t location, uint8_t charmap[]);
  void setCursor(uint8_t col, uint8_t row);
  virtual size_t write(uint8_t value);
  void command(uint8_t value);
  using Print::write;
private:
  void send(uint8_t value, uint8_t mode);
  void write4bits(uint8_t value); void write8bits(uint8_t value); void pulseEnable();
  uint8_t _rs_pin, _rw_pin, _enable_pin, _data_pins[8];
  uint8_t _displayfunction, _displaycontrol, _displaymode, _numlines;
  uint8_t _row_offsets[4];
};
#endif
