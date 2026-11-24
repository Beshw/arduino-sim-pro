#include "LiquidCrystal_I2C.h"

LiquidCrystal_I2C::LiquidCrystal_I2C(uint8_t addr, uint8_t cols, uint8_t rows)
  : _addr(addr), _cols(cols), _rows(rows), _displayfunction(0), _displaycontrol(0), _displaymode(0), _backlight(LCD_BACKLIGHT) {}

void LiquidCrystal_I2C::init() { begin(_cols, _rows); }

void LiquidCrystal_I2C::begin(uint8_t cols, uint8_t rows, uint8_t charsize) {
  if (cols) _cols = cols;
  if (rows) _rows = rows;
  Wire.begin();
  _displayfunction = LCD_4BITMODE | LCD_5x8DOTS | (_rows > 1 ? LCD_2LINE : LCD_1LINE) | charsize;
  delay(50);
  expanderWrite(_backlight);
  delay(10);
  // HD44780 datasheet figure 24: 4-bit initialisation
  write4bits(0x03 << 4); delayMicroseconds(4500);
  write4bits(0x03 << 4); delayMicroseconds(4500);
  write4bits(0x03 << 4); delayMicroseconds(150);
  write4bits(0x02 << 4);
  command(LCD_FUNCTIONSET | _displayfunction);
  _displaycontrol = LCD_DISPLAYON | LCD_CURSOROFF | LCD_BLINKOFF;
  display();
  clear();
  _displaymode = LCD_ENTRYLEFT | LCD_ENTRYSHIFTDECREMENT;
  command(LCD_ENTRYMODESET | _displaymode);
  home();
}

void LiquidCrystal_I2C::clear() { command(LCD_CLEARDISPLAY); delayMicroseconds(2000); }
void LiquidCrystal_I2C::home() { command(LCD_RETURNHOME); delayMicroseconds(2000); }
void LiquidCrystal_I2C::setCursor(uint8_t col, uint8_t row) {
  static const uint8_t offsets[] = { 0x00, 0x40, 0x14, 0x54 };
  if (row >= _rows) row = _rows - 1;
  command(LCD_SETDDRAMADDR | (col + offsets[row & 3]));
}
void LiquidCrystal_I2C::noDisplay() { _displaycontrol &= ~LCD_DISPLAYON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::display() { _displaycontrol |= LCD_DISPLAYON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::noCursor() { _displaycontrol &= ~LCD_CURSORON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::cursor() { _displaycontrol |= LCD_CURSORON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::noBlink() { _displaycontrol &= ~LCD_BLINKON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::blink() { _displaycontrol |= LCD_BLINKON; command(LCD_DISPLAYCONTROL | _displaycontrol); }
void LiquidCrystal_I2C::scrollDisplayLeft() { command(LCD_CURSORSHIFT | LCD_DISPLAYMOVE | LCD_MOVELEFT); }
void LiquidCrystal_I2C::scrollDisplayRight() { command(LCD_CURSORSHIFT | LCD_DISPLAYMOVE | LCD_MOVERIGHT); }
void LiquidCrystal_I2C::leftToRight() { _displaymode |= LCD_ENTRYLEFT; command(LCD_ENTRYMODESET | _displaymode); }
void LiquidCrystal_I2C::rightToLeft() { _displaymode &= ~LCD_ENTRYLEFT; command(LCD_ENTRYMODESET | _displaymode); }
void LiquidCrystal_I2C::printLeft() { leftToRight(); }
void LiquidCrystal_I2C::printRight() { rightToLeft(); }
void LiquidCrystal_I2C::autoscroll() { _displaymode |= LCD_ENTRYSHIFTINCREMENT; command(LCD_ENTRYMODESET | _displaymode); }
void LiquidCrystal_I2C::noAutoscroll() { _displaymode &= ~LCD_ENTRYSHIFTINCREMENT; command(LCD_ENTRYMODESET | _displaymode); }
void LiquidCrystal_I2C::shiftIncrement() { autoscroll(); }
void LiquidCrystal_I2C::shiftDecrement() { noAutoscroll(); }
void LiquidCrystal_I2C::noBacklight() { _backlight = LCD_NOBACKLIGHT; expanderWrite(0); }
void LiquidCrystal_I2C::backlight() { _backlight = LCD_BACKLIGHT; expanderWrite(0); }
void LiquidCrystal_I2C::setBacklight(uint8_t on) { if (on) backlight(); else noBacklight(); }
void LiquidCrystal_I2C::createChar(uint8_t location, uint8_t charmap[]) {
  location &= 0x7;
  command(LCD_SETCGRAMADDR | (location << 3));
  for (int i = 0; i < 8; i++) write(charmap[i]);
}
void LiquidCrystal_I2C::command(uint8_t value) { send(value, 0); }
size_t LiquidCrystal_I2C::write(uint8_t value) { send(value, Rs); return 1; }
void LiquidCrystal_I2C::send(uint8_t value, uint8_t mode) {
  write4bits((value & 0xF0) | mode);
  write4bits(((value << 4) & 0xF0) | mode);
}
void LiquidCrystal_I2C::write4bits(uint8_t value) { expanderWrite(value); pulseEnable(value); }
void LiquidCrystal_I2C::expanderWrite(uint8_t data) {
  Wire.beginTransmission(_addr);
  Wire.write(data | _backlight);
  Wire.endTransmission();
}
void LiquidCrystal_I2C::pulseEnable(uint8_t data) {
  expanderWrite(data | En); delayMicroseconds(1);
  expanderWrite(data & ~En); delayMicroseconds(50);
}
