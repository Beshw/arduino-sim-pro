#!/usr/bin/env bash
# Copy an avr-gcc distribution keeping only what ATmega328P (avr5) builds need.
# usage: trim-avr-gcc.sh <src> <dst> [exe-suffix]
set -euo pipefail
SRC=$1; DST=$2; X=${3:-}
V=$(ls "$SRC/lib/gcc/avr")
rm -rf "$DST"; mkdir -p "$DST/bin" "$DST/avr/lib" "$DST/lib/gcc/avr/$V" "$DST/libexec/gcc/avr"
for t in avr-gcc avr-g++ avr-gcc-ar avr-ar avr-objcopy avr-size avr-as avr-ld avr-nm avr-gcc-nm avr-objdump avr-cpp avr-c++; do
  [ -e "$SRC/bin/$t$X" ] && cp -a "$SRC/bin/$t$X" "$DST/bin/"
done
cp -a "$SRC"/bin/*.dll "$DST/bin/" 2>/dev/null || true
cp -a "$SRC/avr/bin" "$DST/avr/"
cp -a "$SRC/avr/include" "$DST/avr/"
cp -a "$SRC/avr/lib/avr5" "$SRC/avr/lib/ldscripts" "$DST/avr/lib/"
G="$SRC/lib/gcc/avr/$V"
cp -a "$G/avr5" "$G/device-specs" "$G/include" "$G/include-fixed" "$G/libgcc.a" "$DST/lib/gcc/avr/$V/"
[ -d "$SRC/lib/bfd-plugins" ] && cp -a "$SRC/lib/bfd-plugins" "$DST/lib/"
mkdir -p "$DST/libexec/gcc/avr/$V"
for f in cc1 cc1plus collect2 lto1 lto-wrapper; do cp -a "$SRC/libexec/gcc/avr/$V/$f$X" "$DST/libexec/gcc/avr/$V/"; done
cp -a "$SRC/libexec/gcc/avr/$V"/liblto_plugin* "$DST/libexec/gcc/avr/$V/" 2>/dev/null || true
[ -f "$SRC/README.txt" ] && cp "$SRC/README.txt" "$DST/"
# device-specs: keep only the ATmega328P family
find "$DST/lib/gcc/avr/$V/device-specs" -type f ! -name 'specs-atmega328*' ! -name 'specs-avr5' -delete
echo "trimmed $(du -sh "$DST" | cut -f1) -> $DST"
