# Arduino Simulator Pro

A desktop Arduino Uno simulator for Windows 11, with real engines:
- **Compiler:** bundled avr-gcc 14.1 + ArduinoCore-avr 1.8.6. It does `.ino` preprocessing, caches the core, links with LTO and maps diagnostics to sketch lines. arduino-cli is an optional backend.
- **CPU:** avr8js, instruction-accurate for the ATmega328P (timers/PWM, USART, ADC, SPI, TWI, EEPROM). It runs the compiled HEX.
- **Circuit:** a custom MNA solver with Newton–Raphson for diodes, LEDs and BJTs, and backward Euler for C, L and motors. It is co-simulated with the CPU, event-driven at CPU-cycle resolution.
- **Devices:** HD44780 LCD, servo, buzzer, DHT11, HC-SR04, DC motor, LDR, NTC, TMP36 and 7-segment.
- **Cross-checks:** ngspice (netlists generated from the same model) and simavr on Linux.
- **UI:** Electron + React + Monaco + three.js. It has a breadboard editor, an auto-generated schematic, a 3D view, a logic analyzer and oscilloscope, a serial monitor, VCD/CSV/SPICE/HEX export, an Arabic RTL and English interface, and dark and light themes.

## Build
```
npm install
npm run typecheck && npm test
npm run build                      # dist/main + dist/renderer
scripts/prepare-win-resources.sh   # assemble build-resources/win (needs vendor archives, see script)
npm run dist:win                   # release/Arduino-Simulator-Pro-Setup-<ver>-x64.exe (cross-built on Linux; no wine needed)
npm run dist:linux                 # release/linux-unpacked
```

## Test
- `npm test`: solver and co-simulation tests with real firmware.
- `ASP_RESOURCES_DIR=build-resources/linux npx tsx scripts/acceptance-cli.ts out/`: the acceptance suite.
- `xvfb-run -a node tests/e2e/ui.e2e.mjs out/ [packaged-exe]`: Playwright Electron UI end-to-end test.
- `<app> --self-test <dir>`: the packaged acceptance run. `.github/workflows/windows-selftest.yml` runs it on a real Windows runner.

User guide (Arabic): `docs/USER-GUIDE-AR.md`.
