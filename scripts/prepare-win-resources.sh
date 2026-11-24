#!/usr/bin/env bash
# Assemble build-resources/win: every external tool the Windows build ships with,
# so that the installed app works offline with no extra downloads.
set -euo pipefail
V=${VENDOR_DIR:-/home/user/vendor-dl}
OUT=build-resources/win
rm -rf "$OUT"; mkdir -p "$OUT/tools/avrdude" "$OUT/tools/arduino-cli" "$OUT/tools/ngspice/bin"
scripts/trim-avr-gcc.sh "$V/win-avrgcc/avr-gcc-14.1.0-x64-windows" "$OUT/tools/avr-gcc" .exe
unzip -q -o "$V/avrdude-v8.0-windows-x64.zip" avrdude.exe avrdude.conf -d "$OUT/tools/avrdude"
unzip -q -o "$V/arduino-cli_1.3.1_Windows_64bit.zip" -d "$OUT/tools/arduino-cli"
cp "$V/ngspice-win/ngspice/bin/ngspice.exe" "$OUT/tools/ngspice/bin/"
cp /usr/lib/gcc/x86_64-w64-mingw32/13-win32/libstdc++-6.dll /usr/lib/gcc/x86_64-w64-mingw32/13-win32/libgcc_s_seh-1.dll "$OUT/tools/ngspice/bin/"
cp -a "$V/ngspice-win/ngspice/share" "$OUT/tools/ngspice/"
rm -rf "$OUT/tools/ngspice/share/man"
cp -a build-resources/linux/arduino-core "$OUT/"
find "$OUT" -xtype l -delete
rm -rf "$OUT/arduino-core/avr/bootloaders" "$OUT/arduino-core/avr/firmwares"
cp -aL build-resources/common/libraries "$OUT/libraries"
cat > "$OUT/THIRD-PARTY.txt" <<'TXT'
Bundled third-party tools (unmodified binaries unless noted):
- avr-gcc 14.1.0 + binutils + avr-libc (GPL/LGPL/BSD) — trimmed to the avr5 (ATmega328P) target
- avrdude 8.0 (GPL-2.0)
- arduino-cli 1.3.1 (GPL-3.0)
- ngspice 45.2 (BSD-3/modified), cross-compiled for Windows x64 (MinGW-w64), with libstdc++/libgcc runtime (GPL + GCC runtime exception)
- ArduinoCore-avr 1.8.6 (LGPL-2.1)
- Servo / LiquidCrystal / LiquidCrystal_I2C / DHT / Stepper compatible libraries written for this project (MIT)
- Fonts embedded in the UI: IBM Plex Sans Arabic and JetBrains Mono (SIL Open Font License 1.1)
TXT
# sanity: every required file exists
for f in tools/avr-gcc/bin/avr-gcc.exe tools/avr-gcc/bin/avr-g++.exe tools/avr-gcc/bin/avr-objcopy.exe tools/avr-gcc/bin/avr-size.exe tools/avr-gcc/bin/avr-gcc-ar.exe \
         tools/avrdude/avrdude.exe tools/avrdude/avrdude.conf tools/arduino-cli/arduino-cli.exe tools/ngspice/bin/ngspice.exe arduino-core/avr/cores/arduino/Arduino.h; do
  [ -f "$OUT/$f" ] || { echo "MISSING $f"; exit 1; }
done
du -sh "$OUT"
